 "use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import DealForm from "@/components/forms/DealForm";
import NoteForm, { type RelatedOption } from "@/components/forms/NoteForm";

type Deal = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  value: number | null;
  currency: string | null;
  expected_close_date: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  owner_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Pipeline = {
  id: string;
  name: string;
};

type PipelineStage = {
  id: string;
  name: string;
  pipeline_id: string | null;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
};

type Company = {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
};

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

function formatCurrency(value: number | null, currency: string | null) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getContactName(contact: Contact | null) {
  if (!contact) return "—";

  return [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || "Unnamed Contact";
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stage, setStage] = useState<PipelineStage | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);

  useEffect(() => {
    async function loadDeal() {
      if (!params?.id) return;

      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("You must be logged in to view this deal.");
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
        setError("Organization not found.");
        setLoading(false);
        return;
      }

      const organizationId = membership.organization_id;

      const { data: dealData, error: dealError } = await supabase
        .from("deals")
        .select(
          "id, organization_id, title, description, value, currency, expected_close_date, pipeline_id, stage_id, contact_id, company_id, lead_id, owner_id, created_at, updated_at"
        )
        .eq("id", params.id)
        .eq("organization_id", organizationId)
        .single();

      if (dealError || !dealData) {
        setError(dealError?.message || "Deal not found.");
        setLoading(false);
        return;
      }

      setOrganizationId(organizationId);
      setUserId(user.id);
      setDeal(dealData as Deal);

      const { data: notesData } = await supabase
        .from("notes")
        .select("id, title, content, contact_id, company_id, lead_id, deal_id, created_at, updated_at")
        .eq("organization_id", organizationId)
        .eq("deal_id", dealData.id)
        .order("created_at", { ascending: false });
      setNotes((notesData as Note[]) || []);

      const [pipelineResult, stageResult, contactResult, companyResult] =
        await Promise.all([
          dealData.pipeline_id
            ? supabase
                .from("pipelines")
                .select("id, name")
                .eq("id", dealData.pipeline_id)
                .eq("organization_id", organizationId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          dealData.stage_id
            ? supabase
                .from("pipeline_stages")
                .select("id, name, pipeline_id")
                .eq("id", dealData.stage_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          dealData.contact_id
            ? supabase
                .from("contacts")
                .select(
                  "id, first_name, last_name, email, phone, job_title"
                )
                .eq("id", dealData.contact_id)
                .eq("organization_id", organizationId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),

          dealData.company_id
            ? supabase
                .from("companies")
                .select("id, name, website, email, phone")
                .eq("id", dealData.company_id)
                .eq("organization_id", organizationId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      setPipeline((pipelineResult.data as Pipeline | null) || null);
      setStage((stageResult.data as PipelineStage | null) || null);
      setContact((contactResult.data as Contact | null) || null);
      setCompany((companyResult.data as Company | null) || null);

      setLoading(false);
    }

    loadDeal();
  }, [params?.id]);

  async function handleDelete() {
    if (!deal) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this deal?"
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("deals")
      .delete()
      .eq("id", deal.id)
      .eq("organization_id", deal.organization_id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/deals");
    router.refresh();
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading deal...</p>
        </div>
      </DashboardShell>
    );
  }

  if (!deal) {
    return (
      <DashboardShell>
        <div className="space-y-4 p-6">
          <Link
            href="/deals"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Deals
          </Link>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error || "Deal not found."}
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
              href="/deals"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              ← Back to Deals
            </Link>

            <h1 className="mt-2 text-2xl font-bold tracking-tight">
              {deal.title}
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Deal details and related records
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {editing ? "Cancel Edit" : "Edit Deal"}
            </button>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Deal"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {editing && (
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Edit Deal</h2>
            <DealForm
              deal={{
                id: deal.id,
                title: deal.title,
                description: deal.description,
                value: deal.value ?? 0,
                currency: deal.currency ?? "INR",
                expected_close_date: deal.expected_close_date,
                pipeline_id: deal.pipeline_id ?? "",
                stage_id: deal.stage_id ?? "",
                contact_id: deal.contact_id,
                company_id: deal.company_id,
                owner_id: deal.owner_id ?? null,
              }}
              onSuccess={() => window.location.reload()}
            />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">Deal Information</h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Deal Value
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {formatCurrency(deal.value, deal.currency)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expected Close Date
                </p>
                <p className="mt-1 text-sm">
                  {formatDate(deal.expected_close_date)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pipeline
                </p>
                <p className="mt-1 text-sm">{pipeline?.name || "—"}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Stage
                </p>
                <p className="mt-1 text-sm">{stage?.name || "—"}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Created At
                </p>
                <p className="mt-1 text-sm">{formatDate(deal.created_at)}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Last Updated
                </p>
                <p className="mt-1 text-sm">{formatDate(deal.updated_at)}</p>
              </div>
            </div>

            <div className="mt-6 border-t pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {deal.description || "No description added."}
              </p>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Related Records</h2>

            <div className="space-y-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>

                {contact ? (
                  <div className="mt-2 space-y-1">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {getContactName(contact)}
                    </Link>

                    {contact.job_title && (
                      <p className="text-sm text-muted-foreground">
                        {contact.job_title}
                      </p>
                    )}

                    {contact.email && (
                      <p className="break-all text-sm">{contact.email}</p>
                    )}

                    {contact.phone && (
                      <p className="text-sm">{contact.phone}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No contact linked.
                  </p>
                )}
              </div>

              <div className="border-t pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Company
                </p>

                {company ? (
                  <div className="mt-2 space-y-1">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {company.name}
                    </Link>

                    {company.website && (
                      <a
                        href={
                          company.website.startsWith("http")
                            ? company.website
                            : `https://${company.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="block break-all text-sm text-blue-600 hover:underline"
                      >
                        {company.website}
                      </a>
                    )}

                    {company.email && (
                      <p className="break-all text-sm">{company.email}</p>
                    )}

                    {company.phone && (
                      <p className="text-sm">{company.phone}</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No company linked.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Deal Notes</h2>
              <p className="text-sm text-muted-foreground">Notes linked to this deal.</p>
            </div>
            <button type="button" onClick={() => { setEditingNote(null); setShowNoteForm(true); }} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Add Note</button>
          </div>
          {showNoteForm && (
            <div className="mt-5 rounded-xl border p-4">
              <NoteForm organizationId={organizationId} userId={userId} note={editingNote}
                contacts={[]} companies={[]} leads={[]} deals={[{ id: deal.id, name: deal.title } as RelatedOption]}
                fixedDealId={deal.id}
                onSuccess={() => window.location.reload()}
                onCancel={() => { setShowNoteForm(false); setEditingNote(null); }} />
            </div>
          )}
          <div className="mt-5 space-y-3">
            {notesLoading ? <p className="text-sm text-muted-foreground">Loading notes...</p> : notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes linked to this deal.</p> : notes.map((note) => (
              <div key={note.id} className="rounded-xl border p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div><h3 className="font-semibold">{note.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p></div>
                  <div className="flex gap-2"><button type="button" onClick={() => { setEditingNote(note); setShowNoteForm(true); }} className="text-sm font-medium text-blue-600 hover:underline">Edit</button><button type="button" onClick={async () => { if (!window.confirm("Delete this note?")) return; await supabase.from("notes").delete().eq("id", note.id).eq("organization_id", organizationId); setNotes((current) => current.filter((item) => item.id !== note.id)); }} className="text-sm font-medium text-red-600 hover:underline">Delete</button></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
