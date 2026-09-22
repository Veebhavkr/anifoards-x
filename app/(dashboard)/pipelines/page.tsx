"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import PipelineStageForm from "@/components/forms/PipelineStageForm";

type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
};

type PipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
};

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Record<string, PipelineStage[]>>({});

  const [showForm, setShowForm] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "nameAsc" | "nameDesc" | "stageCount"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<
    Array<{
      name: string;
      description: string | null;
      is_default: boolean;
      stage_name: string;
      position: number;
      probability: number;
    }>
  >([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  async function getOrganizationId() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    return membership?.organization_id ?? null;
  }

  async function loadPipelines() {
    setLoading(true);

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setLoading(false);
      setError("No organization found.");
      return;
    }

    const { data, error: pipelineLoadError } = await supabase
      .from("pipelines")
      .select("id, name, description, is_default")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (pipelineLoadError) {
      setError(pipelineLoadError.message);
      setLoading(false);
      return;
    }

    const pipelineData = data ?? [];

    setPipelines(pipelineData);

    if (pipelineData.length > 0) {
      const { data: stageData, error: stageLoadError } = await supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, name, position, probability")
        .in(
          "pipeline_id",
          pipelineData.map((pipeline) => pipeline.id)
        )
        .order("position", { ascending: true });

      if (stageLoadError) {
        setError(stageLoadError.message);
        setLoading(false);
        return;
      }

      const groupedStages: Record<string, PipelineStage[]> = {};

      for (const stage of stageData ?? []) {
        if (!groupedStages[stage.pipeline_id]) {
          groupedStages[stage.pipeline_id] = [];
        }

        groupedStages[stage.pipeline_id].push(stage);
      }

      setStages(groupedStages);
    } else {
      setStages({});
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPipelines();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      setSaving(false);
      return;
    }

    if (!name.trim()) {
      setError("Please enter a pipeline name.");
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setSaving(false);
      return;
    }

    const pipelinePayload = {
      name: name.trim(),
      description: description.trim() || null,
      is_default: isDefault,
    };

    const { error: pipelineError } = editingPipeline
      ? await supabase
          .from("pipelines")
          .update(pipelinePayload)
          .eq("id", editingPipeline.id)
          .eq("organization_id", organizationId)
      : await supabase
          .from("pipelines")
          .insert({
            organization_id: organizationId,
            ...pipelinePayload,
            created_by: user.id,
          });

    if (pipelineError) {
      setError(pipelineError.message);
      setSaving(false);
      return;
    }

    setName("");
    setDescription("");
    setIsDefault(false);
    setEditingPipeline(null);
    setShowForm(false);
    setSaving(false);

    await loadPipelines();
  }

  function openPipelineEditForm(pipeline: Pipeline) {
    setEditingPipeline(pipeline);
    setName(pipeline.name);
    setDescription(pipeline.description ?? "");
    setIsDefault(pipeline.is_default);
    setError("");
    setShowForm(true);
  }

  function openPipelineCreateForm() {
    setEditingPipeline(null);
    setName("");
    setDescription("");
    setIsDefault(false);
    setError("");
    setShowForm(true);
  }

  async function handleDeletePipeline(pipeline: Pipeline) {
    const confirmed = window.confirm(
      `Delete pipeline "${pipeline.name}"? Its stages may also be removed depending on your database foreign-key settings.`
    );

    if (!confirmed) return;

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", pipeline.id)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadPipelines();
  }

  async function handleDeleteStage(stage: PipelineStage) {
    const confirmed = window.confirm(`Delete stage "${stage.name}"?`);

    if (!confirmed) return;

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("id", stage.id)
      .eq("pipeline_id", stage.pipeline_id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await loadPipelines();
  }

  function openStageEditForm(stage: PipelineStage) {
    setEditingStage(stage);
    setSelectedPipelineId(stage.pipeline_id);
    setError("");
  }

  function openStageForm(pipelineId: string) {
    setSelectedPipelineId(pipelineId);
    setError("");
  }

  function closeStageForm() {
    setSelectedPipelineId(null);
  }


  function parseCsvLine(line: string) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (character === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parsePipelinesCsv(csvText: string) {
    const lines = csvText
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      throw new Error("CSV must contain a header and at least one data row.");
    }

    const headers = parseCsvLine(lines[0]).map((header) =>
      header.toLowerCase().replace(/\s+/g, "_")
    );

    const requiredHeaders = ["name", "stage_name"];
    const missingHeader = requiredHeaders.find(
      (header) => !headers.includes(header)
    );

    if (missingHeader) {
      throw new Error(`Missing required column: ${missingHeader}`);
    }

    return lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const row = Object.fromEntries(
        headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""])
      );

      const name = String(row.name ?? "").trim();
      const stageName = String(row.stage_name ?? "").trim();

      if (!name || !stageName) {
        throw new Error(`Row ${index + 2}: name and stage_name are required.`);
      }

      const positionValue = String(row.position ?? "").trim();
      const probabilityValue = String(row.probability ?? "").trim();
      const position = positionValue ? Number(positionValue) : 1;
      const probability = probabilityValue ? Number(probabilityValue) : 0;

      if (!Number.isInteger(position) || position < 1) {
        throw new Error(`Row ${index + 2}: position must be a positive integer.`);
      }

      if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
        throw new Error(`Row ${index + 2}: probability must be between 0 and 100.`);
      }

      const isDefaultValue = String(row.is_default ?? "")
        .trim()
        .toLowerCase();

      return {
        name,
        description: String(row.description ?? "").trim() || null,
        is_default: ["true", "1", "yes"].includes(isDefaultValue),
        stage_name: stageName,
        position,
        probability,
      };
    });
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setImportError("");
    setImportMessage("");
    setImportRows([]);

    if (!file) {
      setImportFileName("");
      return;
    }

    setImportFileName(file.name);

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const rows = parsePipelinesCsv(String(reader.result ?? ""));
        setImportRows(rows);
      } catch (importParseError) {
        setImportError(
          importParseError instanceof Error
            ? importParseError.message
            : "Unable to parse CSV file."
        );
      }
    };

    reader.onerror = () => {
      setImportError("Unable to read the selected CSV file.");
    };

    reader.readAsText(file);
  }

  async function handleImportPipelines() {
    if (importRows.length === 0) {
      setImportError("Please select a valid CSV file first.");
      return;
    }

    setImportLoading(true);
    setImportError("");
    setImportMessage("");

    try {
      const supabase = createClient();
      const organizationId = await getOrganizationId();

      if (!organizationId) {
        throw new Error("No organization found.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Please login first.");
      }

      const existingPipelineNames = new Set(
        pipelines.map((pipeline) => pipeline.name.trim().toLowerCase())
      );

      const grouped = new Map<
        string,
        {
          name: string;
          description: string | null;
          is_default: boolean;
          stages: Array<{ name: string; position: number; probability: number }>;
        }
      >();

      for (const row of importRows) {
        const key = row.name.toLowerCase();

        if (!grouped.has(key)) {
          if (existingPipelineNames.has(key)) {
            continue;
          }

          grouped.set(key, {
            name: row.name,
            description: row.description,
            is_default: row.is_default,
            stages: [],
          });
        }

        const pipeline = grouped.get(key);

        if (pipeline) {
          pipeline.stages.push({
            name: row.stage_name,
            position: row.position,
            probability: row.probability,
          });
        }
      }

      if (grouped.size === 0) {
        throw new Error("No new pipelines found. Existing pipeline names were skipped.");
      }

      let importedPipelines = 0;
      let importedStages = 0;

      for (const pipeline of grouped.values()) {
        const { data: insertedPipeline, error: pipelineError } = await supabase
          .from("pipelines")
          .insert({
            organization_id: organizationId,
            created_by: user.id,
            name: pipeline.name,
            description: pipeline.description,
            is_default: pipeline.is_default,
          })
          .select("id")
          .single();

        if (pipelineError) {
          throw new Error(
            `Pipeline "${pipeline.name}": ${pipelineError.message}`
          );
        }

        const stagePayload = pipeline.stages.map((stage) => ({
          pipeline_id: insertedPipeline.id,
          name: stage.name,
          position: stage.position,
          probability: stage.probability,
        }));

        const { error: stageError } = await supabase
          .from("pipeline_stages")
          .insert(stagePayload);

        if (stageError) {
          throw new Error(
            `Stages for "${pipeline.name}": ${stageError.message}`
          );
        }

        importedPipelines += 1;
        importedStages += stagePayload.length;
      }

      setImportMessage(
        `Imported ${importedPipelines} pipelines and ${importedStages} stages.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadPipelines();
    } catch (importSubmitError) {
      setImportError(
        importSubmitError instanceof Error
          ? importSubmitError.message
          : "Unable to import pipelines."
      );
    } finally {
      setImportLoading(false);
    }
  }

  function getStageCount(pipelineId: string) {
    return stages[pipelineId]?.length ?? 0;
  }

  const filteredPipelines = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return pipelines;
    }

    return pipelines.filter((pipeline) => {
      const pipelineName = pipeline.name.toLowerCase();
      const pipelineDescription = pipeline.description?.toLowerCase() ?? "";

      return (
        pipelineName.includes(query) ||
        pipelineDescription.includes(query)
      );
    });
  }, [pipelines, search]);

  const sortedPipelines = useMemo(() => {
    const items = [...filteredPipelines];

    return items.sort((a, b) => {
      if (sortBy === "nameAsc") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortBy === "nameDesc") {
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      }

      if (sortBy === "stageCount") {
        return getStageCount(b.id) - getStageCount(a.id);
      }

      if (sortBy === "oldest") {
        return pipelines.findIndex((item) => item.id === a.id) -
          pipelines.findIndex((item) => item.id === b.id);
      }

      return pipelines.findIndex((item) => item.id === a.id) -
        pipelines.findIndex((item) => item.id === b.id);
    });
  }, [filteredPipelines, sortBy, stages, pipelines]);

  const totalPages = Math.max(1, Math.ceil(sortedPipelines.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedPipelines = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return sortedPipelines.slice(startIndex, startIndex + pageSize);
  }, [sortedPipelines, safeCurrentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalStages = Object.values(stages).reduce(
    (total, pipelineStages) => total + pipelineStages.length,
    0
  );

  const defaultPipelineCount = pipelines.filter(
    (pipeline) => pipeline.is_default
  ).length;

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Dashboard / Sales / Pipelines
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Sales Pipelines
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Organize your sales process and manage pipeline stages.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setImportError("");
                setImportMessage("");
                setShowImport(true);
              }}
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Import CSV
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setShowForm(true);
              }}
              className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              + Add Pipeline
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Total Pipelines
              </p>

              <span className="rounded-lg bg-blue-50 px-3 py-2 text-lg">
                ◈
              </span>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {pipelines.length}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Sales processes created
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Default Pipelines
              </p>

              <span className="rounded-lg bg-green-50 px-3 py-2 text-lg">
                ✓
              </span>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {defaultPipelineCount}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Default sales workflows
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">
                Total Stages
              </p>

              <span className="rounded-lg bg-purple-50 px-3 py-2 text-lg">
                ☷
              </span>
            </div>

            <p className="mt-4 text-3xl font-bold text-gray-900">
              {totalStages}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Across all pipelines
            </p>
          </div>
        </div>


        {showImport && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Import Pipelines from CSV
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  One row represents one stage. Use the same pipeline name for multiple stages.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              className="block w-full rounded-xl border border-gray-200 p-3 text-sm"
            />

            <p className="mt-2 text-xs text-gray-500">
              Required: name, stage_name. Optional: description, is_default, position, probability.
            </p>

            {importFileName && (
              <p className="mt-3 text-sm text-gray-600">
                Selected file: <span className="font-medium">{importFileName}</span>
              </p>
            )}

            {importError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {importError}
              </p>
            )}

            {importMessage && (
              <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
                {importMessage}
              </p>
            )}

            {importRows.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Pipeline</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Position</th>
                      <th className="px-4 py-3">Probability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.name}-${row.stage_name}-${index}`} className="border-t">
                        <td className="px-4 py-3">{row.name}</td>
                        <td className="px-4 py-3">{row.stage_name}</td>
                        <td className="px-4 py-3">{row.position}</td>
                        <td className="px-4 py-3">{row.probability}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 10 && (
                  <p className="border-t px-4 py-3 text-xs text-gray-500">
                    Showing first 10 of {importRows.length} rows.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={importLoading || importRows.length === 0}
                onClick={handleImportPipelines}
                className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importing..." : "Import Pipelines"}
              </button>
            </div>
          </div>
        )}

        {/* Add Pipeline Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingPipeline ? "Edit Pipeline" : "Add New Pipeline"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingPipeline
                    ? "Update your sales pipeline details."
                    : "Create a pipeline for your sales process."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Pipeline Name
                </label>

                <input
                  type="text"
                  placeholder="e.g. Sales Pipeline"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Description
                </label>

                <textarea
                  placeholder="Describe this pipeline..."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(event) => setIsDefault(event.target.checked)}
                  className="h-4 w-4 rounded"
                />

                <span className="text-sm text-gray-700">
                  Make this the default pipeline
                </span>
              </label>

              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : editingPipeline ? "Update Pipeline" : "Save Pipeline"}
              </button>
            </form>
          </div>
        )}

        {/* Search */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Your Pipelines
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Manage your pipeline stages and sales workflow.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <input
              type="search"
              placeholder="Search pipelines..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black sm:w-64"
            />

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as
                    | "newest"
                    | "oldest"
                    | "nameAsc"
                    | "nameDesc"
                    | "stageCount"
                )
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="nameAsc">Name A–Z</option>
              <option value="nameDesc">Name Z–A</option>
              <option value="stageCount">Most Stages</option>
            </select>

            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-black"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>
        </div>

        {/* Pipeline List */}
        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

              <p className="text-sm text-gray-500">
                Loading pipelines...
              </p>
            </div>
          ) : filteredPipelines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                ◈
              </div>

              <h3 className="text-lg font-semibold text-gray-900">
                {search ? "No pipelines found" : "No pipelines yet"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {search
                  ? "Try a different search term."
                  : "Create your first sales pipeline to get started."}
              </p>

              {!search && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
                >
                  Create Pipeline
                </button>
              )}
            </div>
          ) : (
            paginatedPipelines.map((pipeline) => {
              const pipelineStages = stages[pipeline.id] ?? [];

              return (
                <div
                  key={pipeline.id}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                >
                  {/* Pipeline Header */}
                  <div className="border-b border-gray-100 p-5 sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-bold text-gray-900">
                            {pipeline.name}
                          </h3>

                          {pipeline.is_default && (
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                              Default
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-sm leading-6 text-gray-500">
                          {pipeline.description || "No description added."}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                            {pipelineStages.length}{" "}
                            {pipelineStages.length === 1 ? "Stage" : "Stages"}
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            Sales Workflow
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openStageForm(pipeline.id)}
                        className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                      >
                        + Add Stage
                      </button>
                    </div>
                  </div>

                  {/* Add Stage Form */}
                  {selectedPipelineId === pipeline.id && (
                    <div className="border-b border-gray-100 bg-gray-50 p-5 sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-bold text-gray-900">
                            Add Pipeline Stage
                          </h4>

                          <p className="mt-1 text-sm text-gray-500">
                            Add a stage to {pipeline.name}.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={closeStageForm}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>

                      <PipelineStageForm
                        pipelineId={pipeline.id}
                        onSuccess={() => {
                          closeStageForm();
                          loadPipelines();
                        }}
                      />
                    </div>
                  )}

                  {/* Stages */}
                  <div className="p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                        Pipeline Stages
                      </h4>

                      <span className="text-xs text-gray-400">
                        {pipelineStages.length} total
                      </span>
                    </div>

                    {pipelineStages.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                        <p className="text-sm text-gray-500">
                          No stages added yet.
                        </p>

                        <button
                          type="button"
                          onClick={() => openStageForm(pipeline.id)}
                          className="mt-3 text-sm font-semibold text-gray-900 underline"
                        >
                          Add your first stage
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pipelineStages.map((stage, index) => (
                          <div
                            key={stage.id}
                            className="flex flex-col justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-gray-700 shadow-sm">
                                {index + 1}
                              </div>

                              <div className="min-w-0">
                                <p className="truncate font-semibold text-gray-900">
                                  {stage.name}
                                </p>

                                <p className="mt-1 text-xs text-gray-500">
                                  Stage {index + 1} · Probability{" "}
                                  {stage.probability}%
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => openStageEditForm(stage)}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStage(stage)}
                                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className="h-full rounded-full bg-black"
                                  style={{
                                    width: `${Math.min(
                                      Math.max(stage.probability, 0),
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>

                              <span className="min-w-12 text-right text-sm font-semibold text-gray-700">
                                {stage.probability}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {sortedPipelines.length > 0 && (
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <p className="text-sm text-gray-500">
              Showing{" "}
              <span className="font-semibold text-gray-900">
                {(safeCurrentPage - 1) * pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-gray-900">
                {Math.min(safeCurrentPage * pageSize, sortedPipelines.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-900">
                {sortedPipelines.length}
              </span>{" "}
              pipelines
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