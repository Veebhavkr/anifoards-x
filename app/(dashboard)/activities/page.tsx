"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import ActivityForm from "@/components/forms/ActivityForm";

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
  created_at: string;
};

type RelatedDeal = {
  id: string;
  title: string;
};

type RelatedContact = {
  id: string;
  first_name: string;
  last_name: string | null;
};

type RelatedCompany = {
  id: string;
  name: string;
};


type ImportActivity = {
  type: string;
  subject: string;
  description: string;
  activity_date: string;
  activity_time: string;
  deal_title: string;
  contact_name: string;
  company_name: string;
};

const activityTypes = [
  { value: "all", label: "All Activities" },
  { value: "call", label: "Calls" },
  { value: "meeting", label: "Meetings" },
  { value: "email", label: "Emails" },
  { value: "note", label: "Notes" },
  { value: "follow_up", label: "Follow-ups" },
];

function formatActivityType(type: string) {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date: string | null) {
  if (!date) return "No date";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
  if (!time) return "";

  const [hours, minutes] = time.split(":").map(Number);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return time;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
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

export default function ActivitiesPage() {
  const supabase = createClient();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<RelatedDeal[]>([]);
  const [contacts, setContacts] = useState<RelatedContact[]>([]);
  const [companies, setCompanies] = useState<RelatedCompany[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingActivity, setEditingActivity] =
    useState<Activity | null>(null);

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "subjectAsc" | "subjectDesc" | "activityDate"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportActivity[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  async function loadActivities() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be logged in to view activities.");
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      setError(membershipError.message);
      setLoading(false);
      return;
    }

    if (!membership?.organization_id) {
      setError("No organization found for this account.");
      setLoading(false);
      return;
    }

    const currentOrganizationId = membership.organization_id;

    setOrganizationId(currentOrganizationId);

    const { data, error: activitiesError } = await supabase
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
    created_at
  `
)
      .eq("organization_id", currentOrganizationId)
      .order("created_at", { ascending: false });

    if (activitiesError) {
      console.error("Activities loading error:", activitiesError);
      setError(activitiesError.message);
      setLoading(false);
      return;
    }

    const [dealsResult, contactsResult, companiesResult] =
      await Promise.all([
        supabase
          .from("deals")
          .select("id, title")
          .eq("organization_id", currentOrganizationId)
          .order("created_at", { ascending: false }),

        supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .eq("organization_id", currentOrganizationId)
          .order("created_at", { ascending: false }),

        supabase
          .from("companies")
          .select("id, name")
          .eq("organization_id", currentOrganizationId)
          .order("created_at", { ascending: false }),
      ]);

    if (dealsResult.error || contactsResult.error || companiesResult.error) {
      const relationError =
        dealsResult.error || contactsResult.error || companiesResult.error;

      console.error("Related records loading error:", relationError);
      setError(relationError?.message || "Unable to load related records.");
      setLoading(false);
      return;
    }

    setDeals(dealsResult.data || []);
    setContacts(contactsResult.data || []);
    setCompanies(companiesResult.data || []);
    setActivities(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadActivities();
  }, []);

  function parseCsvLine(line: string) {
    const values: string[] = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      const nextCharacter = line[index + 1];

      if (character === '"' && quoted && nextCharacter === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        values.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }

    values.push(value.trim());
    return values;
  }

  function parseActivitiesCsv(csvText: string): ImportActivity[] {
    const lines = csvText.replace(/^\\uFEFF/, "").split(/\\r?\\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("CSV must contain a header and at least one row.");

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim().replace(/\\s+/g, "_"));
    const requiredHeaders = ["type", "subject"];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);

    const allowedTypes = ["call", "meeting", "email", "note", "follow_up"];
    return lines.slice(1).map((line, rowIndex) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      const type = String(row.type || "").trim().toLowerCase().replace(/\\s+/g, "_");
      const subject = String(row.subject || "").trim();

      if (!allowedTypes.includes(type)) {
        throw new Error(`Row ${rowIndex + 2}: type must be call, meeting, email, note, or follow_up.`);
      }
      if (!subject) throw new Error(`Row ${rowIndex + 2}: subject is required.`);

      return {
        type,
        subject,
        description: String(row.description || "").trim(),
        activity_date: String(row.activity_date || "").trim(),
        activity_time: String(row.activity_time || "").trim(),
        deal_title: String(row.deal_title || "").trim(),
        contact_name: String(row.contact_name || "").trim(),
        company_name: String(row.company_name || "").trim(),
      };
    });
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportMessage("");
    setImportError("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        setImportRows(parseActivitiesCsv(String(reader.result || "")));
      } catch (importParseError) {
        setImportRows([]);
        setImportError(importParseError instanceof Error ? importParseError.message : "Unable to parse CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImportActivities() {
    if (!importRows.length) {
      setImportError("Please select a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportMessage("");
    setImportError("");

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You must be logged in to import activities.");

      const normalizedExisting = new Set(
        activities.map((activity) => `${activity.type}|${activity.subject.trim().toLowerCase()}|${activity.activity_date || ""}`),
      );
      const seen = new Set<string>();
      const rowsToInsert = importRows.filter((row) => {
        const key = `${row.type}|${row.subject.toLowerCase()}|${row.activity_date}`;
        if (normalizedExisting.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (!rowsToInsert.length) throw new Error("No new activities found. Duplicate activities were skipped.");

      const dealMap = new Map(deals.map((deal) => [deal.title.trim().toLowerCase(), deal.id]));
      const companyMap = new Map(companies.map((company) => [company.name.trim().toLowerCase(), company.id]));
      const contactMap = new Map(
        contacts.map((contact) => [`${contact.first_name} ${contact.last_name || ""}`.trim().toLowerCase(), contact.id]),
      );

      const payload = rowsToInsert.map((row) => ({
        organization_id: organizationId,
        created_by: user.id,
        type: row.type,
        subject: row.subject,
        description: row.description || null,
        activity_date: row.activity_date || null,
        activity_time: row.activity_time || null,
        deal_id: dealMap.get(row.deal_title.toLowerCase()) || null,
        contact_id: contactMap.get(row.contact_name.toLowerCase()) || null,
        company_id: companyMap.get(row.company_name.toLowerCase()) || null,
      }));

      const { error: insertError } = await supabase.from("activities").insert(payload);
      if (insertError) throw new Error(insertError.message);

      setImportMessage(`${rowsToInsert.length} activities imported successfully.`);
      setImportRows([]);
      setImportFileName("");
      await loadActivities();
    } catch (importErrorValue) {
      setImportError(importErrorValue instanceof Error ? importErrorValue.message : "Unable to import activities.");
    } finally {
      setImportLoading(false);
    }
  }

  function openCreateForm() {
    setEditingActivity(null);
    setShowForm(true);
  }

  function openEditForm(activity: Activity) {
    setEditingActivity(activity);
    setShowForm(true);
  }

  function closeForm() {
    setEditingActivity(null);
    setShowForm(false);
  }

  async function handleDeleteActivity(activityId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this activity?"
    );

    if (!confirmed) return;

    setError("");

    const { error: deleteError } = await supabase
      .from("activities")
      .delete()
      .eq("id", activityId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      console.error("Activity deletion error:", deleteError);
      setError(deleteError.message);
      return;
    }

    setActivities((currentActivities) =>
      currentActivities.filter((activity) => activity.id !== activityId)
    );

    if (editingActivity?.id === activityId) {
      closeForm();
    }
  }

  function getDealTitle(dealId: string | null) {
    if (!dealId) return null;
    return deals.find((deal) => deal.id === dealId)?.title || "Unknown deal";
  }

  function getContactName(contactId: string | null) {
    if (!contactId) return null;
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact) return "Unknown contact";
    return `${contact.first_name} ${contact.last_name || ""}`.trim();
  }

  function getCompanyName(companyId: string | null) {
    if (!companyId) return null;
    return companies.find((company) => company.id === companyId)?.name || "Unknown company";
  }

  const filteredActivities = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();

    return activities.filter((activity) => {
      const matchesSearch =
        !searchTerm ||
        activity.subject.toLowerCase().includes(searchTerm) ||
        activity.description?.toLowerCase().includes(searchTerm) ||
        activity.type.toLowerCase().includes(searchTerm);

      const matchesType =
        typeFilter === "all" || activity.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [activities, search, typeFilter]);

  const sortedActivities = useMemo(() => {
    return [...filteredActivities].sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      }

      if (sortBy === "subjectAsc") {
        return a.subject.localeCompare(b.subject, undefined, {
          sensitivity: "base",
        });
      }

      if (sortBy === "subjectDesc") {
        return b.subject.localeCompare(a.subject, undefined, {
          sensitivity: "base",
        });
      }

      if (sortBy === "activityDate") {
        const dateA = a.activity_date
          ? new Date(`${a.activity_date}T${a.activity_time || "00:00"}`).getTime()
          : Number.MAX_SAFE_INTEGER;
        const dateB = b.activity_date
          ? new Date(`${b.activity_date}T${b.activity_time || "00:00"}`).getTime()
          : Number.MAX_SAFE_INTEGER;

        return dateA - dateB;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [filteredActivities, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedActivities.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedActivities = sortedActivities.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const summary = useMemo(() => {
    return {
      total: activities.length,

      calls: activities.filter(
        (activity) => activity.type === "call"
      ).length,

      meetings: activities.filter(
        (activity) => activity.type === "meeting"
      ).length,

      followUps: activities.filter(
        (activity) => activity.type === "follow_up"
      ).length,
    };
  }, [activities]);

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Workspace / Activities
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Activities
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Track calls, meetings, emails, notes and follow-ups.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowImport(true);
              setImportMessage("");
              setImportError("");
            }}
            className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100"
          >
            Import CSV
          </button>

          <button
            type="button"
            onClick={() => {
              if (showForm) {
                closeForm();
              } else {
                openCreateForm();
              }
            }}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            {showForm ? "Close Form" : "+ Add Activity"}
          </button>
        </div>

        {showImport && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Import Activities from CSV</h2>
                <p className="mt-1 text-sm text-gray-600">Required columns: type, subject. Optional relation names must match existing records.</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} className="text-sm font-semibold text-gray-500 hover:text-gray-900">Close</button>
            </div>
            <input type="file" accept=".csv,text/csv" onChange={handleImportFile} className="mt-4 block w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm" />
            {importFileName && <p className="mt-2 text-xs text-gray-500">Selected: {importFileName}</p>}
            {importError && <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{importError}</p>}
            {importMessage && <p className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-700">{importMessage}</p>}
            {importRows.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-blue-100 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Date</th></tr></thead>
                  <tbody>{importRows.slice(0, 10).map((row, index) => <tr key={`${row.subject}-${index}`} className="border-t"><td className="px-3 py-2">{row.type}</td><td className="px-3 py-2">{row.subject}</td><td className="px-3 py-2">{row.activity_date || "—"}</td></tr>)}</tbody>
                </table>
                {importRows.length > 10 && <p className="px-3 py-2 text-xs text-gray-500">Showing first 10 of {importRows.length} rows.</p>}
              </div>
            )}
            <button type="button" disabled={importLoading || !importRows.length} onClick={handleImportActivities} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{importLoading ? "Importing..." : "Import Activities"}</button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Total Activities"
            value={summary.total}
            icon="▤"
          />

          <SummaryCard
            label="Calls"
            value={summary.calls}
            icon="☎"
          />

          <SummaryCard
            label="Meetings"
            value={summary.meetings}
            icon="▦"
          />

          <SummaryCard
            label="Follow-ups"
            value={summary.followUps}
            icon="↻"
          />
        </div>

        {/* Activity Form */}
        {showForm && organizationId && userId && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingActivity
                  ? "Edit Activity"
                  : "Create New Activity"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {editingActivity
                  ? "Update the activity details."
                  : "Record a new interaction or follow-up."}
              </p>
            </div>

            <ActivityForm
              organizationId={organizationId}
              userId={userId}
              activity={editingActivity}
              onSuccess={() => {
                closeForm();
                loadActivities();
              }}
              onCancel={closeForm}
            />
          </div>
        )}

        {/* Search and Filters */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label htmlFor="activity-search" className="sr-only">
                Search activities
              </label>

              <input
                id="activity-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by subject, description or type..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="md:w-56">
              <label htmlFor="activity-filter" className="sr-only">
                Filter activities
              </label>

              <select
                id="activity-filter"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {activityTypes.map((activityType) => (
                  <option
                    key={activityType.value}
                    value={activityType.value}
                  >
                    {activityType.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:w-56">
              <label htmlFor="activity-sort" className="sr-only">
                Sort activities
              </label>
              <select
                id="activity-sort"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value as
                      | "newest"
                      | "oldest"
                      | "subjectAsc"
                      | "subjectDesc"
                      | "activityDate"
                  )
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="subjectAsc">Subject A–Z</option>
                <option value="subjectDesc">Subject Z–A</option>
                <option value="activityDate">Activity Date</option>
              </select>
            </div>

            <div className="md:w-40">
              <label htmlFor="activity-page-size" className="sr-only">
                Activities per page
              </label>
              <select
                id="activity-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Activities Content */}
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">
              Loading activities...
            </p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500">
              ▤
            </div>

            <h3 className="text-base font-semibold text-gray-900">
              No activities found
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Try changing your search or create a new activity.
            </p>

            <button
              type="button"
              onClick={openCreateForm}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Add Activity
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedActivities.map((activity) => (
              <div
                key={activity.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg ${getTypeStyles(
                        activity.type
                      )}`}
                    >
                      {getTypeIcon(activity.type)}
                    </div>

                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold text-gray-900">
                        {activity.subject}
                      </h3>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getTypeStyles(
                            activity.type
                          )}`}
                        >
                          {formatActivityType(activity.type)}
                        </span>

                        <span className="text-xs text-gray-500">
                          {formatDate(activity.activity_date)}
                        </span>

                        {activity.activity_time && (
                          <>
                            <span className="text-gray-300">
                              •
                            </span>

                            <span className="text-xs text-gray-500">
                              {formatTime(activity.activity_time)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(activity)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteActivity(activity.id)
                      }
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {activity.description && (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                    {activity.description}
                  </p>
                )}

                {(activity.deal_id || activity.contact_id || activity.company_id) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activity.deal_id && (
                      <Link
                        href={`/deals/${activity.deal_id}`}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                      >
                        Deal: {getDealTitle(activity.deal_id)}
                      </Link>
                    )}

                    {activity.contact_id && (
                      <Link
                        href={`/contacts/${activity.contact_id}`}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Contact: {getContactName(activity.contact_id)}
                      </Link>
                    )}

                    {activity.company_id && (
                      <Link
                        href={`/companies/${activity.company_id}`}
                        className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100"
                      >
                        Company: {getCompanyName(activity.company_id)}
                      </Link>
                    )}
                  </div>
                )}

                <div className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-400">
                  Created{" "}
                  {new Date(activity.created_at).toLocaleDateString(
                    "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }
                  )}
                </div>
              </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm text-gray-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing{" "}
                {sortedActivities.length === 0
                  ? 0
                  : (safeCurrentPage - 1) * pageSize + 1}{" "}
                to{" "}
                {Math.min(safeCurrentPage * pageSize, sortedActivities.length)}{" "}
                of {sortedActivities.length} activities
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-500 sm:text-sm">
          {label}
        </span>

        <span className="text-lg text-gray-400">{icon}</span>
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        {value}
      </p>
    </div>
  );
}