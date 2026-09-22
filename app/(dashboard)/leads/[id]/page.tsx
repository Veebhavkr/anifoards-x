"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import NoteForm, { type RelatedOption } from "@/components/forms/NoteForm";
type Note = {
  id: string;
  title: string;
  content: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
};

type Lead = {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const leadId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");

  useEffect(() => {
    if (!leadId) return;

    const loadLead = async () => {
      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/login");
          return;
        }

        const { data: membership, error: membershipError } =
          await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError) {
          throw new Error(membershipError.message);
        }

        if (!membership?.organization_id) {
          throw new Error("Organization not found.");
        }

        const { data, error: leadError } = await supabase
          .from("leads")
          .select(
            `
              id,
              organization_id,
              first_name,
              last_name,
              email,
              phone,
              company_name,
              job_title,
              source,
              status,
              priority,
              created_at,
              updated_at
            `
          )
          .eq("id", leadId)
          .eq("organization_id", membership.organization_id)
          .single();

        if (leadError) {
          throw new Error(leadError.message);
        }

        setLead(data);
        setOrganizationId(membership.organization_id);
        setUserId(user.id);

        const { data: noteData, error: noteError } = await supabase
          .from("notes")
          .select("id, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at")
          .eq("organization_id", membership.organization_id)
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false });

        if (noteError) {
          setNotesError(noteError.message);
        } else {
          setNotes((noteData ?? []) as Note[]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load lead details."
        );
      } finally {
        setLoading(false);
      }
    };

    loadLead();
  }, [leadId, router]);

  const loadLeadNotes = async () => {
    if (!leadId || !organizationId) return;
    setNotesLoading(true);
    const { data, error: noteError } = await supabase
      .from("notes")
      .select("id, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (noteError) setNotesError(noteError.message);
    else setNotes((data ?? []) as Note[]);
    setNotesLoading(false);
  };

  const deleteLead = async () => {
    if (!lead) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this lead?"
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .eq("id", lead.id)
        .eq("organization_id", lead.organization_id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      router.push("/leads");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete lead."
      );
      setDeleting(false);
    }
  };

  const fullName =
    [lead?.first_name, lead?.last_name]
      .filter(Boolean)
      .join(" ") || "Unnamed Lead";

  const formatDate = (date: string | null) => {
    if (!date) return "Not available";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Loading lead details...
          </p>
        </div>
      </DashboardShell>
    );
  }

  if (error || !lead) {
    return (
      <DashboardShell>
        <div className="space-y-4 p-6">
          <Link
            href="/leads"
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Leads
          </Link>

          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <h2 className="font-semibold text-red-700">
              Lead not found
            </h2>

            <p className="mt-1 text-sm text-red-600">
              {error || "This lead does not exist or you do not have access."}
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Link
              href="/leads"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Leads
            </Link>

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {fullName}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Lead details and information
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/leads?edit=${lead.id}`}
              className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted"
            >
              Edit Lead
            </Link>

            <button
              type="button"
              onClick={deleteLead}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Lead"}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Contact Information
              </h2>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Full Name
                  </p>
                  <p className="mt-1 font-medium">{fullName}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Email
                  </p>
                  <p className="mt-1 break-all font-medium">
                    {lead.email || "Not provided"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Phone
                  </p>
                  <p className="mt-1 font-medium">
                    {lead.phone || "Not provided"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Job Title
                  </p>
                  <p className="mt-1 font-medium">
                    {lead.job_title || "Not provided"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Company
                  </p>
                  <p className="mt-1 font-medium">
                    {lead.company_name || "Not provided"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Lead Source
                  </p>
                  <p className="mt-1 font-medium">
                    {lead.source || "Not provided"}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Lead Timeline
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Created At
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDate(lead.created_at)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Last Updated
                  </p>
                  <p className="mt-1 font-medium">
                    {formatDate(lead.updated_at)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-lg font-semibold">Lead Notes</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Notes linked to this lead.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNote(null);
                    setShowNoteForm(true);
                  }}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  Add Note
                </button>
              </div>

              {showNoteForm && organizationId && userId && (
                <div className="mt-5 rounded-xl border bg-muted/20 p-4">
                  <NoteForm
                    organizationId={organizationId}
                    userId={userId}
                    note={editingNote}
                    contacts={[] as RelatedOption[]}
                    companies={[] as RelatedOption[]}
                    leads={[{ id: lead.id, name: fullName }]}
                    deals={[] as RelatedOption[]}
                    fixedLeadId={lead.id}
                    onSuccess={() => {
                      setShowNoteForm(false);
                      setEditingNote(null);
                      loadLeadNotes();
                    }}
                    onCancel={() => {
                      setShowNoteForm(false);
                      setEditingNote(null);
                    }}
                  />
                </div>
              )}

              {notesError && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {notesError}
                </p>
              )}

              {!notesLoading && notes.length === 0 ? (
                <p className="mt-5 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                  No notes linked to this lead yet.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{note.title}</h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {note.content || "No content"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNote(note);
                              setShowNoteForm(true);
                            }}
                            className="text-sm font-semibold text-blue-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm("Delete this note?")) return;
                              const { error: deleteError } = await supabase
                                .from("notes")
                                .delete()
                                .eq("id", note.id)
                                .eq("organization_id", organizationId);
                              if (deleteError) {
                                setNotesError(deleteError.message);
                              } else {
                                setNotes((current) => current.filter((item) => item.id !== note.id));
                              }
                            }}
                            className="text-sm font-semibold text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div>
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold">
                Lead Summary
              </h2>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Status
                  </p>

                  <span className="mt-2 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                    {lead.status || "Not set"}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Priority
                  </p>

                  <span className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold capitalize text-amber-700">
                    {lead.priority || "Not set"}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    Lead ID
                  </p>

                  <p className="mt-1 break-all text-xs font-medium">
                    {lead.id}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}