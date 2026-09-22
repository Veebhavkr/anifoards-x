"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Lead = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  status: string;
  priority: string;
  owner_id: string | null;
};

type OrganizationMember = {
  user_id: string;
  role: string;
  full_name: string | null;
};

type ImportLead = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  status: string;
  priority: string;
};
type Pipeline = {
  id: string;
  name: string;
};

type PipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
};
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "nameAsc" | "nameDesc"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportLead[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("medium");
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [currentRole, setCurrentRole] = useState("member");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [conversionLead, setConversionLead] = useState<Lead | null>(null);
  const [conversionTitle, setConversionTitle] = useState("");
  const [conversionValue, setConversionValue] = useState("");
  const [conversionCurrency, setConversionCurrency] = useState("INR");
  const [conversionPipelineId, setConversionPipelineId] = useState("");
  const [conversionStageId, setConversionStageId] = useState("");
  const [conversionLoading, setConversionLoading] = useState(false);
  const [conversionError, setConversionError] = useState("");

  async function loadLeads() {
    const supabase = createClient();

    setLoading(true);

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

    if (!organizationId) {
      setLoading(false);
      return;
    }

    const [{ data: pipelineRows }, { data: stageRows }] = await Promise.all([
      supabase
        .from("pipelines")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, name, position")
        .order("position", { ascending: true }),
    ]);

    setPipelines(pipelineRows ?? []);
    setPipelineStages(stageRows ?? []);

    const { data: currentMembership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    setCurrentRole(String(currentMembership?.role ?? "member").toLowerCase());

    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    const memberUserIds = (memberRows ?? []).map((member) => member.user_id);

    const { data: profileRows } = memberUserIds.length
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberUserIds)
      : { data: [] };

    const profileMap = new Map(
      (profileRows ?? []).map((profile) => [profile.id, profile.full_name])
    );

    setMembers(
      (memberRows ?? []).map((member) => ({
        user_id: member.user_id,
        role: String(member.role ?? "member"),
        full_name: profileMap.get(member.user_id) ?? null,
      }))
    );

    const { data, error: leadsError } = await supabase
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, company_name, job_title, source, status, priority, owner_id"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (leadsError) {
      setError(leadsError.message);
    }

    setLeads(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (loading || leads.length === 0 || editingLead) return;

    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;

    const leadToEdit = leads.find((lead) => lead.id === editId);
    if (leadToEdit) {
      startEditing(leadToEdit);
    }
  }, [leads, loading, editingLead]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return leads;

    return leads.filter((lead) => {
      const searchableText = [
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        lead.company_name,
        lead.job_title,
        lead.source,
        lead.status,
        lead.priority,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [leads, search]);

  const sortedLeads = useMemo(() => {
    const sorted = [...filteredLeads];

    switch (sortBy) {
      case "oldest":
        return sorted.reverse();
      case "nameAsc":
        return sorted.sort((a, b) =>
          `${a.first_name} ${a.last_name ?? ""}`.localeCompare(
            `${b.first_name} ${b.last_name ?? ""}`,
            undefined,
            { sensitivity: "base" }
          )
        );
      case "nameDesc":
        return sorted.sort((a, b) =>
          `${b.first_name} ${b.last_name ?? ""}`.localeCompare(
            `${a.first_name} ${a.last_name ?? ""}`,
            undefined,
            { sensitivity: "base" }
          )
        );
      case "newest":
      default:
        return sorted;
    }
  }, [filteredLeads, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedLeads = sortedLeads.slice(
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

  const totalLeads = leads.length;

  const newLeads = leads.filter(
    (lead) => lead.status === "new"
  ).length;

  const qualifiedLeads = leads.filter(
    (lead) => lead.status === "qualified"
  ).length;

  const highPriorityLeads = leads.filter(
    (lead) => lead.priority === "high"
  ).length;

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

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

    if (!membership) {
      setError("No organization found.");
      setSaving(false);
      return;
    }

    const selectedOwnerId =
      currentRole === "owner" || currentRole === "admin"
        ? ownerId || user.id
        : user.id;

    const leadPayload = {
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      company_name: companyName.trim() || null,
      job_title: jobTitle.trim() || null,
      source: source.trim() || null,
      status,
      priority,
    };

    const leadResult = editingLead
      ? await supabase
          .from("leads")
          .update({
            ...leadPayload,
            ...(currentRole === "owner" || currentRole === "admin"
              ? { owner_id: selectedOwnerId }
              : {}),
          })
          .eq("id", editingLead.id)
          .eq("organization_id", membership.organization_id)
      : await supabase
          .from("leads")
          .insert({
            organization_id: membership.organization_id,
            ...leadPayload,
            owner_id: selectedOwnerId,
            created_by: user.id,
          });

    if (leadResult.error) {
      setError(leadResult.error.message);
      setSaving(false);
      return;
    }

    resetForm();
    setEditingLead(null);
    setShowForm(false);
    window.history.replaceState({}, "", "/leads");
    setSaving(false);

    await loadLeads();
  }

  function openConversion(lead: Lead) {
    setConversionLead(lead);
    setConversionTitle(
      `${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""} Deal`
    );
    setConversionValue("");
    setConversionCurrency("INR");
    setConversionError("");

    const defaultPipeline = pipelines.find((pipeline) => pipeline.id);
    const selectedPipelineId = defaultPipeline?.id ?? "";
    const firstStage = pipelineStages
      .filter((stage) => stage.pipeline_id === selectedPipelineId)
      .sort((a, b) => a.position - b.position)[0];

    setConversionPipelineId(selectedPipelineId);
    setConversionStageId(firstStage?.id ?? "");
  }

  function closeConversion() {
    if (conversionLoading) return;
    setConversionLead(null);
    setConversionError("");
  }

  async function handleConvertLead() {
    if (!conversionLead) return;

    const numericValue = Number(conversionValue);
    if (!conversionTitle.trim()) {
      setConversionError("Deal title is required.");
      return;
    }

    if (!conversionPipelineId || !conversionStageId) {
      setConversionError("Please select a pipeline and stage.");
      return;
    }

    if (!conversionValue.trim() || !Number.isFinite(numericValue) || numericValue < 0) {
      setConversionError("Enter a valid deal value.");
      return;
    }

    setConversionLoading(true);
    setConversionError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setConversionError("Please login first.");
      setConversionLoading(false);
      return;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership?.organization_id) {
      setConversionError(membershipError?.message || "No organization found.");
      setConversionLoading(false);
      return;
    }

    const { data: existingDeal, error: existingDealError } = await supabase
      .from("deals")
      .select("id")
      .eq("organization_id", membership.organization_id)
      .eq("lead_id", conversionLead.id)
      .maybeSingle();

    if (existingDealError) {
      setConversionError(existingDealError.message);
      setConversionLoading(false);
      return;
    }

    if (existingDeal) {
      setConversionError("This lead has already been converted into a deal.");
      setConversionLoading(false);
      return;
    }

    let companyId: string | null = null;
    let contactId: string | null = null;

    if (conversionLead.company_name?.trim()) {
      const companyName = conversionLead.company_name.trim();
      const { data: existingCompany, error: companyLookupError } = await supabase
        .from("companies")
        .select("id")
        .eq("organization_id", membership.organization_id)
        .ilike("name", companyName)
        .limit(1)
        .maybeSingle();

      if (companyLookupError) {
        setConversionError(companyLookupError.message);
        setConversionLoading(false);
        return;
      }

      if (existingCompany?.id) {
        companyId = existingCompany.id;
      } else {
        const { data: createdCompany, error: companyCreateError } = await supabase
          .from("companies")
          .insert({
            organization_id: membership.organization_id,
            name: companyName,
            email: conversionLead.email ?? null,
            phone: conversionLead.phone ?? null,
            owner_id: conversionLead.owner_id ?? user.id,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (companyCreateError || !createdCompany?.id) {
          setConversionError(companyCreateError?.message || "Company could not be created.");
          setConversionLoading(false);
          return;
        }

        companyId = createdCompany.id;
      }
    }

    if (conversionLead.email?.trim()) {
      const { data: existingContact, error: contactLookupError } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", membership.organization_id)
        .ilike("email", conversionLead.email.trim())
        .limit(1)
        .maybeSingle();

      if (contactLookupError) {
        setConversionError(contactLookupError.message);
        setConversionLoading(false);
        return;
      }

      if (existingContact?.id) {
        contactId = existingContact.id;
      } else {
        const { data: createdContact, error: contactCreateError } = await supabase
          .from("contacts")
          .insert({
            organization_id: membership.organization_id,
            first_name: conversionLead.first_name.trim(),
            last_name: conversionLead.last_name?.trim() || null,
            email: conversionLead.email.trim(),
            phone: conversionLead.phone ?? null,
            job_title: conversionLead.job_title ?? null,
            company_id: companyId,
            owner_id: conversionLead.owner_id ?? user.id,
            created_by: user.id,
          })
          .select("id")
          .single();

        if (contactCreateError || !createdContact?.id) {
          setConversionError(contactCreateError?.message || "Contact could not be created.");
          setConversionLoading(false);
          return;
        }

        contactId = createdContact.id;
      }
    }

    const { error: dealError } = await supabase.from("deals").insert({
      organization_id: membership.organization_id,
      pipeline_id: conversionPipelineId,
      stage_id: conversionStageId,
      title: conversionTitle.trim(),
      description: conversionLead.company_name
        ? `Converted from lead: ${conversionLead.company_name}`
        : "Converted from lead",
      value: numericValue,
      currency: conversionCurrency,
      contact_id: contactId,
      company_id: companyId,
      owner_id: conversionLead.owner_id ?? user.id,
      created_by: user.id,
      lead_id: conversionLead.id,
    });

    if (dealError) {
      setConversionError(
        dealError.code === "23505"
          ? "This lead has already been converted into a deal."
          : dealError.message
      );
      setConversionLoading(false);
      return;
    }

    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({ status: "converted" })
      .eq("id", conversionLead.id)
      .eq("organization_id", membership.organization_id);

    if (leadUpdateError) {
      setConversionError(
        `Deal created, but lead status could not be updated: ${leadUpdateError.message}`
      );
      setConversionLoading(false);
      await loadLeads();
      return;
    }

    setConversionLead(null);
    setConversionError("");
    setConversionLoading(false);
    await loadLeads();
  }

  async function handleDelete(lead: Lead) {
    const confirmed = window.confirm(
      `Delete ${lead.first_name}${lead.last_name ? ` ${lead.last_name}` : ""}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(lead.id);
    setError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setDeletingId(null);
      return;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setError("No organization found.");
      setDeletingId(null);
      return;
    }

    const { error: deleteError } = await supabase
      .from("leads")
      .delete()
      .eq("id", lead.id)
      .eq("organization_id", membership.organization_id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingId(null);
      return;
    }

    if (editingLead?.id === lead.id) {
      resetForm();
      setEditingLead(null);
      setShowForm(false);
    }

    setDeletingId(null);
    await loadLeads();
  }

  function startEditing(lead: Lead) {
    setEditingLead(lead);
    setFirstName(lead.first_name);
    setLastName(lead.last_name ?? "");
    setEmail(lead.email ?? "");
    setPhone(lead.phone ?? "");
    setCompanyName(lead.company_name ?? "");
    setJobTitle(lead.job_title ?? "");
    setSource(lead.source ?? "");
    setStatus(lead.status);
    setPriority(lead.priority);
    setOwnerId(lead.owner_id ?? "");
    setError("");
    setShowForm(true);
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setCompanyName("");
    setJobTitle("");
    setSource("");
    setStatus("new");
    setPriority("medium");
    setOwnerId("");
    setError("");
  }

  function getStatusLabel(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getPriorityLabel(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function getInitials(lead: Lead) {
    const first = lead.first_name?.charAt(0) ?? "";
    const last = lead.last_name?.charAt(0) ?? "";

    return `${first}${last}`.toUpperCase() || "L";
  }

  function getStatusClasses(status: string) {
    switch (status.toLowerCase()) {
      case "new":
        return "bg-blue-50 text-blue-700 ring-blue-200";

      case "contacted":
        return "bg-amber-50 text-amber-700 ring-amber-200";

      case "qualified":
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";

      case "unqualified":
        return "bg-red-50 text-red-700 ring-red-200";

      case "converted":
        return "bg-purple-50 text-purple-700 ring-purple-200";

      default:
        return "bg-gray-100 text-gray-700 ring-gray-200";
    }
  }



  function escapeCsvValue(value: unknown) {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function handleExportLeads() {
    if (leads.length === 0) {
      setError("No leads available to export.");
      return;
    }

    const headers = [
      "id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "company_name",
      "job_title",
      "source",
      "status",
      "priority",
      "owner_id",
    ];

    const rows = leads.map((lead) =>
      [
        lead.id,
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        lead.company_name,
        lead.job_title,
        lead.source,
        lead.status,
        lead.priority,
        lead.owner_id,
      ]
        .map(escapeCsvValue)
        .join(","),
    );

    const csv = `\uFEFF${headers.map(escapeCsvValue).join(",")}\r\n${rows.join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  function parseLeadsCsv(csvText: string) {
    const lines = csvText
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header row and at least one data row.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase().replace(/\s+/g, "_")
    );

    if (!headers.includes("first_name")) {
      throw new Error("CSV must contain a first_name column.");
    }

    const getValue = (row: string[], key: string) => {
      const index = headers.indexOf(key);
      return index >= 0 ? row[index]?.trim() ?? "" : "";
    };

    return lines.slice(1).map((line, index) => {
      const row = parseCsvLine(line);
      const firstName = getValue(row, "first_name");

      if (!firstName) {
        throw new Error(`Row ${index + 2}: first_name is required.`);
      }

      const statusValue = getValue(row, "status").toLowerCase();
      const priorityValue = getValue(row, "priority").toLowerCase();

      const allowedStatuses = [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
      ];
      const allowedPriorities = ["low", "medium", "high"];

      return {
        first_name: firstName,
        last_name: getValue(row, "last_name") || null,
        email: getValue(row, "email") || null,
        phone: getValue(row, "phone") || null,
        company_name: getValue(row, "company_name") || null,
        job_title: getValue(row, "job_title") || null,
        source: getValue(row, "source") || null,
        status: allowedStatuses.includes(statusValue) ? statusValue : "new",
        priority: allowedPriorities.includes(priorityValue)
          ? priorityValue
          : "medium",
      };
    });
  }

  function handleLeadCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setImportError("");
    setImportMessage("");
    setImportRows([]);

    if (!file) {
      setImportFileName("");
      return;
    }

    setImportFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Please select a valid CSV file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsedRows = parseLeadsCsv(String(reader.result ?? ""));
        setImportRows(parsedRows);
      } catch (parseError) {
        setImportError(
          parseError instanceof Error
            ? parseError.message
            : "Unable to read the CSV file."
        );
      }
    };

    reader.onerror = () => {
      setImportError("Unable to read the selected file.");
    };

    reader.readAsText(file);
  }

  async function handleImportLeads() {
    if (importRows.length === 0) {
      setImportError("Please upload a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportError("");
    setImportMessage("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setImportError("Please login first.");
      setImportLoading(false);
      return;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership?.organization_id) {
      setImportError(
        membershipError?.message || "No organization found."
      );
      setImportLoading(false);
      return;
    }

    const existingEmails = new Set(
      leads
        .map((lead) => lead.email?.trim().toLowerCase())
        .filter(Boolean)
    );

    const csvEmails = new Set<string>();
    const uniqueRows = importRows.filter((row) => {
      const email = row.email?.trim().toLowerCase();

      if (!email) return true;
      if (existingEmails.has(email) || csvEmails.has(email)) return false;

      csvEmails.add(email);
      return true;
    });

    if (uniqueRows.length === 0) {
      setImportError(
        "No new leads to import. Duplicate email addresses were skipped."
      );
      setImportLoading(false);
      return;
    }

    const payload = uniqueRows.map((row) => ({
      organization_id: membership.organization_id,
      owner_id: user.id,
      created_by: user.id,
      ...row,
    }));

    const { error: insertError } = await supabase
      .from("leads")
      .insert(payload);

    if (insertError) {
      setImportError(insertError.message);
      setImportLoading(false);
      return;
    }

    const skippedCount = importRows.length - uniqueRows.length;

    setImportMessage(
      `${uniqueRows.length} lead(s) imported successfully${
        skippedCount > 0 ? `. ${skippedCount} duplicate(s) skipped.` : "."
      }`
    );
    setImportRows([]);
    setImportFileName("");
    setImportLoading(false);
    await loadLeads();
  }

  function getPriorityClasses(priority: string) {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-50 text-red-700 ring-red-200";

      case "medium":
        return "bg-amber-50 text-amber-700 ring-amber-200";

      case "low":
        return "bg-emerald-50 text-emerald-700 ring-emerald-200";

      default:
        return "bg-gray-100 text-gray-700 ring-gray-200";
    }
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500">
              <span>CRM</span>
              <span>/</span>
              <span className="text-gray-900">Leads</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
              Leads
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 sm:text-base">
              Capture, organize, and manage potential customers
              throughout your sales journey.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowImport(true);
              setImportError("");
              setImportMessage("");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Import CSV
          </button>

          <button
            type="button"
            onClick={handleExportLeads}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setEditingLead(null);
              setShowForm(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800"
          >
            <span className="text-lg leading-none">+</span>
            Add Lead
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Total Leads
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {totalLeads}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-xl">
                👥
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              All captured potential customers
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  New Leads
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {newLeads}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
                ✨
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Leads waiting for follow-up
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Qualified Leads
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {qualifiedLeads}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                ✓
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Potential sales opportunities
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  High Priority
                </p>

                <p className="mt-3 text-3xl font-bold text-gray-950">
                  {highPriorityLeads}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-xl">
                🔥
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Leads requiring extra attention
            </p>
          </div>
        </div>

        {showImport && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  CSV IMPORT
                </div>
                <h2 className="text-xl font-bold text-gray-950">
                  Import Leads
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Upload a CSV file to add multiple leads at once.
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

            <div className="space-y-5">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleLeadCsvFile}
                className="block w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
              />

              {importFileName && (
                <p className="text-sm text-gray-500">
                  Selected file: <span className="font-semibold">{importFileName}</span>
                </p>
              )}

              {importError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {importError}
                </div>
              )}

              {importMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {importMessage}
                </div>
              )}

              {importRows.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                    Preview: {importRows.length} lead(s)
                  </div>
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50/70">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">Email</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">Phone</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">Company</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                        <th className="px-4 py-3 font-semibold text-gray-600">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 10).map((row, index) => (
                        <tr key={`${row.first_name}-${index}`} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-3">
                            {row.first_name} {row.last_name ?? ""}
                          </td>
                          <td className="px-4 py-3">{row.email ?? "—"}</td>
                          <td className="px-4 py-3">{row.phone ?? "—"}</td>
                          <td className="px-4 py-3">{row.company_name ?? "—"}</td>
                          <td className="px-4 py-3">{row.status}</td>
                          <td className="px-4 py-3">{row.priority}</td>
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

              <button
                type="button"
                onClick={handleImportLeads}
                disabled={importLoading || importRows.length === 0}
                className="w-full rounded-xl bg-gray-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importing Leads..." : "Import Leads"}
              </button>

              <p className="text-xs leading-5 text-gray-500">
                Required column: <strong>first_name</strong>. Optional columns:
                last_name, email, phone, company_name, job_title, source, status, priority.
              </p>
            </div>
          </div>
        )}

        {/* Add Lead Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                  {editingLead ? "EDIT LEAD" : "NEW LEAD"}
                </div>

                <h2 className="text-xl font-bold text-gray-950">
                  {editingLead ? "Edit Lead" : "Add New Lead"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingLead
                    ? "Update this lead's information and sales status."
                    : "Add a potential customer to your sales pipeline."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditingLead(null);
                  setShowForm(false);
                  window.history.replaceState({}, "", "/leads");
                }}
                className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    First Name *
                  </label>

                  <input
                    type="text"
                    placeholder="Enter first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Last Name
                  </label>

                  <input
                    type="text"
                    placeholder="Enter last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email
                  </label>

                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Phone
                  </label>

                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Company Name
                  </label>

                  <input
                    type="text"
                    placeholder="Enter company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Job Title
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Marketing Manager"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Lead Source
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Website, Referral, Instagram"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Status
                  </label>

                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="unqualified">Unqualified</option>
                    <option value="converted">Converted</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Priority
                  </label>

                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                {(currentRole === "owner" || currentRole === "admin") && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Assigned To
                    </label>

                    <select
                      value={ownerId}
                      onChange={(e) => setOwnerId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                    >
                      <option value="">Select lead owner</option>
                      {members.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.full_name || member.user_id}
                          {member.role ? ` (${member.role})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-gray-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? editingLead
                    ? "Updating Lead..."
                    : "Saving Lead..."
                  : editingLead
                  ? "Update Lead"
                  : "Save Lead"}
              </button>
            </form>
          </div>
        )}

        {conversionLead && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  CONVERT LEAD
                </div>
                <h2 className="text-xl font-bold text-gray-950">
                  Convert {conversionLead.first_name} into a Deal
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Create a deal and mark this lead as converted.
                </p>
              </div>
              <button
                type="button"
                onClick={closeConversion}
                disabled={conversionLoading}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Deal Title *
                </label>
                <input
                  value={conversionTitle}
                  onChange={(event) => setConversionTitle(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Deal Value *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conversionValue}
                  onChange={(event) => setConversionValue(event.target.value)}
                  placeholder="Enter deal value"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Currency
                </label>
                <select
                  value={conversionCurrency}
                  onChange={(event) => setConversionCurrency(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Pipeline *
                </label>
                <select
                  value={conversionPipelineId}
                  onChange={(event) => {
                    const pipelineId = event.target.value;
                    const firstStage = pipelineStages
                      .filter((stage) => stage.pipeline_id === pipelineId)
                      .sort((a, b) => a.position - b.position)[0];
                    setConversionPipelineId(pipelineId);
                    setConversionStageId(firstStage?.id ?? "");
                  }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                >
                  <option value="">Select pipeline</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Stage *
                </label>
                <select
                  value={conversionStageId}
                  onChange={(event) => setConversionStageId(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                >
                  <option value="">Select stage</option>
                  {pipelineStages
                    .filter((stage) => stage.pipeline_id === conversionPipelineId)
                    .sort((a, b) => a.position - b.position)
                    .map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {conversionError && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {conversionError}
              </div>
            )}

            <button
              type="button"
              onClick={handleConvertLead}
              disabled={conversionLoading}
              className="mt-6 w-full rounded-xl bg-gray-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {conversionLoading ? "Converting..." : "Create Deal & Convert Lead"}
            </button>
          </div>
        )}

        {/* Leads List */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-lg font-bold text-gray-950">
                All Leads
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {filteredLeads.length} lead
                {filteredLeads.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  ⌕
                </span>

                <input
                  type="text"
                  placeholder="Search leads..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | "newest"
                      | "oldest"
                      | "nameAsc"
                      | "nameDesc"
                  )
                }
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                aria-label="Sort leads"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="nameAsc">Name A–Z</option>
                <option value="nameDesc">Name Z–A</option>
              </select>

              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10"
                aria-label="Leads per page"
              >
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
                Loading leads...
              </p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                👥
              </div>

              <h2 className="mt-5 text-lg font-bold text-gray-950">
                {search ? "No matching leads" : "No leads yet"}
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">
                {search
                  ? "Try changing your search keywords."
                  : "Add your first lead to start managing potential customers."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setEditingLead(null);
                    setShowForm(true);
                  }}
                  className="mt-5 rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Add Your First Lead
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Lead
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Company
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Source
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Status
                    </th>

                    <th className="px-6 py-4 font-semibold text-gray-600">
                      Priority
                    </th>

                    <th className="px-6 py-4 text-right font-semibold text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-gray-100 transition last:border-0 hover:bg-gray-50/70"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700">
                            {getInitials(lead)}
                          </div>

                          <div className="min-w-0">
                            <Link
  href={`/leads/${lead.id}`}
  className="font-semibold text-gray-950 transition hover:text-blue-600 hover:underline"
>
  {lead.first_name}{" "}
  {lead.last_name ?? ""}
</Link>

                            {lead.job_title && (
                              <p className="mt-1 text-xs text-gray-500">
                                {lead.job_title}
                              </p>
                            )}

                            <p className="mt-1 text-xs text-gray-400">
                              {lead.email ?? lead.phone ?? "No contact details"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <span className="font-medium text-gray-700">
                          {lead.company_name ?? "—"}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <span className="text-gray-600">
                          {lead.source ?? "—"}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${getStatusClasses(
                            lead.status
                          )}`}
                        >
                          {getStatusLabel(lead.status)}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${getPriorityClasses(
                            lead.priority
                          )}`}
                        >
                          {getPriorityLabel(lead.priority)}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex items-center justify-end gap-2">
                          {lead.status !== "converted" && (
                            <button
                              type="button"
                              onClick={() => openConversion(lead)}
                              className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                            >
                              Convert
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => startEditing(lead)}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(lead)}
                            disabled={deletingId === lead.id}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === lead.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-gray-500">
                Showing{" "}
                {sortedLeads.length === 0
                  ? 0
                  : (safeCurrentPage - 1) * pageSize + 1}{" "}
                to {Math.min(safeCurrentPage * pageSize, sortedLeads.length)} of{" "}
                {sortedLeads.length} leads
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={safeCurrentPage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="min-w-24 text-center text-sm font-medium text-gray-600">
                  Page {safeCurrentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={safeCurrentPage === totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
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