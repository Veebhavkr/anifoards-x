"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import ContactForm from "@/components/forms/ContactForm";

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  owner_id: string | null;
};

type ImportContact = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "nameAsc" | "nameDesc">("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportContact[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  async function loadContacts() {
    setLoading(true);

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const organizationId = membership?.organization_id;

    setOrganizationId(organizationId ?? null);

    if (!organizationId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, job_title, owner_id"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading contacts:", error);
      setContacts([]);
    } else {
      setContacts(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");

    if (!editId || contacts.length === 0 || editingContact?.id === editId) {
      return;
    }

    const contactToEdit = contacts.find((contact) => contact.id === editId);

    if (contactToEdit) {
      setEditingContact(contactToEdit);
      setShowForm(true);
    }
  }, [contacts, editingContact]);

  function handleContactSaved() {
    setShowForm(false);
    setEditingContact(null);
    loadContacts();
  }

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

  function parseContactsCsv(content: string): ImportContact[] {
    const lines = content
      .replace(/^\\uFEFF/, "")
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header row and at least one data row.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.toLowerCase().replace(/\\s+/g, "_")
    );

    const requiredHeaders = ["first_name"];
    const missingHeader = requiredHeaders.find(
      (header) => !headers.includes(header)
    );

    if (missingHeader) {
      throw new Error(`Missing required CSV column: ${missingHeader}`);
    }

    return lines.slice(1).map((line, rowIndex) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""])
      );

      if (!row.first_name?.trim()) {
        throw new Error(`Row ${rowIndex + 2}: first_name is required.`);
      }

      return {
        first_name: row.first_name.trim(),
        last_name: row.last_name?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        job_title: row.job_title?.trim() || null,
      };
    });
  }

  async function handleCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError("");
    setImportMessage("");
    setImportRows([]);
    setImportFileName(file.name);

    try {
      const content = await file.text();
      const rows = parseContactsCsv(content);
      setImportRows(rows);
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to read CSV file."
      );
    }

    event.target.value = "";
  }

  async function handleImportContacts() {
    if (!organizationId) {
      setImportError("Organization not found. Please login first.");
      return;
    }

    if (importRows.length === 0) {
      setImportError("Please select a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportError("");
    setImportMessage("");

    try {
      const existingEmails = new Set(
        contacts
          .map((contact) => contact.email?.trim().toLowerCase())
          .filter(Boolean)
      );

      const uniqueRows = importRows.filter(
        (row) => !row.email || !existingEmails.has(row.email.toLowerCase())
      );

      if (uniqueRows.length === 0) {
        throw new Error("All CSV contacts already exist or have duplicate emails.");
      }

      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Please login first.");
      }

      const payload = uniqueRows.map((row) => ({
  organization_id: organizationId,
  owner_id: userData.user.id,
  created_by: userData.user.id,
  first_name: row.first_name,
  last_name: row.last_name,
  email: row.email,
  phone: row.phone,
  job_title: row.job_title,
}));

      const { error } = await supabase.from("contacts").insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      setImportMessage(
        `${uniqueRows.length} contact(s) imported successfully.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadContacts();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to import contacts."
      );
    } finally {
      setImportLoading(false);
    }
  }

  async function handleDeleteContact(contact: Contact) {
    const confirmed = window.confirm(`Delete ${contact.first_name} ${contact.last_name ?? ""}?`);
    if (!confirmed) return;
    setActionError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionError("Please login first."); return; }
    const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (!membership?.organization_id) { setActionError("No organization found."); return; }
    const { error } = await supabase.from("contacts").delete().eq("id", contact.id).eq("organization_id", membership.organization_id);
    if (error) { setActionError(error.message); return; }
    await loadContacts();
  }

  const filteredContacts = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return contacts;

    return contacts.filter((contact) => {
      const fullName = `${contact.first_name} ${
        contact.last_name ?? ""
      }`.toLowerCase();

      return (
        fullName.includes(query) ||
        (contact.email ?? "").toLowerCase().includes(query) ||
        (contact.phone ?? "").toLowerCase().includes(query) ||
        (contact.job_title ?? "").toLowerCase().includes(query)
      );
    });
  }, [contacts, search]);

  const sortedContacts = useMemo(() => {
    const sorted = [...filteredContacts];

    if (sortBy === "oldest") {
      sorted.reverse();
    }

    sorted.sort((a, b) => {
      if (sortBy === "nameAsc" || sortBy === "nameDesc") {
        const nameA = `${a.first_name} ${a.last_name ?? ""}`.trim().toLowerCase();
        const nameB = `${b.first_name} ${b.last_name ?? ""}`.trim().toLowerCase();
        const comparison = nameA.localeCompare(nameB);
        return sortBy === "nameAsc" ? comparison : -comparison;
      }

      return 0;
    });

    return sorted;
  }, [filteredContacts, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedContacts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedContacts = sortedContacts.slice(
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

  function getInitials(contact: Contact) {
    const first = contact.first_name?.charAt(0) ?? "";
    const last = contact.last_name?.charAt(0) ?? "";

    return `${first}${last}`.toUpperCase() || "U";
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>CRM</span>
              <span>/</span>
              <span>Contacts</span>
            </div>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Contacts
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage your customers, clients, and business relationships.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setShowImport(true);
                setImportError("");
                setImportMessage("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50"
            >
              Import CSV
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingContact(null);
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700"
            >
              <span className="text-lg">+</span>
              Add Contact
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Total Contacts
              </p>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg">
                👥
              </div>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {contacts.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Contacts in your organization
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Available Results
              </p>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-lg">
                ✓
              </div>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {filteredContacts.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Matching your search
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                CRM Status
              </p>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-lg">
                ⚡
              </div>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              Active
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Your contacts workspace
            </p>
          </div>
        </div>

        {showImport && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Bulk Import
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  Import Contacts from CSV
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Required column: first_name. Optional columns: last_name, email, phone, job_title.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportRows([]);
                  setImportFileName("");
                  setImportError("");
                  setImportMessage("");
                }}
                className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="block w-full text-sm text-gray-600"
              />
              {importFileName && (
                <p className="mt-2 text-xs text-gray-500">
                  Selected: {importFileName}
                </p>
              )}
            </div>

            {importError && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {importError}
              </p>
            )}

            {importMessage && (
              <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {importMessage}
              </p>
            )}

            {importRows.length > 0 && (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">
                    Preview: {importRows.length} row(s)
                  </p>
                  <button
                    type="button"
                    disabled={importLoading}
                    onClick={handleImportContacts}
                    className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importLoading ? "Importing..." : "Import Contacts"}
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-[650px] w-full text-left text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 font-semibold text-gray-600">First Name</th>
                        <th className="px-3 py-3 font-semibold text-gray-600">Last Name</th>
                        <th className="px-3 py-3 font-semibold text-gray-600">Email</th>
                        <th className="px-3 py-3 font-semibold text-gray-600">Phone</th>
                        <th className="px-3 py-3 font-semibold text-gray-600">Job Title</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, index) => (
                        <tr key={`${row.first_name}-${index}`} className="border-t border-gray-100">
                          <td className="px-3 py-3">{row.first_name}</td>
                          <td className="px-3 py-3">{row.last_name ?? "—"}</td>
                          <td className="px-3 py-3">{row.email ?? "—"}</td>
                          <td className="px-3 py-3">{row.phone ?? "—"}</td>
                          <td className="px-3 py-3">{row.job_title ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {importRows.length > 10 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Showing first 10 rows in preview. All {importRows.length} rows will be imported.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Add Contact Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  New Record
                </p>

                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {editingContact ? "Edit Contact" : "Add New Contact"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingContact ? "Update this contact in your CRM database." : "Add a new person to your CRM database."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingContact(null); }}
                className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            <ContactForm contact={editingContact} onSuccess={handleContactSaved} onCancel={() => { setShowForm(false); setEditingContact(null); }} />
          </div>
        )}

        {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{actionError}</p>}

        {/* Contacts Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                All Contacts
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View and manage your saved contacts.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search contacts..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                />
              </div>

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as "newest" | "oldest" | "nameAsc" | "nameDesc")
                }
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="nameAsc">Name A–Z</option>
                <option value="nameDesc">Name Z–A</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />

              <p className="mt-4 text-sm text-gray-500">
                Loading contacts...
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                👥
              </div>

              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {search ? "No contacts found" : "No contacts yet"}
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                {search
                  ? "Try searching with a different name, email, or phone number."
                  : "Add your first contact to start building your CRM."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700"
                >
                  Add Your First Contact
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Contact
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Email
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Phone
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Job Title
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="border-b border-gray-100 transition last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                            {getInitials(contact)}
                          </div>

                          <div>
                            <Link
                              href={`/contacts/${contact.id}`}
                              className="font-semibold text-gray-900 transition hover:text-blue-600 hover:underline"
                            >
                              {contact.first_name}{" "}
                              {contact.last_name ?? ""}
                            </Link>

                            <p className="mt-0.5 text-xs text-gray-500">
                              Contact
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {contact.email ?? "—"}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {contact.phone ?? "—"}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {contact.job_title ?? "—"}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Active</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setEditingContact(contact); setShowForm(true); }} className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-100">Edit</button>
                          <button type="button" onClick={() => handleDeleteContact(contact)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}


          {!loading && sortedContacts.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span>
                  Showing {Math.min((safeCurrentPage - 1) * pageSize + 1, sortedContacts.length)}–
                  {Math.min(safeCurrentPage * pageSize, sortedContacts.length)} of {sortedContacts.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeCurrentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-gray-600">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCurrentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  );
}