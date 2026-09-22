"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import NoteForm, { type RelatedOption } from "@/components/forms/NoteForm";

type Contact = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
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

export default function ContactDetailPage() {
  const params = useParams<{ id?: string; contactId?: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const contactId = params?.id ?? params?.contactId;

  async function loadPage() {
    if (!contactId) {
      setError("Contact ID is missing.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

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
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership?.organization_id) {
      setError("No organization found.");
      setLoading(false);
      return;
    }

    const orgId = membership.organization_id;
    setOrganizationId(orgId);
    setUserId(user.id);

    const [{ data: contactData, error: contactError }, { data: noteData, error: noteError }] =
      await Promise.all([
        supabase
          .from("contacts")
          .select(
            "id, organization_id, first_name, last_name, email, phone, job_title, created_at, updated_at",
          )
          .eq("id", contactId)
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("notes")
          .select(
            "id, organization_id, created_by, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at",
          )
          .eq("organization_id", orgId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false }),
      ]);

    if (contactError) {
      setError(contactError.message);
    } else if (!contactData) {
      setError("Contact not found.");
    } else {
      setContact(contactData);
    }

    if (noteError) {
      setError(noteError.message);
    } else {
      setNotes(noteData ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPage();
  }, [contactId]);

  async function loadNotes() {
    if (!organizationId || !contactId) return;

    setNotesLoading(true);
    const supabase = createClient();

    const { data, error: notesError } = await supabase
      .from("notes")
      .select(
        "id, organization_id, created_by, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    if (notesError) {
      setError(notesError.message);
    } else {
      setNotes(data ?? []);
    }

    setNotesLoading(false);
  }

  async function handleDelete() {
    if (!contact) return;

    const confirmed = window.confirm(
      `Delete ${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/contacts");
  }

  async function handleDeleteNote(noteId: string) {
    const confirmed = window.confirm("Delete this note? This action cannot be undone.");
    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotes((current) => current.filter((note) => note.id !== noteId));
  }

  const fullName = contact
    ? `${contact.first_name} ${contact.last_name ?? ""}`.trim()
    : "Contact";

  const contactOptions: RelatedOption[] = contact
    ? [{ id: contact.id, name: fullName }]
    : [];

  const emptyOptions: RelatedOption[] = [];

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/contacts" className="transition hover:text-gray-900">
            Contacts
          </Link>
          <span>/</span>
          <span className="text-gray-900">Contact Details</span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
            <p className="mt-4 text-sm text-gray-500">Loading contact...</p>
          </div>
        ) : error && !contact ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm text-red-700">{error}</p>
            <Link
              href="/contacts"
              className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to Contacts
            </Link>
          </div>
        ) : contact ? (
          <>
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-xl font-bold text-white">
                  {`${contact.first_name.charAt(0)}${contact.last_name?.charAt(0) ?? ""}`.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Contact Profile
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-gray-950">{fullName}</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {contact.job_title ?? "No job title added"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/contacts?edit=${contact.id}`}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Edit Contact
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                <h2 className="text-lg font-bold text-gray-950">Contact Information</h2>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  {[
                    ["First Name", contact.first_name],
                    ["Last Name", contact.last_name ?? "—"],
                    ["Email", contact.email ?? "—"],
                    ["Phone", contact.phone ?? "—"],
                    ["Job Title", contact.job_title ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        {label}
                      </p>
                      <p className="mt-1 break-all text-sm font-medium text-gray-900">{value}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Status
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">CRM Activity</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Notes and other CRM records linked to this contact are shown below.
                </p>
                <div className="mt-6 rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Contact ID
                  </p>
                  <p className="mt-2 break-all text-xs text-gray-600">{contact.id}</p>
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-950">Related Notes</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Notes linked to {fullName}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNote(null);
                    setShowNoteForm((current) => !current);
                  }}
                  className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  {showNoteForm ? "Close Form" : "Add Note"}
                </button>
              </div>

              {showNoteForm && (
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <NoteForm
                    organizationId={organizationId}
                    userId={userId}
                    note={editingNote}
                    contacts={contactOptions}
                    companies={emptyOptions}
                    leads={emptyOptions}
                    deals={emptyOptions}
                    fixedContactId={contact.id}
                    onSuccess={() => {
                      setShowNoteForm(false);
                      setEditingNote(null);
                      loadNotes();
                    }}
                    onCancel={() => {
                      setShowNoteForm(false);
                      setEditingNote(null);
                    }}
                  />
                </div>
              )}

              {notesLoading ? (
                <p className="mt-6 text-sm text-gray-500">Loading notes...</p>
              ) : notes.length === 0 ? (
                <div className="mt-6 rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
                  No notes linked to this contact yet.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {notes.map((note) => (
                    <article key={note.id} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{note.title}</h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                            {note.content || "No content"}
                          </p>
                          <p className="mt-3 text-xs text-gray-400">
                            {new Date(note.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNote(note);
                              setShowNoteForm(true);
                            }}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
