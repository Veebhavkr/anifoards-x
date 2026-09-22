"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type RelatedOption = {
  id: string;
  name: string;
};

type Note = {
  id: string;
  title: string;
  content: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  lead_id?: string | null;
  deal_id?: string | null;
};

type NoteFormProps = {
  organizationId: string;
  userId: string;
  note?: Note | null;
  contacts: RelatedOption[];
  companies: RelatedOption[];
  leads: RelatedOption[];
  deals: RelatedOption[];
  fixedContactId?: string;
  fixedCompanyId?: string;
  fixedDealId?: string;
  fixedLeadId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function NoteForm({
  organizationId,
  userId,
  note,
  contacts,
  companies,
  leads,
  deals,
  fixedContactId,
  fixedCompanyId,
  fixedDealId,
  fixedLeadId,
  onSuccess,
  onCancel,
}: NoteFormProps) {
  const isEditMode = Boolean(note);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contactId, setContactId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [dealId, setDealId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setContactId(note?.contact_id ?? fixedContactId ?? "");
    setCompanyId(note?.company_id ?? fixedCompanyId ?? "");
    setLeadId(note?.lead_id ?? fixedLeadId ?? "");
    setDealId(note?.deal_id ?? fixedDealId ?? "");
    setError("");
  }, [note, fixedContactId, fixedCompanyId, fixedDealId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setError("Please enter a note title.");
      return;
    }
    if (!trimmedContent) {
      setError("Please enter note content.");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    const payload = {
      title: trimmedTitle,
      content: trimmedContent,
      contact_id: contactId || null,
      company_id: companyId || null,
      lead_id: leadId || null,
      deal_id: dealId || null,
      updated_at: new Date().toISOString(),
    };

    const result = isEditMode && note
      ? await supabase
          .from("notes")
          .update(payload)
          .eq("id", note.id)
          .eq("organization_id", organizationId)
      : await supabase
          .from("notes")
          .insert({
            organization_id: organizationId,
            created_by: userId,
            ...payload,
          });

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setTitle("");
    setContent("");
    setContactId("");
    setCompanyId("");
    setLeadId("");
    setDealId("");
    setLoading(false);
    onSuccess?.();
  }

  function renderOptions(options: RelatedOption[]) {
    return options.map((option) => (
      <option key={option.id} value={option.id}>
        {option.name}
      </option>
    ));
  }

  function renderSelect(
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: RelatedOption[]
  ) {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Related {label}
        </label>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black"
        >
          <option value="">No {label.toLowerCase()} linked</option>
          {renderOptions(options)}
        </select>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Note Title</label>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter note title"
          required
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Note Content</label>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write your note here..."
          rows={6}
          required
          className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {renderSelect("Contact", contactId, setContactId, contacts)}
        {renderSelect("Company", companyId, setCompanyId, companies)}
        {renderSelect("Lead", leadId, setLeadId, leads)}
        {renderSelect("Deal", dealId, setDealId, deals)}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Saving..." : isEditMode ? "Update Note" : "Save Note"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
