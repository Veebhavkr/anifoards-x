"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Pipeline = {
  id: string;
  name: string;
};

type PipelineStage = {
  id: string;
  name: string;
  probability: number;
  position: number;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type Company = {
  id: string;
  name: string;
};

type ExistingDeal = {
  id: string;
  title: string;
  description: string | null;
  value: number;
  currency: string;
  expected_close_date: string | null;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string | null;
};

type OrganizationMember = {
  user_id: string;
  role: string;
  profile?: { full_name: string | null; email: string | null } | null;
};

type DealFormProps = {
  deal?: ExistingDeal | null;
  onSuccess?: () => void;
};

export default function DealForm({
  deal = null,
  onSuccess,
}: DealFormProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [expectedCloseDate, setExpectedCloseDate] =
    useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadFormData() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const organizationId = membership?.organization_id;

    if (!organizationId) {
      setError("No organization found.");
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", organizationId);

    const memberUserIds = (memberRows ?? []).map((member) => member.user_id);
    const { data: profiles } = memberUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", memberUserIds)
      : { data: [] };

    const profileMap = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile])
    );

    const loadedMembers = (memberRows ?? []).map((member) => ({
      ...member,
      profile: profileMap.get(member.user_id) ?? null,
    }));

    const activeMember = loadedMembers.find(
      (member) => member.user_id === user.id
    );
    setMembers(loadedMembers);
    setCurrentRole(activeMember?.role ?? "");

    const [
      pipelinesResult,
      contactsResult,
      companiesResult,
    ] = await Promise.all([
      supabase
        .from("pipelines")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),

      supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),

      supabase
        .from("companies")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    if (pipelinesResult.error) {
      setError(pipelinesResult.error.message);
      setLoading(false);
      return;
    }

    setPipelines(pipelinesResult.data ?? []);
    setContacts(contactsResult.data ?? []);
    setCompanies(companiesResult.data ?? []);

    const firstPipeline = pipelinesResult.data?.[0];
    const initialPipelineId = deal?.pipeline_id || firstPipeline?.id || "";

    setTitle(deal?.title ?? "");
    setDescription(deal?.description ?? "");
    setValue(deal ? String(deal.value ?? "") : "");
    setCurrency(deal?.currency ?? "INR");
    setExpectedCloseDate(deal?.expected_close_date ?? "");
    setContactId(deal?.contact_id ?? "");
    setCompanyId(deal?.company_id ?? "");
    setOwnerId(deal?.owner_id ?? user.id);

    if (initialPipelineId) {
      setPipelineId(initialPipelineId);
      await loadStages(initialPipelineId);
      if (deal?.stage_id) {
        setStageId(deal.stage_id);
      }
    }

    setLoading(false);
  }

  async function loadStages(selectedPipelineId: string) {
    const supabase = createClient();

    const { data, error: stageError } = await supabase
      .from("pipeline_stages")
      .select("id, name, probability, position")
      .eq("pipeline_id", selectedPipelineId)
      .order("position", { ascending: true });

    if (stageError) {
      setError(stageError.message);
      return;
    }

    const stageData = data ?? [];

    setStages(stageData);

    if (stageData.length > 0) {
      setStageId(stageData[0].id);
    } else {
      setStageId("");
    }
  }

  useEffect(() => {
    loadFormData();
  }, [deal?.id]);

  async function handlePipelineChange(
    selectedPipelineId: string
  ) {
    setPipelineId(selectedPipelineId);
    setStageId("");
    setStages([]);
    setError("");

    await loadStages(selectedPipelineId);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setSaving(false);
      return;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setError("No organization found.");
      setSaving(false);
      return;
    }

    if (!title.trim()) {
      setError("Please enter a deal title.");
      setSaving(false);
      return;
    }

    if (!pipelineId) {
      setError("Please select a pipeline.");
      setSaving(false);
      return;
    }

    if (!stageId) {
      setError("Please select a pipeline stage.");
      setSaving(false);
      return;
    }

    const dealValue = Number(value || 0);

    if (Number.isNaN(dealValue) || dealValue < 0) {
      setError("Deal value must be 0 or greater.");
      setSaving(false);
      return;
    }

    const dealPayload = {
      pipeline_id: pipelineId,
      stage_id: stageId,
      title: title.trim(),
      description: description.trim() || null,
      value: dealValue,
      currency,
      expected_close_date: expectedCloseDate || null,
      contact_id: contactId || null,
      company_id: companyId || null,
    };

    const isFullAccess = currentRole === "owner" || currentRole === "admin";
    const selectedOwnerId = isFullAccess ? ownerId || user.id : user.id;

    const updatePayload = isFullAccess
      ? { ...dealPayload, owner_id: selectedOwnerId }
      : dealPayload;

    const dealError = deal
      ? (
          await supabase
            .from("deals")
            .update(updatePayload)
            .eq("id", deal.id)
            .eq("organization_id", membership.organization_id)
        ).error
      : (
          await supabase
  .from("deals")
  .insert({
    organization_id: membership.organization_id,
    ...dealPayload,
    owner_id: selectedOwnerId,
    created_by: user.id,
  })
        ).error;

    if (dealError) {
      setError(dealError.message);
      setSaving(false);
      return;
    }

    setTitle("");
    setDescription("");
    setValue("");
    setCurrency("INR");
    setExpectedCloseDate("");
    setContactId("");
    setCompanyId("");
    setOwnerId(currentUserId);

    setSaving(false);

    onSuccess?.();
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">
          Loading deal form...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {pipelines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-gray-500">
            Create a sales pipeline before creating a deal.
          </p>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Deal Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border px-4 py-3 outline-none"
          />

          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            rows={3}
            className="w-full rounded-lg border px-4 py-3 outline-none"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <select
              value={pipelineId}
              onChange={(e) =>
                handlePipelineChange(e.target.value)
              }
              className="w-full rounded-lg border px-4 py-3 outline-none"
            >
              <option value="">Select Pipeline</option>

              {pipelines.map((pipeline) => (
                <option
                  key={pipeline.id}
                  value={pipeline.id}
                >
                  {pipeline.name}
                </option>
              ))}
            </select>

            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              disabled={stages.length === 0}
              className="w-full rounded-lg border px-4 py-3 outline-none disabled:bg-gray-100"
            >
              <option value="">Select Stage</option>

              {stages.map((stage) => (
                <option
                  key={stage.id}
                  value={stage.id}
                >
                  {stage.name} ({stage.probability}%)
                </option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Deal Value"
              value={value}
              min="0"
              step="0.01"
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none"
            />

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none"
            >
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>

            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) =>
                setExpectedCloseDate(e.target.value)
              }
              className="w-full rounded-lg border px-4 py-3 outline-none"
            />

            {(currentRole === "owner" || currentRole === "admin") && (
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-lg border px-4 py-3 outline-none"
              >
                <option value="">Assign To</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.profile?.full_name ||
                      member.profile?.email ||
                      member.user_id}
                    {member.role ? ` (${member.role})` : ""}
                  </option>
                ))}
              </select>
            )}

            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none"
            >
              <option value="">Select Contact</option>

              {contacts.map((contact) => (
                <option
                  key={contact.id}
                  value={contact.id}
                >
                  {contact.first_name}{" "}
                  {contact.last_name ?? ""}
                </option>
              ))}
            </select>

            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none"
            >
              <option value="">Select Company</option>

              {companies.map((company) => (
                <option
                  key={company.id}
                  value={company.id}
                >
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || stages.length === 0}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : deal ? "Update Deal" : "Save Deal"}
          </button>
        </>
      )}
    </form>
  );
}