"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Company = {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
  owner_id: string | null;
};

type ImportCompany = {
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  company_size: string | null;
  city: string | null;
  state: string | null;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "nameAsc" | "nameDesc">("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportCompany[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [canAssign, setCanAssign] = useState(false);

  async function loadCompanies() {
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
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const organizationId = membership?.organization_id;

    setOrganizationId(organizationId ?? null);

    if (!organizationId) {
      setLoading(false);
      return;
    }

    const fullAccess = membership?.role === "owner" || membership?.role === "admin";
    setCanAssign(fullAccess);

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId);

    if (memberRows && memberRows.length > 0) {
      const memberIds = memberRows.map((member) => member.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberIds);

      if (profilesError) {
        console.error("Error loading member profiles:", profilesError);
      }

      const profileMap = new Map(
        (profiles ?? []).map((profile) => [
          profile.id,
          profile.full_name || profile.email || profile.id,
        ])
      );

      // Include every organization member; use user ID if profile data is restricted.
      setMembers(
        memberIds.map((memberId) => ({
          id: memberId,
          name: profileMap.get(memberId) ?? memberId,
        }))
      );
    } else {
      setMembers([]);
    }

    const { data, error: companiesError } = await supabase
      .from("companies")
      .select(
        "id, name, website, email, phone, industry, company_size, city, state, owner_id"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (companiesError) {
      console.error("Error loading companies:", companiesError);
      setCompanies([]);
    } else {
      setCompanies(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");

    if (!editId || companies.length === 0) return;

    const companyToEdit = companies.find((company) => company.id === editId);

    if (companyToEdit) {
      startEdit(companyToEdit);
    }
  }, [companies]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Company name is required.");
      return;
    }

    setSaving(true);
    setError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setSaving(false);
      return;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.organization_id) {
      setError("No organization found.");
      setSaving(false);
      return;
    }

    const companyPayload = {
      name: name.trim(),
      website: website.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      industry: industry.trim() || null,
      company_size: companySize.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
    };

    const assignedOwnerId = canAssign ? ownerId || user.id : user.id;

    const query = editingId
      ? supabase
          .from("companies")
          .update({ ...companyPayload, owner_id: assignedOwnerId })
          .eq("id", editingId)
          .eq("organization_id", membership.organization_id)
     : supabase.from("companies").insert({
    organization_id: membership.organization_id,
    ...companyPayload,
    owner_id: assignedOwnerId,
    created_by: user.id,
  });

    const { error: companyError } = await query;

    if (companyError) {
      setError(companyError.message);
      setSaving(false);
      return;
    }

    resetForm();
    setEditingId(null);
    setShowForm(false);
    setSaving(false);

    await loadCompanies();
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

  function parseCompaniesCsv(content: string): ImportCompany[] {
    const lines = content
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header row and at least one data row.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.toLowerCase().replace(/\s+/g, "_")
    );

    if (!headers.includes("name")) {
      throw new Error("Missing required CSV column: name");
    }

    return lines.slice(1).map((line, rowIndex) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""])
      );

      if (!row.name?.trim()) {
        throw new Error(`Row ${rowIndex + 2}: name is required.`);
      }

      return {
        name: row.name.trim(),
        website: row.website?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        industry: row.industry?.trim() || null,
        company_size: row.company_size?.trim() || null,
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
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
      setImportRows(parseCompaniesCsv(content));
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to read CSV file."
      );
    }

    event.target.value = "";
  }

  async function handleImportCompanies() {
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
      const existingNames = new Set(
        companies.map((company) => company.name.trim().toLowerCase())
      );

      const seenNames = new Set<string>();
      const uniqueRows = importRows.filter((row) => {
        const normalizedName = row.name.trim().toLowerCase();

        if (existingNames.has(normalizedName) || seenNames.has(normalizedName)) {
          return false;
        }

        seenNames.add(normalizedName);
        return true;
      });

      if (uniqueRows.length === 0) {
        throw new Error("All CSV companies already exist or are duplicated.");
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please login first.");
      }

      const payload = uniqueRows.map((row) => ({
        organization_id: organizationId,
        owner_id: user.id,
        created_by: user.id,
        ...row,
      }));

      const { error } = await supabase.from("companies").insert(payload);

      if (error) {
        throw new Error(error.message);
      }

      setImportMessage(
        `${uniqueRows.length} compan${uniqueRows.length === 1 ? "y" : "ies"} imported successfully.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadCompanies();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Unable to import companies."
      );
    } finally {
      setImportLoading(false);
    }
  }

  function startEdit(company: Company) {
    setEditingId(company.id);
    setName(company.name);
    setWebsite(company.website ?? "");
    setEmail(company.email ?? "");
    setPhone(company.phone ?? "");
    setIndustry(company.industry ?? "");
    setCompanySize(company.company_size ?? "");
    setCity(company.city ?? "");
    setState(company.state ?? "");
    setOwnerId(company.owner_id ?? "");
    setError("");
    setShowForm(true);
  }

  async function handleDelete(company: Company) {
    const confirmed = window.confirm(
      `Delete "${company.name}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("companies")
      .delete()
      .eq("id", company.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadCompanies();
  }

  function resetForm() {
    setName("");
    setWebsite("");
    setEmail("");
    setPhone("");
    setIndustry("");
    setCompanySize("");
    setCity("");
    setState("");
    setOwnerId("");
    setError("");
  }

  const filteredCompanies = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return companies;

    return companies.filter((company) => {
      const searchableText = [
        company.name,
        company.website,
        company.email,
        company.phone,
        company.industry,
        company.company_size,
        company.city,
        company.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [companies, search]);

  const sortedCompanies = useMemo(() => {
    const sorted = [...filteredCompanies];

    if (sortBy === "oldest") {
      sorted.reverse();
    } else if (sortBy === "nameAsc" || sortBy === "nameDesc") {
      sorted.sort((a, b) => {
        const comparison = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
        });
        return sortBy === "nameAsc" ? comparison : -comparison;
      });
    }

    return sorted;
  }, [filteredCompanies, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedCompanies.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedCompanies = sortedCompanies.slice(
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

  function getInitials(companyName: string) {
    const words = companyName.trim().split(/\s+/);

    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    return companyName.slice(0, 2).toUpperCase() || "CO";
  }

  function getLocation(company: Company) {
    if (company.city && company.state) {
      return `${company.city}, ${company.state}`;
    }

    return company.city || company.state || "—";
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>CRM</span>
              <span>/</span>
              <span>Companies</span>
            </div>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              Companies
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage businesses and organizations in your CRM.
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
                setError("");
                setShowForm(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700"
            >
              <span className="text-lg">+</span>
              Add Company
            </button>
          </div>
        </section>

        {/* Summary Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Total Companies
              </p>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-lg">
                🏢
              </div>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {companies.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Businesses in your organization
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Search Results
              </p>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-lg">
                ✓
              </div>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {filteredCompanies.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Matching companies
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
              Your companies workspace
            </p>
          </div>
        </section>

        {showImport && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  Bulk Import
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  Import Companies from CSV
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Required column: name. Optional: website, email, phone, industry, company_size, city, state.
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
                    onClick={handleImportCompanies}
                    className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importLoading ? "Importing..." : "Import Companies"}
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-[1050px] w-full text-left text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Name", "Website", "Email", "Phone", "Industry", "Size", "City", "State"].map((header) => (
                          <th key={header} className="px-3 py-3 font-semibold text-gray-600">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, index) => (
                        <tr key={`${row.name}-${index}`} className="border-t border-gray-100">
                          <td className="px-3 py-3">{row.name}</td>
                          <td className="px-3 py-3">{row.website ?? "—"}</td>
                          <td className="px-3 py-3">{row.email ?? "—"}</td>
                          <td className="px-3 py-3">{row.phone ?? "—"}</td>
                          <td className="px-3 py-3">{row.industry ?? "—"}</td>
                          <td className="px-3 py-3">{row.company_size ?? "—"}</td>
                          <td className="px-3 py-3">{row.city ?? "—"}</td>
                          <td className="px-3 py-3">{row.state ?? "—"}</td>
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
          </section>
        )}

        {/* Add Company Form */}
        {showForm && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                  New Record
                </p>

                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {editingId ? "Edit Company" : "Add New Company"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Add a business or organization to your CRM.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Company Name *
                </label>

                <input
                  type="text"
                  placeholder="e.g. Anifoards"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Website
                  </label>

                  <input
                    type="url"
                    placeholder="https://example.com"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email
                  </label>

                  <input
                    type="email"
                    placeholder="company@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Phone
                  </label>

                  <input
                    type="tel"
                    placeholder="+91 XXXXX XXXXX"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Industry
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Marketing"
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Company Size
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. 11-50"
                    value={companySize}
                    onChange={(event) => setCompanySize(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    City
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Muzaffarpur"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    State
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Bihar"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  />
                </div>
              </div>

              {canAssign && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Assign To
                  </label>
                  <select
                    value={ownerId}
                    onChange={(event) => setOwnerId(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-gray-400 focus:bg-white focus:ring-2 focus:ring-gray-100"
                  >
                    <option value="">Assign to current user</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                  }}
                  className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? editingId
                      ? "Updating Company..."
                      : "Saving Company..."
                    : editingId
                      ? "Update Company"
                      : "Save Company"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Companies Table */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                All Companies
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                View and manage your saved businesses.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search companies..."
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
                Loading companies...
              </p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                🏢
              </div>

              <h3 className="mt-4 text-lg font-semibold text-gray-900">
                {search ? "No companies found" : "No companies yet"}
              </h3>

              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
                {search
                  ? "Try searching with a different company name, industry, or location."
                  : "Add your first company to start building your CRM."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowForm(true);
                  }}
                  className="mt-5 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700"
                >
                  Add Your First Company
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Company
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Industry
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Contact
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Location
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Status
                    </th>
                    <th className="px-6 py-4 text-right font-semibold text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedCompanies.map((company) => (
                    <tr
                      key={company.id}
                      className="border-b border-gray-100 transition last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-xs font-bold text-white">
                            {getInitials(company.name)}
                          </div>

                          <div>
                            <Link
                              href={`/companies/${company.id}`}
                              className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                            >
                              {company.name}
                            </Link>

                            {company.website ? (
                              <a
                                href={company.website}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 block max-w-[220px] truncate text-xs text-blue-600 hover:underline"
                              >
                                {company.website}
                              </a>
                            ) : (
                              <p className="mt-0.5 text-xs text-gray-500">
                                No website added
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {company.industry ?? "—"}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        <div>{company.email ?? "—"}</div>

                        <div className="mt-1 text-xs text-gray-500">
                          {company.phone ?? "—"}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {getLocation(company)}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(company)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(company)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && sortedCompanies.length > 0 && (
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
                  Showing {Math.min((safeCurrentPage - 1) * pageSize + 1, sortedCompanies.length)}–
                  {Math.min(safeCurrentPage * pageSize, sortedCompanies.length)} of {sortedCompanies.length}
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
        </section>
      </div>
    </DashboardShell>
  );
}