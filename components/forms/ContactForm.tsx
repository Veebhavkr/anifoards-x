"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_id?: string | null;
  owner_id?: string | null;
};

type Company = {
  id: string;
  name: string;
};

type Member = {
  user_id: string;
  label: string;
};

type ContactFormProps = {
  contact?: Contact | null;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function ContactForm({
  contact,
  onSuccess,
  onCancel,
}: ContactFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isFullAccess, setIsFullAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = createClient();

  useEffect(() => {
    setFirstName(contact?.first_name ?? "");
    setLastName(contact?.last_name ?? "");
    setEmail(contact?.email ?? "");
    setPhone(contact?.phone ?? "");
    setJobTitle(contact?.job_title ?? "");
    setCompanyId(contact?.company_id ?? "");
    setSelectedOwnerId(contact?.owner_id ?? "");
    setError("");
  }, [contact]);

  useEffect(() => {
    async function loadFormData() {
      setCompaniesLoading(true);
      setMembersLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setCompaniesLoading(false);
        setMembersLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        setCompaniesLoading(false);
        setMembersLoading(false);
        return;
      }

      const fullAccess =
        membership.role === "owner" || membership.role === "admin";

      setIsFullAccess(fullAccess);

      if (!contact?.owner_id) {
        setSelectedOwnerId(user.id);
      }

      const { data: companyData } = await supabase
        .from("companies")
        .select("id, name")
        .eq("organization_id", membership.organization_id)
        .order("name", { ascending: true });

      setCompanies(companyData ?? []);
      setCompaniesLoading(false);

      const { data: memberData } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", membership.organization_id);

      const userIds = (memberData ?? []).map((member) => member.user_id);

      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        const profileMap = new Map(
          (profileData ?? []).map((profile) => [
            profile.id,
            profile.full_name || profile.email || profile.id,
          ])
        );

        setMembers(
          (memberData ?? []).map((member) => ({
            user_id: member.user_id,
            label: profileMap.get(member.user_id) ?? member.user_id,
          }))
        );
      } else {
        setMembers([]);
      }

      setMembersLoading(false);
    }

    loadFormData();
  }, [contact]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      setError("No organization found.");
      setLoading(false);
      return;
    }

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      job_title: jobTitle.trim() || null,
      company_id: companyId || null,
    };

    const fullAccess =
      membership.role === "owner" || membership.role === "admin";

    const ownerId = fullAccess ? selectedOwnerId || user.id : user.id;

    const result = contact
      ? await supabase
          .from("contacts")
          .update({
            ...payload,
            ...(fullAccess ? { owner_id: ownerId } : {}),
          })
          .eq("id", contact.id)
          .eq("organization_id", membership.organization_id)
      : await supabase.from("contacts").insert({
          ...payload,
          organization_id: membership.organization_id,
          owner_id: ownerId,
          created_by: user.id,
        });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="w-full rounded-lg border px-4 py-3 outline-none"
        />
        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full rounded-lg border px-4 py-3 outline-none"
        />
      </div>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border px-4 py-3 outline-none"
      />

      <input
        type="tel"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded-lg border px-4 py-3 outline-none"
      />

      <input
        type="text"
        placeholder="Job Title"
        value={jobTitle}
        onChange={(e) => setJobTitle(e.target.value)}
        className="w-full rounded-lg border px-4 py-3 outline-none"
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Company
        </label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          disabled={companiesLoading}
          className="w-full rounded-lg border px-4 py-3 outline-none disabled:opacity-50"
        >
          <option value="">
            {companiesLoading ? "Loading companies..." : "No Company"}
          </option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {isFullAccess && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Assign To
          </label>
          <select
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            disabled={membersLoading}
            className="w-full rounded-lg border px-4 py-3 outline-none disabled:opacity-50"
          >
            <option value="">
              {membersLoading ? "Loading members..." : "Select member"}
            </option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Owner/Admin can assign this contact to an organization member.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg border px-4 py-3 font-medium text-gray-700"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : contact
              ? "Update Contact"
              : "Save Contact"}
        </button>
      </div>
    </form>
  );
}
