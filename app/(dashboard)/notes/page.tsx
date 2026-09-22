"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import NoteForm, { type RelatedOption } from "@/components/forms/NoteForm";

type Note = {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
};

type ImportNote = {
  title: string;
  content: string;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<RelatedOption[]>([]);
  const [companies, setCompanies] = useState<RelatedOption[]>([]);
  const [leads, setLeads] = useState<RelatedOption[]>([]);
  const [deals, setDeals] = useState<RelatedOption[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "titleAsc" | "titleDesc"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportNote[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function parseCsvLine(line: string) {
    const values: string[] = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        values.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parseNotesCsv(csvText: string): ImportNote[] {
    const lines = csvText
      .replace(/^\\uFEFF/, "")
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header row and at least one data row.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.toLowerCase().trim().replace(/\\s+/g, "_")
    );

    if (!headers.includes("title")) {
      throw new Error("Missing required column: title");
    }

    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(
        headers.map((header, valueIndex) => [header, values[valueIndex] || ""])
      );

      const title = String(row.title || "").trim();
      if (!title) {
        throw new Error(`Row ${index + 2}: title is required.`);
      }

      return {
        title,
        content: String(row.content || "").trim(),
      };
    });
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportRows([]);
    setImportMessage("");
    setImportError("");

    const reader = new FileReader();

    reader.onload = () => {
      try {
        setImportRows(parseNotesCsv(String(reader.result || "")));
      } catch (parseError) {
        setImportError(
          parseError instanceof Error ? parseError.message : "Unable to parse CSV."
        );
      }
    };

    reader.onerror = () => setImportError("Unable to read the selected CSV file.");
    reader.readAsText(file);
  }

  async function handleImportNotes() {
    if (!organizationId || !userId || importRows.length === 0) return;

    setImportLoading(true);
    setImportMessage("");
    setImportError("");

    try {
      const supabase = createClient();

      const { data: existingNotes, error: existingError } = await supabase
        .from("notes")
        .select("title")
        .eq("organization_id", organizationId);

      if (existingError) throw existingError;

      const existingTitles = new Set(
        (existingNotes || []).map((note) => note.title.trim().toLowerCase())
      );
      const seenTitles = new Set<string>();

      const payload = importRows
        .filter((row) => {
          const normalizedTitle = row.title.trim().toLowerCase();
          if (existingTitles.has(normalizedTitle) || seenTitles.has(normalizedTitle)) {
            return false;
          }
          seenTitles.add(normalizedTitle);
          return true;
        })
        .map((row) => ({
          organization_id: organizationId,
          created_by: userId,
          title: row.title,
          content: row.content || null,
        }));

      if (payload.length === 0) {
        setImportMessage("No new notes to import. Duplicate titles were skipped.");
        return;
      }

      const { error: insertError } = await supabase
        .from("notes")
        .insert(payload);

      if (insertError) throw insertError;

      setImportMessage(`${payload.length} notes imported successfully.`);
      setImportRows([]);
      setImportFileName("");
      await loadNotes();
    } catch (importErrorValue) {
      setImportError(
        importErrorValue instanceof Error
          ? importErrorValue.message
          : "Unable to import notes."
      );
    } finally {
      setImportLoading(false);
    }
  }

  async function getCurrentOrganization() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        organizationId: null,
        userId: null,
      };
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      throw new Error(membershipError.message);
    }

    return {
      organizationId: membership?.organization_id ?? null,
      userId: user.id,
    };
  }

  async function loadNotes() {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        organizationId: currentOrganizationId,
        userId: currentUserId,
      } = await getCurrentOrganization();

      if (!currentOrganizationId || !currentUserId) {
        setError("No organization found. Please login first.");
        setLoading(false);
        return;
      }

      setOrganizationId(currentOrganizationId);
      setUserId(currentUserId);

      const { data, error: notesError } = await supabase
        .from("notes")
        .select(
          "id, organization_id, created_by, title, content, created_at, updated_at, contact_id, company_id, lead_id, deal_id"
        )
        .eq("organization_id", currentOrganizationId)
        .order("created_at", { ascending: false });

      if (notesError) {
        throw new Error(notesError.message);
      }

      setNotes(data ?? []);

      const [
        { data: contactRows, error: contactsError },
        { data: companyRows, error: companiesError },
        { data: leadRows, error: leadsError },
        { data: dealRows, error: dealsError },
      ] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .eq("organization_id", currentOrganizationId)
          .order("first_name"),
        supabase
          .from("companies")
          .select("id, name")
          .eq("organization_id", currentOrganizationId)
          .order("name"),
        supabase
          .from("leads")
          .select("id, first_name, last_name")
          .eq("organization_id", currentOrganizationId)
          .order("first_name"),
        supabase
          .from("deals")
          .select("id, title")
          .eq("organization_id", currentOrganizationId)
          .order("title"),
      ]);

      if (contactsError || companiesError || leadsError || dealsError) {
        throw new Error(
          contactsError?.message ||
            companiesError?.message ||
            leadsError?.message ||
            dealsError?.message ||
            "Unable to load related records."
        );
      }

      setContacts(
        (contactRows ?? []).map((row) => ({
          id: row.id,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed contact",
        }))
      );
      setCompanies(
        (companyRows ?? []).map((row) => ({ id: row.id, name: row.name }))
      );
      setLeads(
        (leadRows ?? []).map((row) => ({
          id: row.id,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed lead",
        }))
      );
      setDeals(
        (dealRows ?? []).map((row) => ({ id: row.id, name: row.title }))
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notes."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotes();
  }, []);

  function openCreateForm() {
    setEditingNote(null);
    setError("");
    setShowForm(true);
  }

  function openEditForm(note: Note) {
    setEditingNote(note);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingNote(null);
  }

  async function handleDeleteNote(noteId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this note?"
    );

    if (!confirmed) {
      return;
    }

    if (!organizationId) {
      setError("Organization not found.");
      return;
    }

    setError("");

    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", noteId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setNotes((currentNotes) =>
      currentNotes.filter((note) => note.id !== noteId)
    );

    if (editingNote?.id === noteId) {
      closeForm();
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return notes;
    }

    return notes.filter((note) => {
      const title = note.title.toLowerCase();
      const content = note.content?.toLowerCase() ?? "";

      return title.includes(query) || content.includes(query);
    });
  }, [notes, search]);

  const sortedNotes = useMemo(() => {
    const result = [...filteredNotes];

    result.sort((a, b) => {
      if (sortBy === "titleAsc") {
        return a.title.localeCompare(b.title);
      }

      if (sortBy === "titleDesc") {
        return b.title.localeCompare(a.title);
      }

      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();

      return sortBy === "oldest" ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [filteredNotes, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedNotes.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedNotes = sortedNotes.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Dashboard / Workspace / Notes
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Notes
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Create and manage your organization notes.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            + Add Note
          </button>

          <button
            type="button"
            onClick={() => {
              setShowImport((current) => !current);
              setImportMessage("");
              setImportError("");
            }}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            {showImport ? "Close Import" : "Import CSV"}
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Total Notes
            </p>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {notes.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Notes in your organization
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">
              Search Results
            </p>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {filteredNotes.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Matching notes
            </p>
          </div>
        </div>

        {showImport && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Import Notes from CSV
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Required column: title. Optional column: content.
              </p>
            </div>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              className="block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm"
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
              <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800">
                  Preview: {importRows.length} rows
                </div>
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Content</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.title}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="max-w-md px-3 py-2">{row.content || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 10 && (
                  <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                    Showing first 10 rows only.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importLoading || importRows.length === 0}
                onClick={handleImportNotes}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importing..." : "Import Notes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportRows([]);
                  setImportFileName("");
                  setImportMessage("");
                  setImportError("");
                }}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {showForm && organizationId && userId && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingNote ? "Edit Note" : "Create New Note"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingNote
                    ? "Update your existing note."
                    : "Add a new note to your organization."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <NoteForm
              organizationId={organizationId}
              userId={userId}
              note={editingNote}
              contacts={contacts}
              companies={companies}
              leads={leads}
              deals={deals}
              onSuccess={() => {
                closeForm();
                loadNotes();
              }}
              onCancel={closeForm}
            />
          </div>
        )}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Your Notes
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Search and manage your saved notes.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes..."
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black sm:w-80"
            />

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as
                    | "newest"
                    | "oldest"
                    | "titleAsc"
                    | "titleDesc"
                )
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="titleAsc">Title A–Z</option>
              <option value="titleDesc">Title Z–A</option>
            </select>

            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

              <p className="text-sm text-gray-500">
                Loading notes...
              </p>
            </div>
          ) : sortedNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {search ? "No notes found" : "No notes yet"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {search
                  ? "Try a different search term."
                  : "Create your first note to get started."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
                >
                  Create Note
                </button>
              )}
            </div>
          ) : (
            paginatedNotes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {note.title}
                    </h3>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                      {note.content}
                    </p>

                    {(note.contact_id || note.company_id || note.lead_id || note.deal_id) && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
                        {note.contact_id && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            Contact: {contacts.find((item) => item.id === note.contact_id)?.name ?? "Linked"}
                          </span>
                        )}
                        {note.company_id && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            Company: {companies.find((item) => item.id === note.company_id)?.name ?? "Linked"}
                          </span>
                        )}
                        {note.lead_id && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            Lead: {leads.find((item) => item.id === note.lead_id)?.name ?? "Linked"}
                          </span>
                        )}
                        {note.deal_id && (
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            Deal: {deals.find((item) => item.id === note.deal_id)?.name ?? "Linked"}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="mt-4 text-xs text-gray-400">
                      Created {formatDate(note.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(note)}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {sortedNotes.length > 0 && (
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm sm:flex-row sm:items-center">
            <p>
              Showing{" "}
              <span className="font-semibold text-gray-900">
                {(safeCurrentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-gray-900">
                {Math.min(safeCurrentPage * pageSize, sortedNotes.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-900">
                {sortedNotes.length}
              </span>{" "}
              notes
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="rounded-lg border border-gray-200 px-4 py-2 font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>

              <span className="px-2 font-medium text-gray-900">
                Page {safeCurrentPage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                className="rounded-lg border border-gray-200 px-4 py-2 font-medium transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
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