"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import DealForm from "@/components/forms/DealForm";

type Deal = {
  id: string;
  title: string;
  description: string | null;
  value: number;
  currency: string;
  expected_close_date: string | null;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string | null;
};

type Pipeline = {
  id: string;
  name: string;
};

type PipelineStage = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email?: string | null;
};

type Company = {
  id: string;
  name: string;
};

type ImportDeal = {
  title: string;
  description: string;
  value: number;
  currency: string;
  expected_close_date: string;
  pipeline: string;
  stage: string;
  contact_email: string;
  company: string;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "nameAsc" | "nameDesc" | "valueLow" | "valueHigh"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportDeal[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  async function loadDeals() {
    const supabase = createClient();

    setLoading(true);
    setError("");

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
      setError("No organization found.");
      setLoading(false);
      return;
    }

    const [
      dealsResult,
      pipelinesResult,
      stagesResult,
      contactsResult,
      companiesResult,
    ] = await Promise.all([
      supabase
        .from("deals")
        .select(
          "id, title, description, value, currency, expected_close_date, pipeline_id, stage_id, contact_id, company_id, owner_id"
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),

      supabase
        .from("pipelines")
        .select("id, name")
        .eq("organization_id", organizationId),

      supabase
        .from("pipeline_stages")
        .select("id, name"),

      supabase
        .from("contacts")
        .select("id, first_name, last_name, email")
        .eq("organization_id", organizationId),

      supabase
        .from("companies")
        .select("id, name")
        .eq("organization_id", organizationId),
    ]);

    if (dealsResult.error) {
      setError(dealsResult.error.message);
    }

    setDeals(dealsResult.data ?? []);
    setPipelines(pipelinesResult.data ?? []);
    setStages(stagesResult.data ?? []);
    setContacts(contactsResult.data ?? []);
    setCompanies(companiesResult.data ?? []);

    setLoading(false);
  }

  function handleDealCreated() {
    setShowForm(false);
    setEditingDeal(null);
    setError("");
    loadDeals();
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

  function parseDealsCsv(csvText: string): ImportDeal[] {
    const lines = csvText
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

    const requiredHeaders = ["title", "value", "pipeline", "stage"];
    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header)
    );

    if (missingHeaders.length > 0) {
      throw new Error(
        `Missing required columns: ${missingHeaders.join(", ")}`
      );
    }

    const getValue = (row: string[], header: string) => {
      const index = headers.indexOf(header);
      return index >= 0 ? row[index]?.trim() ?? "" : "";
    };

    return lines.slice(1).map((line, index) => {
      const row = parseCsvLine(line);
      const title = getValue(row, "title");
      const valueText = getValue(row, "value");
      const value = Number(valueText);

      if (!title) {
        throw new Error(`Row ${index + 2}: title is required.`);
      }

      if (!valueText || !Number.isFinite(value) || value < 0) {
        throw new Error(
          `Row ${index + 2}: value must be a valid non-negative number.`
        );
      }

      return {
        title,
        description: getValue(row, "description"),
        value,
        currency: getValue(row, "currency") || "INR",
        expected_close_date: getValue(row, "expected_close_date"),
        pipeline: getValue(row, "pipeline"),
        stage: getValue(row, "stage"),
        contact_email: getValue(row, "contact_email"),
        company: getValue(row, "company"),
      };
    });
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportRows([]);
    setImportMessage("");
    setImportError("");

    try {
      const csvText = await file.text();
      const parsedRows = parseDealsCsv(csvText);
      setImportRows(parsedRows);
    } catch (importParseError) {
      setImportError(
        importParseError instanceof Error
          ? importParseError.message
          : "Unable to parse CSV file."
      );
    }

    event.target.value = "";
  }

  async function handleImportDeals() {
    if (!organizationId) {
      setImportError("No organization found.");
      return;
    }

    if (importRows.length === 0) {
      setImportError("Please select a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportMessage("");
    setImportError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please login first.");
      }

      const normalized = (value: string) => value.trim().toLowerCase();

      const existingTitles = new Set(
        deals.map((deal) => normalized(deal.title))
      );

      const importedTitles = new Set<string>();
      const pipelineMap = new Map(
        pipelines.map((pipeline) => [normalized(pipeline.name), pipeline.id])
      );
      const stageMap = new Map(
        stages.map((stage) => [normalized(stage.name), stage.id])
      );
      const contactMap = new Map(
        contacts
          .filter((contact) => contact.email)
          .map((contact) => [normalized(contact.email ?? ""), contact.id])
      );
      const companyMap = new Map(
        companies.map((company) => [normalized(company.name), company.id])
      );

      const payload = [];

      for (const row of importRows) {
        const titleKey = normalized(row.title);

        if (existingTitles.has(titleKey) || importedTitles.has(titleKey)) {
          continue;
        }

        const pipelineId = pipelineMap.get(normalized(row.pipeline));
        const stageId = stageMap.get(normalized(row.stage));

        if (!pipelineId) {
          throw new Error(
            `Pipeline not found for deal "${row.title}": ${row.pipeline}`
          );
        }

        if (!stageId) {
          throw new Error(
            `Stage not found for deal "${row.title}": ${row.stage}`
          );
        }

        const contactId = row.contact_email
          ? contactMap.get(normalized(row.contact_email)) ?? null
          : null;

        const companyId = row.company
          ? companyMap.get(normalized(row.company)) ?? null
          : null;

        payload.push({
          organization_id: organizationId,
          created_by: user.id,
          title: row.title,
          description: row.description || null,
          value: row.value,
          currency: row.currency || "INR",
          expected_close_date: row.expected_close_date || null,
          pipeline_id: pipelineId,
          stage_id: stageId,
          contact_id: contactId,
          company_id: companyId,
          owner_id: user.id,
        });

        importedTitles.add(titleKey);
      }

      if (payload.length === 0) {
        throw new Error("No new deals to import. Duplicate titles were skipped.");
      }

      const { error: insertError } = await supabase
        .from("deals")
        .insert(payload);

      if (insertError) throw insertError;

      setImportMessage(
        `${payload.length} deal${payload.length === 1 ? "" : "s"} imported successfully.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadDeals();
    } catch (importInsertError) {
      setImportError(
        importInsertError instanceof Error
          ? importInsertError.message
          : "Unable to import deals."
      );
    } finally {
      setImportLoading(false);
    }
  }

  function handleEditDeal(deal: Deal) {
    setError("");
    setEditingDeal(deal);
    setShowForm(true);
  }

  async function handleDeleteDeal(deal: Deal) {
    const confirmed = window.confirm(
      `Delete deal "${deal.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingDealId(deal.id);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setDeletingDealId(null);
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
      setDeletingDealId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("deals")
      .delete()
      .eq("id", deal.id)
      .eq("organization_id", membership.organization_id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingDealId(null);
      return;
    }

    setDeals((currentDeals) =>
      currentDeals.filter((currentDeal) => currentDeal.id !== deal.id)
    );
    setDeletingDealId(null);
  }

  useEffect(() => {
    loadDeals();
  }, []);

  function getPipelineName(id: string) {
    return (
      pipelines.find((pipeline) => pipeline.id === id)?.name ??
      "—"
    );
  }

  function getStageName(id: string) {
    return (
      stages.find((stage) => stage.id === id)?.name ??
      "—"
    );
  }

  function getContactName(id: string | null) {
    if (!id) return "—";

    const contact = contacts.find(
      (item) => item.id === id
    );

    if (!contact) return "—";

    return `${contact.first_name} ${
      contact.last_name ?? ""
    }`.trim();
  }

  function getCompanyName(id: string | null) {
    if (!id) return "—";

    return (
      companies.find((company) => company.id === id)?.name ??
      "—"
    );
  }

  function formatValue(value: number, currency: string) {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${currency || "INR"} ${value.toLocaleString("en-IN")}`;
    }
  }

  function getInitials(title: string) {
    return (
      title
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase() || "D"
    );
  }

  function getStageClasses(stageName: string) {
    const stage = stageName.toLowerCase();

    if (
      stage.includes("won") ||
      stage.includes("closed") ||
      stage.includes("complete")
    ) {
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    }

    if (
      stage.includes("lost") ||
      stage.includes("cancel")
    ) {
      return "bg-red-50 text-red-700 ring-red-200";
    }

    if (
      stage.includes("qualified") ||
      stage.includes("proposal") ||
      stage.includes("negotiation")
    ) {
      return "bg-purple-50 text-purple-700 ring-purple-200";
    }

    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  function isClosingSoon(date: string | null) {
    if (!date) return false;

    const closeDate = new Date(`${date}T23:59:59`);
    const today = new Date();

    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7);

    return closeDate >= today && closeDate <= futureDate;
  }

  function formatCloseDate(date: string | null) {
    if (!date) return "—";

    const parsedDate = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return deals;

    return deals.filter((deal) => {
      const searchableText = [
        deal.title,
        deal.description,
        deal.currency,
        getPipelineName(deal.pipeline_id),
        getStageName(deal.stage_id),
        getContactName(deal.contact_id),
        getCompanyName(deal.company_id),
        deal.expected_close_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [
    deals,
    search,
    pipelines,
    stages,
    contacts,
    companies,
  ]);

  const sortedDeals = useMemo(() => {
    const sorted = [...filteredDeals];

    switch (sortBy) {
      case "oldest":
        return sorted.reverse();
      case "nameAsc":
        return sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      case "nameDesc":
        return sorted.sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
      case "valueLow":
        return sorted.sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
      case "valueHigh":
        return sorted.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
      case "newest":
      default:
        return sorted;
    }
  }, [filteredDeals, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedDeals.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedDeals = sortedDeals.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const totalValue = deals.reduce(
    (total, deal) => total + Number(deal.value || 0),
    0
  );

  const closingSoonCount = deals.filter((deal) =>
    isClosingSoon(deal.expected_close_date)
  ).length;

  const activePipelineCount = deals.filter((deal) => {
    const stageName = getStageName(deal.stage_id).toLowerCase();

    return (
      !stageName.includes("lost") &&
      !stageName.includes("won") &&
      !stageName.includes("closed")
    );
  }).length;

  const primaryCurrency = deals[0]?.currency || "INR";

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
              <span>CRM</span>
              <span>/</span>
              <span className="text-gray-900">Deals</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Deals
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 sm:text-base">
              Manage sales opportunities, track pipeline progress,
              and monitor expected revenue.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setError("");
              setEditingDeal(null);
              setShowForm(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
          >
            <span className="text-lg leading-none">+</span>
            Add Deal
          </button>
          <button
            type="button"
            onClick={() => {
              setShowImport(true);
              setImportMessage("");
              setImportError("");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Import CSV
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Total Deals
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {deals.length}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-xl">
                💼
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              All sales opportunities
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Pipeline Value
                </p>

                <p className="mt-3 break-words text-2xl font-bold text-gray-950">
                  {formatValue(totalValue, primaryCurrency)}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                ₹
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Combined value of all deals
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Active Deals
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {activePipelineCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
                📈
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Deals still in progress
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Closing Soon
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {closingSoonCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-xl">
                ⏳
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Expected within the next 7 days
            </p>
          </div>
        </div>


        {showImport && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  CSV IMPORT
                </div>
                <h2 className="text-xl font-bold text-gray-950">
                  Import Deals
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Required columns: title, value, pipeline, stage. Pipeline and stage names must already exist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImport(false);
                  setImportRows([]);
                  setImportFileName("");
                  setImportMessage("");
                  setImportError("");
                }}
                className="w-fit rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-dashed border-blue-300 bg-white p-4">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFile}
                className="block w-full text-sm text-gray-600"
              />
              {importFileName && (
                <p className="mt-2 text-xs text-gray-500">
                  Selected: {importFileName}
                </p>
              )}
            </div>

            {importError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {importError}
              </div>
            )}

            {importMessage && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {importMessage}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
                  Preview: {importRows.length} row{importRows.length === 1 ? "" : "s"}
                </div>
                <table className="min-w-[900px] w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-3">Title</th>
                      <th className="px-3 py-3">Value</th>
                      <th className="px-3 py-3">Pipeline</th>
                      <th className="px-3 py-3">Stage</th>
                      <th className="px-3 py-3">Contact Email</th>
                      <th className="px-3 py-3">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.title}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-3 font-medium text-gray-900">{row.title}</td>
                        <td className="px-3 py-3 text-gray-600">{row.value} {row.currency}</td>
                        <td className="px-3 py-3 text-gray-600">{row.pipeline}</td>
                        <td className="px-3 py-3 text-gray-600">{row.stage}</td>
                        <td className="px-3 py-3 text-gray-600">{row.contact_email || "—"}</td>
                        <td className="px-3 py-3 text-gray-600">{row.company || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 10 && (
                  <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                    Showing first 10 rows in preview.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleImportDeals}
                disabled={importLoading || importRows.length === 0}
                className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importing..." : "Import Deals"}
              </button>
              <p className="text-xs text-gray-500">
                Duplicate deal titles are skipped. Contact and company matches are optional.
              </p>
            </div>
          </div>
        )}

        {/* Add Deal Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                  {editingDeal ? "EDIT DEAL" : "NEW DEAL"}
                </div>

                <h2 className="text-xl font-bold text-gray-950">
                  {editingDeal ? "Edit Deal" : "Add New Deal"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingDeal
                    ? "Update the selected sales opportunity."
                    : "Create a new sales opportunity."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingDeal(null);
                  setError("");
                }}
                className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <DealForm deal={editingDeal} onSuccess={handleDealCreated} />
          </div>
        )}

        {/* Deals Table */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-lg font-bold text-gray-950">
                All Deals
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {filteredDeals.length} deal
                {filteredDeals.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
                <input
                  type="text"
                  placeholder="Search deals..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                />
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-950">
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="nameAsc">Name A–Z</option>
                <option value="nameDesc">Name Z–A</option>
                <option value="valueLow">Value Low–High</option>
                <option value="valueHigh">Value High–Low</option>
              </select>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-950">
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-950" />

              <p className="mt-4 text-sm text-gray-500">
                Loading deals...
              </p>
            </div>
          ) : filteredDeals.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                💼
              </div>

              <h2 className="mt-5 text-lg font-bold text-gray-950">
                {search ? "No matching deals" : "No deals yet"}
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
                {search
                  ? "Try changing your search keywords."
                  : "Add your first deal to start tracking sales opportunities."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setShowForm(true);
                  }}
                  className="mt-5 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Add Your First Deal
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Deal
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Value
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Pipeline
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Stage
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Contact
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Company
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Close Date
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedDeals.map((deal) => {
                    const stageName = getStageName(deal.stage_id);

                    return (
                      <tr
                        key={deal.id}
                        className="border-b border-gray-100 transition last:border-0 hover:bg-gray-50/70"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-bold text-gray-700">
                              {getInitials(deal.title)}
                            </div>

                            <div className="min-w-0">
                              <Link
                                href={`/deals/${deal.id}`}
                                className="font-semibold text-gray-950 transition hover:text-blue-600 hover:underline"
                              >
                                {deal.title}
                              </Link>

                              {deal.description && (
                                <p className="mt-1 max-w-xs truncate text-xs text-gray-500">
                                  {deal.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <span className="font-semibold text-gray-950">
                            {formatValue(
                              Number(deal.value),
                              deal.currency
                            )}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span className="text-gray-600">
                            {getPipelineName(deal.pipeline_id)}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${getStageClasses(
                              stageName
                            )}`}
                          >
                            {stageName}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span className="text-gray-600">
                            {getContactName(deal.contact_id)}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <span className="text-gray-600">
                            {getCompanyName(deal.company_id)}
                          </span>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`text-gray-600 ${
                                isClosingSoon(
                                  deal.expected_close_date
                                )
                                  ? "font-semibold text-amber-700"
                                  : ""
                              }`}
                            >
                              {formatCloseDate(
                                deal.expected_close_date
                              )}
                            </span>

                            {isClosingSoon(
                              deal.expected_close_date
                            ) && (
                              <span className="text-xs font-medium text-amber-600">
                                Closing soon
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditDeal(deal)}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDeal(deal)}
                              disabled={deletingDealId === deal.id}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingDealId === deal.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-gray-500">
                Showing {sortedDeals.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}
                {" "}to {Math.min(safeCurrentPage * pageSize, sortedDeals.length)} of {sortedDeals.length} deals
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40">
                  Previous
                </button>
                <span className="min-w-24 text-center text-sm font-medium text-gray-600">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}