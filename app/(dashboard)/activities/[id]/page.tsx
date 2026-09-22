"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Activity = {
  id: string;
  type: string;
  subject: string;
  description: string | null;
  activity_date: string | null;
  activity_time: string | null;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
};

type Deal = {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type Company = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
};

function formatActivityType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date: string | null) {
  if (!date) return "Not specified";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
  if (!time) return "Not specified";

  const [hours, minutes] = time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatValue(value: number | null, currency: string | null) {
  if (value === null || value === undefined) return "Not specified";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function getTypeStyles(type: string) {
  switch (type) {
    case "call":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "meeting":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "email":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "note":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "follow_up":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "call":
      return "☎";
    case "meeting":
      return "▦";
    case "email":
      return "✉";
    case "note":
      return "✎";
    case "follow_up":
      return "↻";
    default:
      return "•";
  }
}

export default function ActivityDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const activityId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [activity, setActivity] = useState<Activity | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Company | null>(null);

  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activityId) return;

    async function loadActivityDetails() {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("You must be logged in to view this activity.");
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
        setError(
          membershipError?.message ||
            "No organization found for this account."
        );
        setLoading(false);
        return;
      }

      const currentOrganizationId = membership.organization_id;
      setOrganizationId(currentOrganizationId);

      const { data: activityData, error: activityError } = await supabase
        .from("activities")
        .select(
          `
            id,
            type,
            subject,
            description,
            activity_date,
            activity_time,
            deal_id,
            contact_id,
            company_id,
            assigned_to,
            created_by,
            created_at
          `
        )
        .eq("id", activityId)
        .eq("organization_id", currentOrganizationId)
        .maybeSingle();

      if (activityError) {
        setError(activityError.message);
        setLoading(false);
        return;
      }

      if (!activityData) {
        setError("Activity not found.");
        setLoading(false);
        return;
      }

      setActivity(activityData);

      const [dealResult, contactResult, companyResult] = await Promise.all([
        activityData.deal_id
          ? supabase
              .from("deals")
              .select("id, title, value, currency")
              .eq("id", activityData.deal_id)
              .eq("organization_id", currentOrganizationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        activityData.contact_id
          ? supabase
              .from("contacts")
              .select("id, first_name, last_name, email, phone")
              .eq("id", activityData.contact_id)
              .eq("organization_id", currentOrganizationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),

        activityData.company_id
          ? supabase
              .from("companies")
              .select("id, name, email, phone, website")
              .eq("id", activityData.company_id)
              .eq("organization_id", currentOrganizationId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (dealResult.error) {
        setError(dealResult.error.message);
      } else if (contactResult.error) {
        setError(contactResult.error.message);
      } else if (companyResult.error) {
        setError(companyResult.error.message);
      }

      setDeal(dealResult.data);
      setContact(contactResult.data);
      setCompany(companyResult.data);
      setLoading(false);
    }

    loadActivityDetails();
  }, [activityId]);

  async function handleDelete() {
    if (!activity || !organizationId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this activity?"
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const { error: deleteError } = await supabase
      .from("activities")
      .delete()
      .eq("id", activity.id)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/activities");
  }

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/activities"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              ← Back to Activities
            </Link>

            <div className="mt-3 text-sm text-gray-500">
              Workspace / Activities / Details
            </div>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Activity Details
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/activities"
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Edit from Activities
            </Link>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || loading || !activity}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">Loading activity...</p>
          </div>
        ) : !activity ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              Activity not found
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              The activity may have been deleted or you may not have access.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-2xl ${getTypeStyles(
                    activity.type
                  )}`}
                >
                  {getTypeIcon(activity.type)}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTypeStyles(
                        activity.type
                      )}`}
                    >
                      {formatActivityType(activity.type)}
                    </span>

                    <span className="text-xs text-gray-500">
                      Created {formatDate(activity.created_at.slice(0, 10))}
                    </span>
                  </div>

                  <h2 className="mt-3 break-words text-xl font-bold text-gray-900 sm:text-2xl">
                    {activity.subject}
                  </h2>

                  {activity.description && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-gray-600">
                      {activity.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Activity Information
                </h3>

                <div className="mt-5 space-y-4">
                  <InfoRow
                    label="Activity Type"
                    value={formatActivityType(activity.type)}
                  />
                  <InfoRow
                    label="Activity Date"
                    value={formatDate(activity.activity_date)}
                  />
                  <InfoRow
                    label="Activity Time"
                    value={formatTime(activity.activity_time)}
                  />
                  <InfoRow
                    label="Created On"
                    value={formatDate(activity.created_at.slice(0, 10))}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Related Records
                </h3>

                <div className="mt-5 space-y-4">
                  {deal ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Deal
                      </p>
                      <Link
                        href={`/deals/${deal.id}`}
                        className="mt-1 block font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {deal.title}
                      </Link>
                      <p className="mt-1 text-sm text-gray-500">
                        {formatValue(deal.value, deal.currency)}
                      </p>
                    </div>
                  ) : (
                    <InfoRow label="Deal" value="Not linked" />
                  )}

                  {contact ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Contact
                      </p>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="mt-1 block font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {contact.first_name} {contact.last_name || ""}
                      </Link>
                      {contact.email && (
                        <p className="mt-1 text-sm text-gray-500">
                          {contact.email}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="text-sm text-gray-500">
                          {contact.phone}
                        </p>
                      )}
                    </div>
                  ) : (
                    <InfoRow label="Contact" value="Not linked" />
                  )}

                  {company ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Company
                      </p>
                      <Link
                        href={`/companies/${company.id}`}
                        className="mt-1 block font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {company.name}
                      </Link>
                      {company.email && (
                        <p className="mt-1 text-sm text-gray-500">
                          {company.email}
                        </p>
                      )}
                      {company.phone && (
                        <p className="text-sm text-gray-500">
                          {company.phone}
                        </p>
                      )}
                      {company.website && (
                        <p className="break-all text-sm text-gray-500">
                          {company.website}
                        </p>
                      )}
                    </div>
                  ) : (
                    <InfoRow label="Company" value="Not linked" />
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="break-words text-sm font-medium text-gray-900 sm:text-right">
        {value}
      </span>
    </div>
  );
}
