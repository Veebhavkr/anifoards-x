"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Option = { id: string; name: string };

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
};

type Props = {
  organizationId: string;
  userId: string;
  event?: CalendarEvent | null;
  onSuccess: () => void;
  onCancel: () => void;
};

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function CalendarEventForm({
  organizationId,
  userId,
  event = null,
  onSuccess,
  onCancel,
}: Props) {
  const supabase = createClient();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startAt, setStartAt] = useState(toLocalDateTime(event?.start_at));
  const [endAt, setEndAt] = useState(toLocalDateTime(event?.end_at));
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [location, setLocation] = useState(event?.location ?? "");
  const [contactId, setContactId] = useState(event?.contact_id ?? "");
  const [companyId, setCompanyId] = useState(event?.company_id ?? "");
  const [dealId, setDealId] = useState(event?.deal_id ?? "");
  const [assignedTo, setAssignedTo] = useState(event?.assigned_to ?? userId);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [deals, setDeals] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setOptionsLoading(true);
      const [contactsResult, companiesResult, dealsResult, membersResult] = await Promise.all([
        supabase.from("contacts").select("id, first_name, last_name").eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("companies").select("id, name").eq("organization_id", organizationId).order("name"),
        supabase.from("deals").select("id, title").eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("organization_members").select("user_id").eq("organization_id", organizationId),
      ]);

      setContacts((contactsResult.data ?? []).map((item) => ({ id: item.id, name: `${item.first_name ?? ""} ${item.last_name ?? ""}`.trim() })));
      setCompanies((companiesResult.data ?? []).map((item) => ({ id: item.id, name: item.name })));
      setDeals((dealsResult.data ?? []).map((item) => ({ id: item.id, name: item.title })));
      setMembers((membersResult.data ?? []).map((item) => ({ id: item.user_id, name: item.user_id === userId ? "You" : item.user_id })));
      setOptionsLoading(false);
    }
    loadOptions();
  }, [organizationId, userId]);

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError("");
    if (!title.trim()) return setError("Please enter an event title.");
    if (!startAt || !endAt) return setError("Please select start and end date/time.");
    if (new Date(endAt) <= new Date(startAt)) return setError("End time must be after the start time.");

    setLoading(true);
    const payload = {
      organization_id: organizationId,
      title: title.trim(),
      description: description.trim() || null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      all_day: allDay,
      location: location.trim() || null,
      contact_id: contactId || null,
      company_id: companyId || null,
      deal_id: dealId || null,
      assigned_to: assignedTo || null,
    };

    const result = event
      ? await supabase.from("calendar_events").update(payload).eq("id", event.id).eq("organization_id", organizationId)
      : await supabase.from("calendar_events").insert({ ...payload, created_by: userId });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    setLoading(false);
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Field label="Event Title *"><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client Meeting" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start Date & Time *"><input required type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
        <Field label="End Date & Time *"><input required type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day event</label>
      <Field label="Location"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office, Google Meet, etc." className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Related Contact" value={contactId} onChange={setContactId} options={contacts} disabled={optionsLoading} />
        <SelectField label="Related Company" value={companyId} onChange={setCompanyId} options={companies} disabled={optionsLoading} />
        <SelectField label="Related Deal" value={dealId} onChange={setDealId} options={deals} disabled={optionsLoading} />
        <SelectField label="Assigned To" value={assignedTo} onChange={setAssignedTo} options={members} disabled={optionsLoading} />
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={loading} className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-medium">Cancel</button>
        <button type="submit" disabled={loading || optionsLoading} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Saving..." : event ? "Update Event" : "Save Event"}</button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>{children}</div>;
}

function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: Option[]; disabled: boolean }) {
  return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white"><option value="">Not selected</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></Field>;
}
