import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/layout/DashboardShell";
import StatsCard from "@/components/dashboard/StatsCard";

type LeadRecord = {
  id: string;
  status: string | null;
};

type DealRecord = {
  id: string;
  title: string | null;
  value: number | string | null;
  currency: string | null;
  expected_close_date: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  created_at: string;
};

type PipelineStageRecord = {
  id: string;
  name: string | null;
};

type TaskRecord = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  due_time: string | null;
};

type MonthlyDealSummary = {
  month: string;
  label: string;
  value: number;
  count: number;
};

type DealStageSummary = {
  stage: string;
  value: number;
  count: number;
};

function formatCurrency(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Not scheduled";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function normalizeStatus(value: string | null) {
  return value?.trim().toLowerCase().replace(/[_-]/g, " ") || "unknown";
}

function PerformanceMetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fullName = user?.user_metadata?.full_name || "User";
  const email = user?.email || "";

  let contactsCount = 0;
  let companiesCount = 0;
  let leadsCount = 0;
  let dealsCount = 0;
  let totalPipelineValue = 0;
  let upcomingDealsCount = 0;
  let pendingTasksCount = 0;
  let overdueTasksCount = 0;
  let totalTasksCount = 0;
  let completedTasksCount = 0;
  let averageDealValue = 0;
  let leadConversionRate = 0;
  let winRate = 0;

  let leadStatusBreakdown: Array<{ status: string; count: number }> = [];
  let taskStatusBreakdown: Array<{ status: string; count: number }> = [];
  let monthlyDealSummary: MonthlyDealSummary[] = [];
  let dealStageBreakdown: DealStageSummary[] = [];
  let wonDealsCount = 0;
  let wonDealsValue = 0;
  let lostDealsCount = 0;
  let lostDealsValue = 0;
  let recentDeals: DealRecord[] = [];
  let upcomingTasks: TaskRecord[] = [];

  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const organizationId = membership?.organization_id;

    if (organizationId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTime = today.getTime();

      const [
        contactsResult,
        companiesResult,
        leadsResult,
        dealsResult,
        tasksResult,
        pipelineStagesResult,
      ] = await Promise.all([
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId),

        supabase
          .from("companies")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId),

        supabase
          .from("leads")
          .select("id, status")
          .eq("organization_id", organizationId),

        supabase
          .from("deals")
          .select(
            "id, title, value, currency, expected_close_date, pipeline_id, stage_id, created_at",
          )
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),

        supabase
          .from("tasks")
          .select("id, title, status, priority, due_date, due_time")
          .eq("organization_id", organizationId)
          .order("due_date", { ascending: true, nullsFirst: false }),

        supabase
          .from("pipeline_stages")
          .select("id, name"),
      ]);

      contactsCount = contactsResult.count ?? 0;
      companiesCount = companiesResult.count ?? 0;

      const leads = (leadsResult.data ?? []) as LeadRecord[];
      leadsCount = leads.length;

      const leadStatusMap = new Map<string, number>();

      for (const lead of leads) {
        const status = normalizeStatus(lead.status);
        leadStatusMap.set(status, (leadStatusMap.get(status) ?? 0) + 1);
      }

      leadStatusBreakdown = Array.from(leadStatusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      const deals = (dealsResult.data ?? []) as DealRecord[];
      const pipelineStages = (pipelineStagesResult.data ?? []) as PipelineStageRecord[];
      const stageNameMap = new Map(
        pipelineStages.map((stage) => [stage.id, stage.name?.trim() || "Unassigned"]),
      );

      dealsCount = deals.length;
      recentDeals = deals.slice(0, 5);

      const stageMap = new Map<string, { value: number; count: number }>();

      for (const deal of deals) {
        const dealValue = Number(deal.value ?? 0);
        const safeValue = Number.isFinite(dealValue) ? dealValue : 0;
        const stageName = stageNameMap.get(deal.stage_id ?? "") || "Unassigned";
        const existingStage = stageMap.get(stageName) ?? { value: 0, count: 0 };

        stageMap.set(stageName, {
          value: existingStage.value + safeValue,
          count: existingStage.count + 1,
        });

        const normalizedStage = normalizeStatus(stageName);

        if (normalizedStage.includes("won") || normalizedStage.includes("closed won")) {
          wonDealsCount += 1;
          wonDealsValue += safeValue;
        }

        if (normalizedStage.includes("lost") || normalizedStage.includes("closed lost")) {
          lostDealsCount += 1;
          lostDealsValue += safeValue;
        }
      }

      dealStageBreakdown = Array.from(stageMap.entries())
        .map(([stage, summary]) => ({
          stage,
          value: summary.value,
          count: summary.count,
        }))
        .sort((a, b) => b.value - a.value);

      for (const deal of deals) {
        const dealValue = Number(deal.value ?? 0);

        if (Number.isFinite(dealValue)) {
          totalPipelineValue += dealValue;
        }

        if (deal.expected_close_date) {
          const closeDate = new Date(deal.expected_close_date).getTime();

          if (closeDate >= todayTime) {
            upcomingDealsCount += 1;
          }
        }
      }

      averageDealValue = dealsCount > 0 ? totalPipelineValue / dealsCount : 0;
      winRate = dealsCount > 0 ? (wonDealsCount / dealsCount) * 100 : 0;
      leadConversionRate =
        leadsCount > 0 ? (dealsCount / leadsCount) * 100 : 0;

      const tasks = (tasksResult.data ?? []) as TaskRecord[];

      const taskStatusMap = new Map<string, number>();

      for (const task of tasks) {
        const status = normalizeStatus(task.status);
        taskStatusMap.set(status, (taskStatusMap.get(status) ?? 0) + 1);
      }

      taskStatusBreakdown = Array.from(taskStatusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      const monthlyMap = new Map<string, { value: number; count: number }>();

      for (const deal of deals) {
        const createdDate = new Date(deal.created_at);
        if (Number.isNaN(createdDate.getTime())) continue;

        const monthKey = `${createdDate.getFullYear()}-${String(
          createdDate.getMonth() + 1,
        ).padStart(2, "0")}`;
        const existing = monthlyMap.get(monthKey) ?? { value: 0, count: 0 };
        const dealValue = Number(deal.value ?? 0);

        monthlyMap.set(monthKey, {
          value: existing.value + (Number.isFinite(dealValue) ? dealValue : 0),
          count: existing.count + 1,
        });
      }

      monthlyDealSummary = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)
        .reverse()
        .map(([month, summary]) => ({
          month,
          label: new Intl.DateTimeFormat("en-IN", {
            month: "short",
            year: "numeric",
          }).format(new Date(`${month}-01T00:00:00`)),
          value: summary.value,
          count: summary.count,
        }));

      totalTasksCount = tasks.length;

      for (const task of tasks) {
        const status = normalizeStatus(task.status);
        const isCompleted = ["completed", "complete", "done", "closed"].includes(status);

        if (isCompleted) {
          completedTasksCount += 1;
        }

        if (!isCompleted) {
          pendingTasksCount += 1;
        }

        if (
          task.due_date &&
          new Date(task.due_date).getTime() < todayTime &&
          !["completed", "complete", "done", "closed"].includes(status)
        ) {
          overdueTasksCount += 1;
        }
      }

      upcomingTasks = tasks
        .filter((task) => {
          const status = normalizeStatus(task.status);
          const isCompleted = ["completed", "complete", "done", "closed"].includes(
            status,
          );

          if (isCompleted || !task.due_date) return false;

          const dueDate = new Date(`${task.due_date}T23:59:59`);
          return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() >= todayTime;
        })
        .sort((a, b) => {
          const aTime = new Date(
            `${a.due_date}T${a.due_time || "23:59:59"}`,
          ).getTime();
          const bTime = new Date(
            `${b.due_date}T${b.due_time || "23:59:59"}`,
          ).getTime();

          return aTime - bTime;
        })
        .slice(0, 5);

      // The dashboard uses these metrics for the performance summary cards.
      // Keep the calculation safe when the organization has no tasks.
      if (totalTasksCount > 0) {
        // This value is rendered directly as a percentage in the UI.
        // No database field is changed.
      }
    }
  }

  const firstName = fullName.split(" ")[0];

  return (
    <DashboardShell>
      <div className="space-y-8">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              Business overview
            </p>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome back, {firstName} 👋
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Here is what is happening with your business today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/leads"
              className="rounded-lg border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              View Leads
            </Link>

            <Link
              href="/deals"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              View Deals
            </Link>
          </div>
        </section>

        <section className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {firstName.charAt(0).toUpperCase()}
            </div>

            <div>
              <p className="font-semibold">{fullName}</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>

          <span className="w-fit rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
            Workspace Active
          </span>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Your workspace</h2>
            <p className="text-sm text-muted-foreground">
              A quick overview of your CRM records.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              title="Total Contacts"
              value={contactsCount}
              description="People in your CRM"
            />

            <StatsCard
              title="Total Companies"
              value={companiesCount}
              description="Businesses in your CRM"
            />

            <StatsCard
              title="Total Leads"
              value={leadsCount}
              description="Potential customers"
            />

            <StatsCard
              title="Total Deals"
              value={dealsCount}
              description="Sales opportunities"
            />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Sales overview</h2>
            <p className="text-sm text-muted-foreground">
              Track pipeline value, upcoming closures, and daily workload.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              title="Pipeline Value"
              value={totalPipelineValue}
              description={`Total value: ${formatCurrency(totalPipelineValue)}`}
            />

            <StatsCard
              title="Upcoming Closures"
              value={upcomingDealsCount}
              description="Deals with future close dates"
            />

            <StatsCard
              title="Pending Tasks"
              value={pendingTasksCount}
              description="Tasks still requiring action"
            />

            <StatsCard
              title="Overdue Tasks"
              value={overdueTasksCount}
              description="Pending tasks past their due date"
            />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Deal outcomes</h2>
            <p className="text-sm text-muted-foreground">
              Overview of won and lost opportunities based on pipeline stage names.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PerformanceMetricCard
              title="Won Deals / Won Value"
              value={`${wonDealsCount} deals`}
              description={formatCurrency(wonDealsValue)}
            />
            <PerformanceMetricCard
              title="Lost Deals / Lost Value"
              value={`${lostDealsCount} deals`}
              description={formatCurrency(lostDealsValue)}
            />
            <PerformanceMetricCard
              title="Active Deals"
              value={String(Math.max(dealsCount - wonDealsCount - lostDealsCount, 0))}
              description="Deals not marked won or lost"
            />
            <PerformanceMetricCard
              title="Total Deal Value"
              value={formatCurrency(totalPipelineValue)}
              description={`${dealsCount} total deal${dealsCount === 1 ? "" : "s"}`}
            />
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Performance summary</h2>
            <p className="text-sm text-muted-foreground">
              Quick indicators for your sales and daily workflow.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PerformanceMetricCard
              title="Average Deal Value"
              value={formatCurrency(averageDealValue)}
              description={`${dealsCount} deal${dealsCount === 1 ? "" : "s"} included`}
            />
            <PerformanceMetricCard
              title="Win Rate"
              value={`${Math.round(winRate)}%`}
              description={`${wonDealsCount} won out of ${dealsCount} total deals`}
            />
            <PerformanceMetricCard
              title="Lead-to-Deal Rate"
              value={`${Math.round(leadConversionRate)}%`}
              description={`${dealsCount} deals compared with ${leadsCount} leads`}
            />
            <PerformanceMetricCard
              title="Task Completion Percentage"
              value={`${totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0}%`}
              description={`${completedTasksCount} of ${totalTasksCount} tasks completed`}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Lead status overview</h2>
                <p className="text-sm text-muted-foreground">
                  Distribution of your current leads.
                </p>
              </div>

              <Link
                href="/leads"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {leadStatusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No lead status data available yet.
              </p>
            ) : (
              <div className="space-y-4">
                {leadStatusBreakdown.map((item) => {
                  const percentage =
                    leadsCount > 0 ? (item.count / leadsCount) * 100 : 0;

                  return (
                    <div key={item.status} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="capitalize font-medium">
                          {item.status}
                        </span>
                        <span className="text-muted-foreground">
                          {item.count} ({Math.round(percentage)}%)
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Upcoming tasks</h2>
                <p className="text-sm text-muted-foreground">
                  Tasks that need your attention.
                </p>
              </div>

              <Link
                href="/tasks"
                className="text-sm font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming tasks found.
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{task.title || "Untitled task"}</p>

                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] capitalize">
                        {task.priority || "Normal"}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {formatDate(task.due_date)}
                      {task.due_time ? ` · ${formatTime(task.due_time)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Lead Status Chart</h2>
                <p className="text-sm text-muted-foreground">
                  Visual distribution of leads by status with count and percentage.
                </p>
              </div>
            </div>

            {leadStatusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lead data available yet.</p>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total leads</p>
                    <p className="text-2xl font-bold">{leadsCount}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Status distribution</p>
                </div>

                {leadStatusBreakdown.map((item) => {
                  const percentage = leadsCount > 0 ? (item.count / leadsCount) * 100 : 0;

                  return (
                    <div key={`chart-${item.status}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium capitalize">{item.status}</span>
                        <span className="font-medium text-muted-foreground">
                          {item.count} lead{item.count === 1 ? "" : "s"} · {Math.round(percentage)}%
                        </span>
                      </div>
                      <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          role="progressbar"
                          aria-label={`${item.status} leads`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(percentage)}
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${percentage}%`, minWidth: percentage > 0 ? "8px" : "0px" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Deal pipeline by stage</h2>
                <p className="text-sm text-muted-foreground">
                  Total deal value grouped by pipeline stage.
                </p>
              </div>
            </div>

            {dealStageBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pipeline stage data available yet.</p>
            ) : (
              <div className="space-y-4">
                {dealStageBreakdown.map((item) => {
                  const maxStageValue = Math.max(
                    ...dealStageBreakdown.map((entry) => entry.value),
                    1,
                  );
                  const percentage = (item.value / maxStageValue) * 100;

                  return (
                    <div key={`stage-chart-${item.stage}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="max-w-[65%] truncate font-medium capitalize">
                          {item.stage}
                        </span>
                        <span className="text-muted-foreground">
                          {formatCurrency(item.value)} · {item.count} deal{item.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-emerald-500/15">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Monthly sales overview</h2>
                <p className="text-sm text-muted-foreground">
                  Deal value grouped by creation month.
                </p>
              </div>
              <Link href="/deals" className="text-sm font-medium text-primary hover:underline">
                View deals
              </Link>
            </div>

            {monthlyDealSummary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No monthly sales data available yet.</p>
            ) : (
              <div className="space-y-4">
                {monthlyDealSummary.map((item) => {
                  const maxValue = Math.max(...monthlyDealSummary.map((entry) => entry.value), 1);
                  const percentage = (item.value / maxValue) * 100;

                  return (
                    <div key={item.month} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(item.value)} · {item.count} deal{item.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Task status overview</h2>
                <p className="text-sm text-muted-foreground">
                  Breakdown of your task workflow.
                </p>
              </div>
              <Link href="/tasks" className="text-sm font-medium text-primary hover:underline">
                View tasks
              </Link>
            </div>

            {taskStatusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No task status data available yet.</p>
            ) : (
              <div className="space-y-4">
                {taskStatusBreakdown.map((item) => {
                  const totalTasks = taskStatusBreakdown.reduce((sum, entry) => sum + entry.count, 0);
                  const percentage = totalTasks > 0 ? (item.count / totalTasks) * 100 : 0;

                  return (
                    <div key={`task-status-${item.status}`} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium capitalize">{item.status}</span>
                        <span className="text-muted-foreground">
                          {item.count} ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Recent deals</h2>
              <p className="text-sm text-muted-foreground">
                Your latest sales opportunities.
              </p>
            </div>

            <Link
              href="/deals"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {recentDeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deals available yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-medium">Deal</th>
                    <th className="px-3 py-3 font-medium">Value</th>
                    <th className="px-3 py-3 font-medium">Expected close</th>
                    <th className="px-3 py-3 font-medium">Created</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {recentDeals.map((deal) => (
                    <tr key={deal.id}>
                      <td className="px-3 py-3 font-medium">
                        {deal.title || "Untitled deal"}
                      </td>
                      <td className="px-3 py-3">
                        {formatCurrency(
                          Number(deal.value ?? 0),
                          deal.currency || "INR",
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDate(deal.expected_close_date)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDate(deal.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="text-sm text-muted-foreground">
              Manage your customer and sales workflow.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/contacts"
              className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-xl">
                👤
              </div>

              <h3 className="font-semibold">Contacts</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Manage your customer relationships.
              </p>

              <p className="mt-4 text-sm font-medium text-primary">
                Open Contacts →
              </p>
            </Link>

            <Link
              href="/companies"
              className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-xl">
                🏢
              </div>

              <h3 className="font-semibold">Companies</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Organize and manage businesses.
              </p>

              <p className="mt-4 text-sm font-medium text-primary">
                Open Companies →
              </p>
            </Link>

            <Link
              href="/leads"
              className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-xl">
                🎯
              </div>

              <h3 className="font-semibold">Leads</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Track potential customers and follow-ups.
              </p>

              <p className="mt-4 text-sm font-medium text-primary">
                Open Leads →
              </p>
            </Link>

            <Link
              href="/deals"
              className="group rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-xl">
                💼
              </div>

              <h3 className="font-semibold">Deals</h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Monitor your sales opportunities.
              </p>

              <p className="mt-4 text-sm font-medium text-primary">
                Open Deals →
              </p>
            </Link>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              ANIFOARDS CRM
            </span>

            <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
              Your business, organized in one place.
            </h2>

            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              Manage contacts, companies, leads, deals and customer
              relationships from one centralized workspace.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/pipelines"
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Manage Pipelines
              </Link>

              <Link
                href="/tasks"
                className="rounded-lg border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                View Tasks
              </Link>
            </div>
          </div>

          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl" />
        </section>
      </div>
    </DashboardShell>
  );
}
