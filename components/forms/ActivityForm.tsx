"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Activity = {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  activity_date: string | null;
  activity_time: string | null;
  deal_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  created_at: string;
  assigned_to?: string | null;
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

type Deal = {
  id: string;
  title: string;
};

type ActivityFormProps = {
  organizationId: string;
  userId: string;
  activity?: Activity | null;
  onSuccess: () => void;
  onCancel: () => void;
};

const activityTypes = [
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "note", label: "Note" },
  { value: "follow_up", label: "Follow-up" },
];

export default function ActivityForm({
  organizationId,
  userId,
  activity,
  onSuccess,
  onCancel,
}: ActivityFormProps) {
  const supabase = createClient();
  const isEditMode = Boolean(activity);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [assignedTo, setAssignedTo] = useState(userId);

  const [type, setType] = useState("call");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [activityDate, setActivityDate] = useState("");
  const [activityTime, setActivityTime] = useState("");
  const [dealId, setDealId] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingRelations, setLoadingRelations] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRelations() {
      setLoadingRelations(true);

      const [contactsResult, companiesResult, dealsResult] =
        await Promise.all([
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

          supabase
            .from("deals")
            .select("id, title")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false }),
        ]);

      if (contactsResult.error) {
        setError(contactsResult.error.message);
      } else if (companiesResult.error) {
        setError(companiesResult.error.message);
      } else if (dealsResult.error) {
        setError(dealsResult.error.message);
      }

      setContacts(contactsResult.data ?? []);
      setCompanies(companiesResult.data ?? []);
      setDeals(dealsResult.data ?? []);

      const { data: membership } = await supabase
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", organizationId);

      const fullAccess = membership?.some(
        (item) => item.user_id === userId && (item.role === "owner" || item.role === "admin")
      ) ?? false;
      setCanAssign(fullAccess);

      if (fullAccess && membership?.length) {
        const memberIds = membership.map((item) => item.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", memberIds);

        if (profilesError) {
          console.error("Activity members loading error:", profilesError);
        }

        const profileMap = new Map(
          (profiles ?? []).map((profile) => [
            profile.id,
            profile.full_name || profile.email || profile.id,
          ])
        );

        setMembers(
          memberIds.map((id) => ({
            id,
            name: profileMap.get(id) || id,
          }))
        );
      } else {
        setMembers([]);
      }

      setLoadingRelations(false);
    }

    loadRelations();
  }, [organizationId]);

  useEffect(() => {
    if (activity) {
      setType(activity.type || "call");
      setSubject(activity.subject || "");
      setDescription(activity.description || "");
      setActivityDate(activity.activity_date || "");
      setActivityTime(activity.activity_time || "");
      setDealId(activity.deal_id || "");
      setContactId(activity.contact_id || "");
      setCompanyId(activity.company_id || "");
      setAssignedTo(activity.assigned_to || userId);
    } else {
      setType("call");
      setSubject("");
      setDescription("");
      setActivityDate("");
      setActivityTime("");
      setDealId("");
      setContactId("");
      setCompanyId("");
      setAssignedTo(userId);
    }

    setError("");
  }, [activity]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!subject.trim()) {
      setError("Please enter an activity subject.");
      return;
    }

    setLoading(true);
    setError("");

    const activityData = {
      type,
      subject: subject.trim(),
      description: description.trim() || null,
      activity_date: activityDate || null,
      activity_time: activityTime || null,
      deal_id: dealId || null,
      contact_id: contactId || null,
      company_id: companyId || null,
      assigned_to: canAssign ? assignedTo || userId : userId,
    };

    const result = isEditMode && activity
      ? await supabase
          .from("activities")
          .update(activityData)
          .eq("id", activity.id)
          .eq("organization_id", organizationId)
      : await supabase.from("activities").insert({
          organization_id: organizationId,
          created_by: userId,
          ...activityData,
        });

    if (result.error) {
      console.error("Activity save error:", result.error);
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="activity-type" className="mb-2 block text-sm font-medium text-gray-700">
          Activity Type
        </label>
        <select
          id="activity-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          {activityTypes.map((activityType) => (
            <option key={activityType.value} value={activityType.value}>
              {activityType.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="activity-subject" className="mb-2 block text-sm font-medium text-gray-700">
          Subject <span className="text-red-500">*</span>
        </label>
        <input
          id="activity-subject"
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="e.g. Follow-up call with client"
          required
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="activity-description" className="mb-2 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="activity-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add activity details..."
          rows={4}
          className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="activity-deal" className="mb-2 block text-sm font-medium text-gray-700">
            Related Deal
          </label>
          <select
            id="activity-deal"
            value={dealId}
            onChange={(event) => setDealId(event.target.value)}
            disabled={loadingRelations}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">No Deal</option>
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="activity-contact" className="mb-2 block text-sm font-medium text-gray-700">
            Related Contact
          </label>
          <select
            id="activity-contact"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            disabled={loadingRelations}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">No Contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name ?? ""}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="activity-company" className="mb-2 block text-sm font-medium text-gray-700">
            Related Company
          </label>
          <select
            id="activity-company"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={loadingRelations}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">No Company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        {canAssign && (
          <div className="sm:col-span-2">
            <label htmlFor="activity-assigned-to" className="mb-2 block text-sm font-medium text-gray-700">
              Assign To
            </label>
            <select
              id="activity-assigned-to"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              disabled={loadingRelations}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value={userId}>Current User</option>
              {members.filter((member) => member.id !== userId).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="activity-date" className="mb-2 block text-sm font-medium text-gray-700">
            Activity Date
          </label>
          <input
            id="activity-date"
            type="date"
            value={activityDate}
            onChange={(event) => setActivityDate(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label htmlFor="activity-time" className="mb-2 block text-sm font-medium text-gray-700">
            Activity Time
          </label>
          <input
            id="activity-time"
            type="time"
            value={activityTime}
            onChange={(event) => setActivityTime(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={loading || loadingRelations}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Saving..." : isEditMode ? "Update Activity" : "Save Activity"}
        </button>
      </div>
    </form>
  );
}
