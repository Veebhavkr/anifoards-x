"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  due_time?: string | null;
  assigned_to?: string | null;
  deal_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  created_at: string;
};

type Deal = {
  id: string;
  title: string;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type Company = {
  id: string;
  name: string;
};

type OrganizationMember = {
  user_id: string;
  role: string;
  profile: {
    full_name: string | null;
  } | null;
};

type TaskFormProps = {
  task?: Task | null;
  onSuccess: () => void;
  onCancel?: () => void;
};

type OrganizationContext = {
  userId: string;
  organizationId: string;
  role: string;
};

export default function TaskForm({
  task,
  onSuccess,
  onCancel,
}: TaskFormProps) {
  const isEditMode = Boolean(task);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("pending");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [dealId, setDealId] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("member");

  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");

  const canAssignTasks =
    currentRole === "owner" || currentRole === "admin";

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setStatus(task.status);
      setDueDate(task.due_date?.slice(0, 10) ?? "");
      setDueTime(task.due_time?.slice(0, 5) ?? "");
      setDealId(task.deal_id ?? "");
      setContactId(task.contact_id ?? "");
      setCompanyId(task.company_id ?? "");
      setAssignedTo(task.assigned_to ?? "");
    } else {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus("pending");
      setDueDate("");
      setDueTime("");
      setDealId("");
      setContactId("");
      setCompanyId("");
      setAssignedTo(currentUserId);
    }

    setError("");
  }, [task, currentUserId]);

  async function getOrganizationContext(): Promise<OrganizationContext | null> {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return null;
    }

    return {
      userId: user.id,
      organizationId: membership.organization_id as string,
      role: String(membership.role ?? "member").toLowerCase(),
    };
  }

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setError("");

      const supabase = createClient();
      const context = await getOrganizationContext();

      if (!context) {
        setError("Unable to load organization details.");
        setLoadingOptions(false);
        return;
      }

      const {
        userId,
        organizationId,
        role,
      } = context;

      setCurrentUserId(userId);
      setCurrentRole(role);

      const [
        dealsResult,
        contactsResult,
        companiesResult,
        membersResult,
      ] = await Promise.all([
        supabase
          .from("deals")
          .select("id, title")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),

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
          .from("organization_members")
          .select("user_id, role, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true }),
      ]);

      if (
        dealsResult.error ||
        contactsResult.error ||
        companiesResult.error ||
        membersResult.error
      ) {
        setError(
          dealsResult.error?.message ||
            contactsResult.error?.message ||
            companiesResult.error?.message ||
            membersResult.error?.message ||
            "Unable to load task options.",
        );
      }

      setDeals(dealsResult.data ?? []);
      setContacts(contactsResult.data ?? []);
      setCompanies(companiesResult.data ?? []);

      const organizationMembers = membersResult.data ?? [];

      const memberUserIds = organizationMembers.map(
        (member) => member.user_id,
      );

      let profilesMap: Record<
        string,
        {
          full_name: string | null;
        }
      > = {};

      if (memberUserIds.length > 0) {
        const { data: profilesData, error: profilesError } =
          await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", memberUserIds);

        if (profilesError) {
          setError(
            profilesError.message ||
              "Unable to load member profiles.",
          );
        }

        profilesMap = Object.fromEntries(
          (profilesData ?? []).map((profile) => [
            profile.id,
            {
              full_name: profile.full_name,
            },
          ]),
        );
      }

      const normalizedMembers: OrganizationMember[] =
        organizationMembers.map((member) => ({
          user_id: member.user_id,
          role: String(member.role ?? "member").toLowerCase(),
          profile: profilesMap[member.user_id] ?? null,
        }));

      setMembers(normalizedMembers);

      if (!task) {
        setAssignedTo(userId);
      } else if (!task.assigned_to) {
        setAssignedTo(userId);
      }

      setLoadingOptions(false);
    }

    loadOptions();
  }, [task]);

  function getContactName(contact: Contact) {
    return (
      [contact.first_name, contact.last_name]
        .filter(Boolean)
        .join(" ") || "Unnamed Contact"
    );
  }

  function getMemberName(member: OrganizationMember) {
    return (
      member.profile?.full_name ||
      (member.user_id === currentUserId
        ? "You"
        : `Member ${member.user_id.slice(0, 8)}`)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const context = await getOrganizationContext();

    if (!context) {
      setError("No organization found.");
      setSaving(false);
      return;
    }

    const {
      userId,
      organizationId,
      role,
    } = context;

    const isPrivilegedUser =
      role === "owner" || role === "admin";

    if (!userId) {
      setError("Please login first.");
      setSaving(false);
      return;
    }

    const finalAssignedTo = isPrivilegedUser
      ? assignedTo || userId
      : userId;

    const taskData = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      due_time: dueTime || null,
      deal_id: dealId || null,
      contact_id: contactId || null,
      company_id: companyId || null,
      assigned_to: finalAssignedTo,
    };

    const result = isEditMode
      ? await supabase
          .from("tasks")
          .update(
            isPrivilegedUser
              ? taskData
              : {
                  title: taskData.title,
                  description: taskData.description,
                  priority: taskData.priority,
                  status: taskData.status,
                  due_date: taskData.due_date,
                  deal_id: taskData.deal_id,
                  contact_id: taskData.contact_id,
                  company_id: taskData.company_id,
                },
          )
          .eq("id", task!.id)
          .eq("organization_id", organizationId)
      : await supabase.from("tasks").insert({
          organization_id: organizationId,
          created_by: userId,
          ...taskData,
        });

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Task Title
        </label>

        <input
          type="text"
          placeholder="e.g. Follow up with client"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Description
        </label>

        <textarea
          placeholder="Write task details..."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Priority
          </label>

          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Status
          </label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Due Date
          </label>

          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Due Time
          </label>

          <input
            type="time"
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          />
        </div>
      </div>

      {canAssignTasks && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Assigned To
          </label>

          <select
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            disabled={loadingOptions}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          >
            <option value="">Assign to yourself</option>

            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {getMemberName(member)}
                {member.role ? ` (${member.role})` : ""}
              </option>
            ))}
          </select>

          <p className="mt-1 text-xs text-gray-500">
            Owner/Admin can assign tasks to organization members.
          </p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Related Deal
          </label>

          <select
            value={dealId}
            onChange={(event) => setDealId(event.target.value)}
            disabled={loadingOptions}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
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
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Related Contact
          </label>

          <select
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            disabled={loadingOptions}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          >
            <option value="">No Contact</option>

            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {getContactName(contact)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Related Company
          </label>

          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={loadingOptions}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
          >
            <option value="">No Company</option>

            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? isEditMode
              ? "Updating..."
              : "Saving..."
            : isEditMode
              ? "Update Task"
              : "Save Task"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}