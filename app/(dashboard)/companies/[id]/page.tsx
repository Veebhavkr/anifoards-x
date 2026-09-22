"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import NoteForm, { type RelatedOption } from "@/components/forms/NoteForm";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
};

type Company = {
  id: string;
  organization_id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Note = {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  content: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
};

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    async function loadCompany() {
      setLoading(true);
      setError("");

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership?.organization_id) {
        setError("No organization found.");
        setLoading(false);
        return;
      }

      const { data, error: companyError } = await supabase
        .from("companies")
        .select(
          "id, organization_id, name, website, email, phone, industry, company_size, city, state, created_at, updated_at"
        )
        .eq("id", params.id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle();

      if (companyError || !data) {
        setError(companyError?.message || "Company not found.");
        setLoading(false);
        return;
      }

      setCompany(data as Company);

      const { data: contactData, error: contactsError } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, job_title")
        .eq("organization_id", membership.organization_id)
        .eq("company_id", params.id)
        .order("created_at", { ascending: false });

      if (contactsError) {
        console.error("Error loading company contacts:", contactsError);
        setContacts([]);
      } else {
        setContacts((contactData ?? []) as Contact[]);
      }

      setOrganizationId(membership.organization_id);
      setUserId(user.id);

      const { data: noteData } = await supabase
        .from("notes")
        .select("id, organization_id, created_by, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at")
        .eq("organization_id", membership.organization_id)
        .eq("company_id", params.id)
        .order("created_at", { ascending: false });

      setNotes((noteData ?? []) as Note[]);
      setLoading(false);
    }

    if (params.id) {
      loadCompany();
    }
  }, [params.id, router]);

  async function loadNotes() {
    if (!organizationId || !params.id) return;
    setNotesLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("notes")
      .select("id, organization_id, created_by, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("company_id", params.id)
      .order("created_at", { ascending: false });
    setNotes((data ?? []) as Note[]);
    setNotesLoading(false);
  }

  async function handleDeleteNote(noteId: string) {
    if (!window.confirm("Delete this note?")) return;
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("organization_id", organizationId)
      .eq("company_id", params.id);
    if (!deleteError) setNotes((current) => current.filter((note) => note.id !== noteId));
  }

  async function handleDelete() {
    if (!company) return;

    const confirmed = window.confirm(
      `Delete "${company.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("companies")
      .delete()
      .eq("id", company.id)
      .eq("organization_id", company.organization_id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/companies");
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
            <p className="mt-4 text-sm text-gray-500">Loading company...</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error || !company) {
    return (
      <DashboardShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-lg font-bold text-red-800">Company unavailable</h1>
          <p className="mt-2 text-sm text-red-700">{error || "Company not found."}</p>
          <Link
            href="/companies"
            className="mt-4 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Companies
          </Link>
        </div>
      </DashboardShell>
    );
  }

  const location =
    company.city && company.state
      ? `${company.city}, ${company.state}`
      : company.city || company.state || "—";

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Link href="/companies" className="hover:text-gray-900">
                Companies
              </Link>
              <span>/</span>
              <span>{company.name}</span>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-lg font-bold text-white">
                {company.name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")
                  .toUpperCase()}
              </div>

              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                  {company.name}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {company.industry || "Company profile"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href={`/companies?edit=${company.id}`}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Edit Company
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Company Information</h2>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Website
              </p>
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-sm text-blue-600 hover:underline"
                >
                  {company.website}
                </a>
              ) : (
                <p className="mt-1 text-sm text-gray-900">—</p>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Email
              </p>
              <p className="mt-1 break-all text-sm text-gray-900">{company.email || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Phone
              </p>
              <p className="mt-1 text-sm text-gray-900">{company.phone || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Industry
              </p>
              <p className="mt-1 text-sm text-gray-900">{company.industry || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Company Size
              </p>
              <p className="mt-1 text-sm text-gray-900">{company.company_size || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Location
              </p>
              <p className="mt-1 text-sm text-gray-900">{location}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Associated Contacts</h2>
              <p className="mt-1 text-sm text-gray-500">Contacts connected with this company.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {contacts.length}
            </span>
          </div>

          {contacts.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-500">No contacts are linked to this company yet.</p>
              <Link
                href="/contacts"
                className="mt-3 inline-flex rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                Go to Contacts
              </Link>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-gray-100">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                    >
                      {contact.first_name} {contact.last_name ?? ""}
                    </Link>
                    <p className="mt-1 text-sm text-gray-500">{contact.job_title || "Contact"}</p>
                    <p className="mt-1 text-xs text-gray-500">{contact.email || contact.phone || "No contact details"}</p>
                  </div>
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    View Contact →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Company Notes</h2>
              <p className="mt-1 text-sm text-gray-500">Notes linked to this company.</p>
            </div>
            <button type="button" onClick={() => { setEditingNote(null); setShowNoteForm(true); }}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700">
              Add Note
            </button>
          </div>

          {showNoteForm && (
            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <NoteForm
                organizationId={organizationId}
                userId={userId}
                note={editingNote}
                contacts={[]}
                companies={[{ id: company.id, name: company.name }]}
                leads={[]}
                deals={[]}
                fixedCompanyId={company.id}
                onSuccess={() => { setShowNoteForm(false); setEditingNote(null); loadNotes(); }}
                onCancel={() => { setShowNoteForm(false); setEditingNote(null); }}
              />
            </div>
          )}

          <div className="mt-5 space-y-3">
            {notesLoading ? <p className="text-sm text-gray-500">Loading notes...</p> : notes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No notes linked to this company.</p>
            ) : notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{note.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{note.content || "—"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setEditingNote(note); setShowNoteForm(true); }} className="text-sm font-semibold text-blue-600">Edit</button>
                    <button type="button" onClick={() => handleDeleteNote(note.id)} className="text-sm font-semibold text-red-600">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">CRM Activity</h2>
          <p className="mt-2 text-sm text-gray-500">
            Company-related deals, tasks, and activities can be connected here in the next phase.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
