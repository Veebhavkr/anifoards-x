"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import TaskForm from "@/components/forms/TaskForm";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  created_at: string;
};

type ImportTask = {
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string;
};

function formatStatus(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  return "Pending";
}

function formatDate(date: string | null) {
  if (!date) return "No due date";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Invalid date";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time: string | null) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "completed") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(task.due_date);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate < today;
}

function getPriorityClass(priority: string) {
  if (priority === "high") {
    return "bg-red-100 text-red-700";
  }

  if (priority === "low") {
    return "bg-green-100 text-green-700";
  }

  return "bg-yellow-100 text-yellow-700";
}

function getStatusClass(status: string) {
  if (status === "completed") {
    return "bg-green-100 text-green-700";
  }

  if (status === "in_progress") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-gray-100 text-gray-700";
}

function escapeCsvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "titleAsc" | "titleDesc" | "priority" | "dueDate"
  >("newest");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const [error, setError] = useState("");

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportTask[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");

  async function getOrganizationId() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      return null;
    }

    return membership?.organization_id ?? null;
  }

  async function loadTasks() {
    setLoading(true);
    setError("");

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      setLoading(false);
      return;
    }

    setOrganizationId(organizationId);

    const { data, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, due_time, assigned_to, created_at"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (taskError) {
      setError(taskError.message);
      setLoading(false);
      return;
    }

    setTasks(data ?? []);
    setLoading(false);
  }

  async function handleDeleteTask(taskId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!confirmed) {
      return;
    }

    setError("");

    const supabase = createClient();
    const organizationId = await getOrganizationId();

    if (!organizationId) {
      setError("No organization found.");
      return;
    }

    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId)
    );
  }

  async function updateTaskStatus(taskId: string, status: string) {
    setError("");

    const supabase = createClient();
    const currentOrganizationId = await getOrganizationId();

    if (!currentOrganizationId) {
      setError("No organization found.");
      return;
    }

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId)
      .eq("organization_id", currentOrganizationId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === taskId ? { ...task, status } : task,
      ),
    );
  }

  function handleExportTasks() {
    if (tasks.length === 0) {
      setError("No tasks available to export.");
      return;
    }

    const headers = [
      "id", "title", "description", "status", "priority",
      "due_date", "due_time", "assigned_to", "created_at",
    ];

    const rows = tasks.map((task) => [
      task.id, task.title, task.description, task.status, task.priority,
      task.due_date, task.due_time, task.assigned_to, task.created_at,
    ]);

    const csv = "\\uFEFF" + [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\\r\\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function openCreateForm() {
    setError("");
    setEditingTask(null);
    setShowForm(true);
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

  function parseTasksCsv(csvText: string): ImportTask[] {
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

    if (!headers.includes("title")) {
      throw new Error("Missing required column: title");
    }

    const getValue = (row: string[], header: string) => {
      const index = headers.indexOf(header);
      return index >= 0 ? row[index]?.trim() ?? "" : "";
    };

    return lines.slice(1).map((line, index) => {
      const row = parseCsvLine(line);
      const title = getValue(row, "title");

      if (!title) {
        throw new Error(`Row ${index + 2}: title is required.`);
      }

      const statusValue = getValue(row, "status") || "pending";
      const priorityValue = getValue(row, "priority") || "medium";

      const allowedStatuses = ["pending", "in_progress", "completed"];
      const allowedPriorities = ["low", "medium", "high"];

      if (!allowedStatuses.includes(statusValue)) {
        throw new Error(
          `Row ${index + 2}: status must be pending, in_progress, or completed.`
        );
      }

      if (!allowedPriorities.includes(priorityValue)) {
        throw new Error(
          `Row ${index + 2}: priority must be low, medium, or high.`
        );
      }

      return {
        title,
        description: getValue(row, "description"),
        status: statusValue,
        priority: priorityValue,
        due_date: getValue(row, "due_date"),
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
      setImportRows(parseTasksCsv(csvText));
    } catch (parseError) {
      setImportError(
        parseError instanceof Error
          ? parseError.message
          : "Unable to parse CSV file."
      );
    }

    event.target.value = "";
  }

  async function handleImportTasks() {
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

      const normalize = (value: string) => value.trim().toLowerCase();
      const existingTitles = new Set(tasks.map((task) => normalize(task.title)));
      const importedTitles = new Set<string>();

      const payload = importRows
        .filter((row) => {
          const titleKey = normalize(row.title);

          if (existingTitles.has(titleKey) || importedTitles.has(titleKey)) {
            return false;
          }

          importedTitles.add(titleKey);
          return true;
        })
        .map((row) => ({
          organization_id: organizationId,
          created_by: user.id,
          title: row.title,
          description: row.description || null,
          status: row.status,
          priority: row.priority,
          due_date: row.due_date || null,
        }));

      if (payload.length === 0) {
        throw new Error("No new tasks to import. Duplicate titles were skipped.");
      }

      const { error: insertError } = await supabase
        .from("tasks")
        .insert(payload);

      if (insertError) throw insertError;

      setImportMessage(
        `${payload.length} task${payload.length === 1 ? "" : "s"} imported successfully.`
      );
      setImportRows([]);
      setImportFileName("");
      await loadTasks();
    } catch (importErrorValue) {
      setImportError(
        importErrorValue instanceof Error
          ? importErrorValue.message
          : "Unable to import tasks."
      );
    } finally {
      setImportLoading(false);
    }
  }

  function openEditForm(task: Task) {
    setError("");
    setEditingTask(task);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTask(null);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const totalTasks = tasks.length;

  const pendingTasks = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const inProgressTasks = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const completedTasks = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const overdueTasks = tasks.filter((task) => isOverdue(task)).length;

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        (task.description?.toLowerCase().includes(query) ?? false);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "overdue"
          ? isOverdue(task)
          : task.status === statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, statusFilter]);

  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = {
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...filteredTasks].sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime()
        );
      }

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

      if (sortBy === "priority") {
        return (
          (priorityOrder[a.priority] ?? 99) -
          (priorityOrder[b.priority] ?? 99)
        );
      }

      if (sortBy === "dueDate") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;

        return (
          new Date(a.due_date).getTime() -
          new Date(b.due_date).getTime()
        );
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [filteredTasks, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTasks = sortedTasks.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, sortBy, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <DashboardShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 text-sm text-gray-500">
              Dashboard / Productivity / Tasks
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Tasks
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage your daily work and track task progress.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            + Add Task
          </button>
          <button
            type="button"
            onClick={() => {
              setShowImport(true);
              setImportMessage("");
              setImportError("");
            }}
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleExportTasks}
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard label="Total Tasks" value={totalTasks} />

          <SummaryCard label="Pending" value={pendingTasks} />

          <SummaryCard
            label="In Progress"
            value={inProgressTasks}
            valueClass="text-blue-600"
          />

          <SummaryCard
            label="Completed"
            value={completedTasks}
            valueClass="text-green-600"
          />

          <SummaryCard
            label="Overdue"
            value={overdueTasks}
            valueClass="text-red-600"
          />
        </div>


        {showImport && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  CSV IMPORT
                </div>
                <h2 className="text-xl font-bold text-gray-900">Import Tasks</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Required column: title. Optional columns: description, status, priority, due_date.
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
                className="w-fit rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
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
                <table className="min-w-[700px] w-full text-left text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-3">Title</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Due Date</th>
                      <th className="px-3 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 10).map((row, index) => (
                      <tr key={`${row.title}-${index}`} className="border-t border-gray-100">
                        <td className="px-3 py-3 font-medium text-gray-900">{row.title}</td>
                        <td className="px-3 py-3 text-gray-600">{row.status}</td>
                        <td className="px-3 py-3 text-gray-600">{row.priority}</td>
                        <td className="px-3 py-3 text-gray-600">{row.due_date || "—"}</td>
                        <td className="px-3 py-3 text-gray-600">{row.description || "—"}</td>
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
                onClick={handleImportTasks}
                disabled={importLoading || importRows.length === 0}
                className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importLoading ? "Importing..." : "Import Tasks"}
              </button>
              <p className="text-xs text-gray-500">
                Duplicate task titles are skipped.
              </p>
            </div>
          </div>
        )}

        {/* Create/Edit Task Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingTask ? "Edit Task" : "Create New Task"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {editingTask
                    ? "Update task details and progress."
                    : "Add a task to your organization."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <TaskForm
              task={editingTask}
              onSuccess={() => {
                closeForm();
                loadTasks();
              }}
              onCancel={closeForm}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">All Tasks</h2>

            <p className="mt-1 text-sm text-gray-500">
              Search and filter your tasks.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <input
              type="search"
              placeholder="Search tasks..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black sm:w-64"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as
                    | "newest"
                    | "oldest"
                    | "titleAsc"
                    | "titleDesc"
                    | "priority"
                    | "dueDate"
                )
              }
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="titleAsc">Title A–Z</option>
              <option value="titleDesc">Title Z–A</option>
              <option value="priority">Priority</option>
              <option value="dueDate">Due Date</option>
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

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Task List */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />

              <p className="text-sm text-gray-500">Loading tasks...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-2xl">
                ✓
              </div>

              <h3 className="text-lg font-semibold text-gray-900">
                {search || statusFilter !== "all"
                  ? "No tasks found"
                  : "No tasks yet"}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                {search || statusFilter !== "all"
                  ? "Try changing your search or filter."
                  : "Create your first task to get started."}
              </p>

              {!search && statusFilter === "all" && (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
                >
                  Create Task
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
              {paginatedTasks.map((task) => {
                const overdue = isOverdue(task);

                return (
                  <div
                    key={task.id}
                    className="p-5 transition hover:bg-gray-50 sm:p-6"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {task.title}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getPriorityClass(
                              task.priority
                            )}`}
                          >
                            {task.priority}
                          </span>
                        </div>

                        {task.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span>
                            Due:{" "}
                            <span
                              className={
                                overdue
                                  ? "font-semibold text-red-600"
                                  : "font-medium text-gray-700"
                              }
                            >
                              {formatDate(task.due_date)}
                              {task.due_time ? ` · ${formatTime(task.due_time)}` : ""}
                            </span>
                          </span>

                          {overdue && (
                            <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">
                              Overdue
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status and Actions */}
                      <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                        <span
                          className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold ${getStatusClass(
                            task.status
                          )}`}
                        >
                          {formatStatus(task.status)}
                        </span>

                        <div className="flex items-center gap-2">
                          {task.status !== "completed" && (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task.id, "completed")}
                              className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                            >
                              Complete
                            </button>
                          )}

                          {task.status === "completed" && (
                            <button
                              type="button"
                              onClick={() => updateTaskStatus(task.id, "pending")}
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                            >
                              Reopen
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openEditForm(task)}
                            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task.id)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing{" "}
                  {sortedTasks.length === 0
                    ? 0
                    : (safeCurrentPage - 1) * pageSize + 1}{" "}
                  to{" "}
                  {Math.min(safeCurrentPage * pageSize, sortedTasks.length)}{" "}
                  of {sortedTasks.length} tasks
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
      </div>
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>

      <p className={`mt-3 text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}