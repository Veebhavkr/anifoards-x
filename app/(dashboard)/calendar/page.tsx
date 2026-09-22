"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import CalendarEventForm from "@/components/forms/CalendarEventForm";

type ImportCalendarEvent = {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string;
  contact_name: string;
  company_name: string;
  deal_title: string;
};

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
  created_at: string;
};

function formatDateTime(dateTime: string) {
  return new Date(dateTime).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateTime: string) {
  return new Date(dateTime).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getEventStatus(startAt: string, endAt: string) {
  const now = new Date();
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (now > end) {
    return {
      label: "Completed",
      className: "border-gray-200 bg-gray-100 text-gray-600",
    };
  }

  if (now >= start && now <= end) {
    return {
      label: "Ongoing",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  return {
    label: "Upcoming",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

export default function CalendarPage() {
  const supabase = createClient();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [sortBy, setSortBy] = useState<
    "startAsc" | "startDesc" | "titleAsc" | "titleDesc" | "newest" | "oldest"
  >("startAsc");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportCalendarEvent[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  function parseCsvLine(line: string) {
    const values: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (insideQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (character === "," && !insideQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parseCalendarCsv(csvText: string): ImportCalendarEvent[] {
    const lines = csvText
      .replace(/^\\uFEFF/, "")
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header row and at least one event.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.toLowerCase().replace(/\\s+/g, "_").trim()
    );

    const requiredHeaders = ["title", "start_at", "end_at"];
    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header)
    );

    if (missingHeaders.length > 0) {
      throw new Error(
        `Missing required columns: ${missingHeaders.join(", ")}`
      );
    }

    const getValue = (values: string[], header: string) =>
      values[headers.indexOf(header)]?.trim() || "";

    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const title = getValue(values, "title");
      const startAt = getValue(values, "start_at");
      const endAt = getValue(values, "end_at");
      const allDayValue = getValue(values, "all_day").toLowerCase();

      if (!title) {
        throw new Error(`Row ${index + 2}: title is required.`);
      }

      if (!startAt || Number.isNaN(new Date(startAt).getTime())) {
        throw new Error(`Row ${index + 2}: valid start_at is required.`);
      }

      if (!endAt || Number.isNaN(new Date(endAt).getTime())) {
        throw new Error(`Row ${index + 2}: valid end_at is required.`);
      }

      if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
        throw new Error(`Row ${index + 2}: end_at cannot be before start_at.`);
      }

      return {
        title,
        description: getValue(values, "description"),
        start_at: startAt,
        end_at: endAt,
        all_day: ["true", "1", "yes"].includes(allDayValue),
        location: getValue(values, "location"),
        contact_name: getValue(values, "contact_name"),
        company_name: getValue(values, "company_name"),
        deal_title: getValue(values, "deal_title"),
      };
    });
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError("");
    setImportMessage("");
    setImportRows([]);
    setImportFileName(file.name);

    try {
      const csvText = await file.text();
      setImportRows(parseCalendarCsv(csvText));
    } catch (importParseError) {
      setImportError(
        importParseError instanceof Error
          ? importParseError.message
          : "Unable to parse CSV file."
      );
    }

    event.target.value = "";
  }

  async function handleImportEvents() {
    if (!organizationId || !userId) {
      setImportError("Organization or user information is missing.");
      return;
    }

    if (importRows.length === 0) {
      setImportError("Please upload a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportError("");
    setImportMessage("");

    try {
      const { data: existingEvents, error: existingError } = await supabase
        .from("calendar_events")
        .select("title, start_at")
        .eq("organization_id", organizationId);

      if (existingError) throw existingError;

      const [
        { data: contacts, error: contactsError },
        { data: companies, error: companiesError },
        { data: deals, error: dealsError },
      ] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .eq("organization_id", organizationId),
        supabase
          .from("companies")
          .select("id, name")
          .eq("organization_id", organizationId),
        supabase
          .from("deals")
          .select("id, title")
          .eq("organization_id", organizationId),
      ]);

      if (contactsError) throw contactsError;
      if (companiesError) throw companiesError;
      if (dealsError) throw dealsError;

      const existingKeys = new Set(
        (existingEvents || []).map(
          (event) =>
            `${event.title.trim().toLowerCase()}|${new Date(event.start_at).getTime()}`
        )
      );

      const contactMap = new Map<string, string>();
      (contacts || []).forEach((contact) => {
        const name = `${contact.first_name} ${contact.last_name || ""}`
          .trim()
          .toLowerCase();
        contactMap.set(name, contact.id);
      });

      const companyMap = new Map(
        (companies || []).map((company) => [company.name.trim().toLowerCase(), company.id])
      );

      const dealMap = new Map(
        (deals || []).map((deal) => [deal.title.trim().toLowerCase(), deal.id])
      );

      const seenKeys = new Set<string>();
      const rowsToInsert = importRows
        .map((row) => {
          const key = `${row.title.trim().toLowerCase()}|${new Date(row.start_at).getTime()}`;
          return { row, key };
        })
        .filter(({ key }) => {
          if (existingKeys.has(key) || seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        })
        .map(({ row }) => ({
          organization_id: organizationId,
          created_by: userId,
          title: row.title,
          description: row.description || null,
          start_at: new Date(row.start_at).toISOString(),
          end_at: new Date(row.end_at).toISOString(),
          all_day: row.all_day,
          location: row.location || null,
          contact_id: contactMap.get(row.contact_name.trim().toLowerCase()) || null,
          company_id: companyMap.get(row.company_name.trim().toLowerCase()) || null,
          deal_id: dealMap.get(row.deal_title.trim().toLowerCase()) || null,
          assigned_to: userId,
        }));

      if (rowsToInsert.length === 0) {
        setImportMessage("No new events to import. Duplicates were skipped.");
        return;
      }

      const { error: insertError } = await supabase
        .from("calendar_events")
        .insert(rowsToInsert);

      if (insertError) throw insertError;

      setImportMessage(
        `${rowsToInsert.length} event(s) imported successfully. ${
          importRows.length - rowsToInsert.length
        } duplicate(s) skipped.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadEvents();
    } catch (importInsertError) {
      setImportError(
        importInsertError instanceof Error
          ? importInsertError.message
          : "Unable to import calendar events."
      );
    } finally {
      setImportLoading(false);
    }
  }

  async function loadEvents() {
    setLoading(true);
    setError("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You must be logged in to view calendar events.");
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

    const { data, error: eventsError } = await supabase
      .from("calendar_events")
      .select(
        "id, title, description, start_at, end_at, all_day, location, contact_id, company_id, deal_id, assigned_to, created_at"
      )
      .eq("organization_id", currentOrganizationId)
      .order("start_at", { ascending: true });

    if (eventsError) {
      console.error("Calendar events loading error:", eventsError);
      setError(eventsError.message);
      setLoading(false);
      return;
    }

    setEvents(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();
    const now = new Date();

    return events.filter((event) => {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);

      const matchesSearch =
        !searchTerm ||
        event.title.toLowerCase().includes(searchTerm) ||
        event.description?.toLowerCase().includes(searchTerm) ||
        event.location?.toLowerCase().includes(searchTerm);

      let matchesFilter = true;

      if (filter === "upcoming") {
        matchesFilter = start > now;
      }

      if (filter === "ongoing") {
        matchesFilter = start <= now && end >= now;
      }

      if (filter === "completed") {
        matchesFilter = end < now;
      }

      return matchesSearch && matchesFilter;
    });
  }, [events, search, filter]);

  const sortedEvents = useMemo(() => {
    const items = [...filteredEvents];

    return items.sort((a, b) => {
      if (sortBy === "titleAsc") {
        return a.title.localeCompare(b.title, undefined, {
          sensitivity: "base",
        });
      }

      if (sortBy === "titleDesc") {
        return b.title.localeCompare(a.title, undefined, {
          sensitivity: "base",
        });
      }

      if (sortBy === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }

      if (sortBy === "startDesc") {
        return new Date(b.start_at).getTime() - new Date(a.start_at).getTime();
      }

      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });
  }, [filteredEvents, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedEvents = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedEvents.slice(startIndex, startIndex + pageSize);
  }, [sortedEvents, safeCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const summary = useMemo(() => {
    const now = new Date();

    return {
      total: events.length,
      upcoming: events.filter(
        (event) => new Date(event.start_at) > now
      ).length,
      ongoing: events.filter(
        (event) =>
          new Date(event.start_at) <= now &&
          new Date(event.end_at) >= now
      ).length,
      completed: events.filter(
        (event) => new Date(event.end_at) < now
      ).length,
    };
  }, [events]);

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Workspace / Calendar
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Calendar
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Schedule meetings, events and important business activities.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowImport((current) => !current)}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              {showImport ? "Close Import" : "Import CSV"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {showForm ? "Close Form" : "+ Add Event"}
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Total Events"
            value={summary.total}
            icon="▦"
          />

          <SummaryCard
            label="Upcoming"
            value={summary.upcoming}
            icon="◷"
          />

          <SummaryCard
            label="Ongoing"
            value={summary.ongoing}
            icon="●"
          />

          <SummaryCard
            label="Completed"
            value={summary.completed}
            icon="✓"
          />
        </div>

        {/* Add Event Form */}
        {showForm && organizationId && userId && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                Create New Event
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Add an event to your organization calendar.
              </p>
            </div>

            <CalendarEventForm
              organizationId={organizationId}
              userId={userId}
              onSuccess={() => {
                setShowForm(false);
                loadEvents();
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {showImport && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">
                Import Calendar Events
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Upload a CSV file to import multiple calendar events.
              </p>
            </div>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
            />

            {importFileName && (
              <p className="mt-2 text-xs text-gray-500">
                Selected file: {importFileName}
              </p>
            )}

            {importError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            )}

            {importMessage && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {importMessage}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="mt-5">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Preview ({importRows.length} events)
                  </h3>
                  <span className="text-xs text-gray-500">
                    Showing first {Math.min(importRows.length, 10)} rows
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Title</th>
                        <th className="px-3 py-3 font-semibold">Start</th>
                        <th className="px-3 py-3 font-semibold">End</th>
                        <th className="px-3 py-3 font-semibold">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, index) => (
                        <tr key={`${row.title}-${index}`} className="border-t border-gray-100">
                          <td className="px-3 py-3 text-gray-900">{row.title}</td>
                          <td className="px-3 py-3 text-gray-600">{row.start_at}</td>
                          <td className="px-3 py-3 text-gray-600">{row.end_at}</td>
                          <td className="px-3 py-3 text-gray-600">{row.location || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  disabled={importLoading}
                  onClick={handleImportEvents}
                  className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {importLoading ? "Importing..." : "Import Events"}
                </button>
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-gray-500">
              Required columns: title, start_at, end_at. Optional columns:
              description, all_day, location, contact_name, company_name, deal_title.
            </p>
          </div>
        )}

        {/* Search and Filters */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <label htmlFor="calendar-search" className="sr-only">
                Search events
              </label>

              <input
                id="calendar-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search events, descriptions or locations..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3 md:w-auto">
              <div>
                <label htmlFor="calendar-filter" className="sr-only">
                  Filter events
                </label>

                <select
                  id="calendar-filter"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="all">All Events</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label htmlFor="calendar-sort" className="sr-only">
                  Sort events
                </label>

                <select
                  id="calendar-sort"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value as
                        | "startAsc"
                        | "startDesc"
                        | "titleAsc"
                        | "titleDesc"
                        | "newest"
                        | "oldest"
                    )
                  }
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="startAsc">Start Date ↑</option>
                  <option value="startDesc">Start Date ↓</option>
                  <option value="newest">Newest Added</option>
                  <option value="oldest">Oldest Added</option>
                  <option value="titleAsc">Title A–Z</option>
                  <option value="titleDesc">Title Z–A</option>
                </select>
              </div>

              <div>
                <label htmlFor="calendar-page-size" className="sr-only">
                  Events per page
                </label>

                <select
                  id="calendar-page-size"
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
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">
              Loading calendar events...
            </p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500">
              ▦
            </div>

            <h3 className="text-base font-semibold text-gray-900">
              No events found
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Try changing your search or create a new event.
            </p>

            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Add Event
            </button>
          </div>
        ) : (
          /* Events List */
          <div className="space-y-4">
            {paginatedEvents.map((event) => {
              const status = getEventStatus(
                event.start_at,
                event.end_at
              );

              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg text-blue-600">
                        ▦
                      </div>

                      <div className="min-w-0">
                        <h3 className="break-words text-base font-semibold text-gray-900">
                          <Link
                            href={`/calendar/${event.id}`}
                            className="transition hover:text-blue-600 hover:underline"
                          >
                            {event.title}
                          </Link>
                        </h3>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}
                          >
                            {status.label}
                          </span>

                          {event.all_day && (
                            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
                              All Day
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(event.start_at)}
                      </p>

                      {!event.all_day && (
                        <p className="mt-1 text-xs text-gray-500">
                          {formatDateTime(event.start_at).split(", ").slice(1).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {event.description && (
                    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                      {event.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                    <span>
                      <strong className="font-medium text-gray-700">
                        Start:
                      </strong>{" "}
                      {formatDateTime(event.start_at)}
                    </span>

                    <span>
                      <strong className="font-medium text-gray-700">
                        End:
                      </strong>{" "}
                      {formatDateTime(event.end_at)}
                    </span>

                    {event.location && (
                      <span>
                        <strong className="font-medium text-gray-700">
                          Location:
                        </strong>{" "}
                        {event.location}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/calendar/${event.id}`}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      View Details
                    </Link>

                    <Link
                      href={`/calendar/${event.id}?edit=true`}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                    >
                      Edit Event
                    </Link>

                    <button
                      type="button"
                      onClick={async () => {
                        const confirmed = window.confirm(
                          "Are you sure you want to delete this event?"
                        );

                        if (!confirmed) return;

                        const { error: deleteError } = await supabase
                          .from("calendar_events")
                          .delete()
                          .eq("id", event.id)
                          .eq("organization_id", organizationId);

                        if (deleteError) {
                          setError(deleteError.message);
                          return;
                        }

                        await loadEvents();
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedEvents.length > 0 && (
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-900">
                {(safeCurrentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-gray-900">
                {Math.min(safeCurrentPage * pageSize, sortedEvents.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-900">
                {sortedEvents.length}
              </span>{" "}
              events
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="px-2 text-sm font-medium text-gray-600">
                Page {safeCurrentPage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
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