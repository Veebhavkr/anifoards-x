"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
};

type RelatedRecord = {
  id: string;
  name?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  email?: string | null;
};

function formatStatus(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  return "Pending";
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.due_date);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function badgeClass(type: "status" | "priority", value: string) {
  if (type === "status") {
    if (value === "completed") return "bg-green-100 text-green-700";
    if (value === "in_progress") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  }

  if (value === "high") return "bg-red-100 text-red-700";
  if (value === "low") return "bg-green-100 text-green-700";
  return "bg-yellow-100 text-yellow-700";
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [task, setTask] = useState<Task | null>(null);
  const [deal, setDeal] = useState<RelatedRecord | null>(null);
  const [contact, setContact] = useState<RelatedRecord | null>(null);
  const [company, setCompany] = useState<RelatedRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function getOrganizationId() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) return null;
    return membership?.organization_id ?? null;
  }

  async function loadTask() {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      setLoading(false);
      return;
    }

    const { data, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, created_at, deal_id, contact_id, company_id"
      )
      .eq("id", params.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (taskError) {
      setError(taskError.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setError("Task not found.");
      setLoading(false);
      return;
    }

    setTask(data as Task);

    const [dealResult, contactResult, companyResult] = await Promise.all([
      data.deal_id
        ? supabase
            .from("deals")
            .select("id, title")
            .eq("id", data.deal_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data.contact_id
        ? supabase
            .from("contacts")
            .select("id, first_name, last_name, email")
            .eq("id", data.contact_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data.company_id
        ? supabase
            .from("companies")
            .select("id, name")
            .eq("id", data.company_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setDeal(dealResult.data as RelatedRecord | null);
    setContact(contactResult.data as RelatedRecord | null);
    setCompany(companyResult.data as RelatedRecord | null);
    setLoading(false);
  }

  async function handleDelete() {
    if (!task) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      setDeleting(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", task.id)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/tasks");
  }

  useEffect(() => {
    if (params.id) loadTask();
  }, [params.id]);

  const contactName = contact
    ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() ||
      "Unnamed Contact"
    : "";

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Dashboard / Productivity / Tasks / Details
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Task Details
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/tasks"
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Back to Tasks
            </Link>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || loading || !task}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete Task"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            <p className="text-sm text-gray-500">Loading task...</p>
          </div>
        ) : task ? (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Task
                  </p>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {task.title}
                  </h2>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass(
                      "status",
                      task.status
                    )}`}
                  >
                    {formatStatus(task.status)}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${badgeClass(
                      "priority",
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                </div>
              </div>

              <div className="mt-8">
                <p className="mb-2 text-sm font-semibold text-gray-700">
                  Description
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600">
                  {task.description || "No description added."}
                </p>
              </div>

              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Due Date
                  </p>
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      isOverdue(task) ? "text-red-600" : "text-gray-800"
                    }`}
                  >
                    {formatDate(task.due_date)}
                  </p>
                  {isOverdue(task) && (
                    <p className="mt-1 text-xs text-red-600">Overdue</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Created At
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-800">
                    {formatDate(task.created_at)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">
                Related Records
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Records connected with this task.
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Deal
                  </p>
                  {deal ? (
                    <Link
                      href={`/deals/${deal.id}`}
                      className="mt-2 block text-sm font-semibold text-blue-600 hover:underline"
                    >
                      {deal.title}
                    </Link>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      No deal linked.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Contact
                  </p>
                  {contact ? (
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="mt-2 block text-sm font-semibold text-blue-600 hover:underline"
                    >
                      {contactName}
                    </Link>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      No contact linked.
                    </p>
                  )}
                  {contact?.email && (
                    <p className="mt-1 text-xs text-gray-500">
                      {contact.email}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Company
                  </p>
                  {company ? (
                    <Link
                      href={`/companies/${company.id}`}
                      className="mt-2 block text-sm font-semibold text-blue-600 hover:underline"
                    >
                      {company.name}
                    </Link>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      No company linked.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
