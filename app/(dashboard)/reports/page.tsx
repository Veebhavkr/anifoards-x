"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type ReportData = {
  contacts: any[];
  companies: any[];
  leads: any[];
  deals: any[];
  tasks: any[];
  activities: any[];
};

type SummaryCardProps = {
  title: string;
  value: string | number;
  description: string;
  icon: string;
};

function SummaryCard({
  title,
  value,
  description,
  icon,
}: SummaryCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>

          <h3 className="mt-2 text-3xl font-bold text-gray-900">
            {value}
          </h3>

          <p className="mt-2 text-xs text-gray-500">{description}</p>
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium capitalize text-gray-700">
          {label || "Unknown"}
        </span>

        <span className="text-gray-500">
          {count} ({percentage}%)
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const supabase = createClient();

  const [reportData, setReportData] = useState<ReportData>({
    contacts: [],
    companies: [],
    leads: [],
    deals: [],
    tasks: [],
    activities: [],
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "No date";

    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const exportReportsToCSV = () => {
    const rows: string[][] = [
      ["Report Type", "Name / Title", "Status / Type", "Priority", "Value", "Date"],
    ];

    reportData.contacts.forEach((contact) => {
      rows.push(["Contact", `${contact.first_name || ""} ${contact.last_name || ""}`.trim(), "", "", "", contact.created_at || ""]);
    });

    reportData.companies.forEach((company) => {
      rows.push(["Company", company.name || "", company.industry || "", "", "", company.created_at || ""]);
    });

    reportData.leads.forEach((lead) => {
      rows.push(["Lead", `${lead.first_name || ""} ${lead.last_name || ""}`.trim(), lead.status || "", lead.priority || "", "", lead.created_at || ""]);
    });

    reportData.deals.forEach((deal) => {
      rows.push(["Deal", deal.title || "", "", "", String(deal.value ?? 0), deal.expected_close_date || deal.created_at || ""]);
    });

    reportData.tasks.forEach((task) => {
      rows.push(["Task", task.title || "", task.status || "", task.priority || "", "", task.due_date || task.created_at || ""]);
    });

    reportData.activities.forEach((activity) => {
      rows.push(["Activity", activity.subject || "", activity.type || "", "", "", activity.activity_date || activity.created_at || ""]);
    });

    const csvContent = rows
      .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `anifoards-report-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReports = () => {
    window.print();
  };

  useEffect(() => {
    const loadReports = async () => {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          throw new Error("User is not authenticated.");
        }

        const { data: membership, error: membershipError } =
          await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

        if (membershipError) {
          throw membershipError;
        }

        if (!membership?.organization_id) {
          throw new Error("No organization found for this user.");
        }

        const currentOrganizationId = membership.organization_id;

        const [
          contactsResponse,
          companiesResponse,
          leadsResponse,
          dealsResponse,
          tasksResponse,
          activitiesResponse,
        ] = await Promise.all([
          supabase
            .from("contacts")
            .select(
              "id, first_name, last_name, email, company_id, created_at"
            )
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),

          supabase
            .from("companies")
            .select("id, name, industry, created_at")
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),

          supabase
            .from("leads")
            .select(
              "id, first_name, last_name, company_name, source, status, priority, created_at"
            )
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),

          supabase
            .from("deals")
            .select(
              "id, title, value, currency, expected_close_date, pipeline_id, stage_id, created_at"
            )
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),

          supabase
            .from("tasks")
            .select("id, title, status, priority, due_date, created_at")
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),

          supabase
            .from("activities")
            .select(
              "id, type, subject, activity_date, activity_time, created_at"
            )
            .eq("organization_id", currentOrganizationId)
            .order("created_at", { ascending: false }),
        ]);

        const responses = [
          contactsResponse,
          companiesResponse,
          leadsResponse,
          dealsResponse,
          tasksResponse,
          activitiesResponse,
        ];

        const failedResponse = responses.find((response) => response.error);

        if (failedResponse?.error) {
          throw failedResponse.error;
        }

        setReportData({
          contacts: contactsResponse.data || [],
          companies: companiesResponse.data || [],
          leads: leadsResponse.data || [],
          deals: dealsResponse.data || [],
          tasks: tasksResponse.data || [],
          activities: activitiesResponse.data || [],
        });
      } catch (err: any) {
        console.error("Reports loading error:", err);
        setError(err.message || "Failed to load reports.");
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const totalDealValue = useMemo(() => {
    return reportData.deals.reduce((total, deal) => {
      return total + Number(deal.value || 0);
    }, 0);
  }, [reportData.deals]);

  const leadStatusBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    reportData.leads.forEach((lead) => {
      const status = lead.status || "Unknown";
      breakdown[status] = (breakdown[status] || 0) + 1;
    });

    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [reportData.leads]);

  const leadPriorityBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    reportData.leads.forEach((lead) => {
      const priority = lead.priority || "Unknown";
      breakdown[priority] = (breakdown[priority] || 0) + 1;
    });

    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [reportData.leads]);

  const taskStatusBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    reportData.tasks.forEach((task) => {
      const status = task.status || "Unknown";
      breakdown[status] = (breakdown[status] || 0) + 1;
    });

    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [reportData.tasks]);

  const taskPriorityBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    reportData.tasks.forEach((task) => {
      const priority = task.priority || "Unknown";
      breakdown[priority] = (breakdown[priority] || 0) + 1;
    });

    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [reportData.tasks]);

  const activityTypeBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    reportData.activities.forEach((activity) => {
      const type = activity.type || "Unknown";
      breakdown[type] = (breakdown[type] || 0) + 1;
    });

    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [reportData.activities]);

  const upcomingDeals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...reportData.deals]
      .filter((deal) => {
        if (!deal.expected_close_date) return false;

        const closeDate = new Date(`${deal.expected_close_date}T00:00:00`);
        return closeDate >= today;
      })
      .sort((a, b) => {
        return (
          new Date(`${a.expected_close_date}T00:00:00`).getTime() -
          new Date(`${b.expected_close_date}T00:00:00`).getTime()
        );
      })
      .slice(0, 5);
  }, [reportData.deals]);

  const recentActivities = useMemo(() => {
    return reportData.activities.slice(0, 5);
  }, [reportData.activities]);

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-sm text-gray-500">
            Loading reports...
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error) {
    return (
      <DashboardShell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">
            Unable to load reports
          </h2>

          <p className="mt-2 text-sm text-red-600">{error}</p>

          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium text-blue-600">
              Business Intelligence
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
              Reports
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Understand your business performance from one dashboard.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={exportReportsToCSV}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <span aria-hidden="true">↓</span>
              Export CSV
            </button>

            <button
              type="button"
              onClick={printReports}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <span aria-hidden="true">🖨️</span>
              Print / Save PDF
            </button>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
              Organization Reports
            </div>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            title="Contacts"
            value={reportData.contacts.length}
            description="Total saved contacts"
            icon="👥"
          />

          <SummaryCard
            title="Companies"
            value={reportData.companies.length}
            description="Total companies"
            icon="🏢"
          />

          <SummaryCard
            title="Leads"
            value={reportData.leads.length}
            description="Total generated leads"
            icon="🎯"
          />

          <SummaryCard
            title="Deals"
            value={reportData.deals.length}
            description="Total business deals"
            icon="🤝"
          />

          <SummaryCard
            title="Deal Value"
            value={formatCurrency(totalDealValue)}
            description="Combined deal value"
            icon="💰"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Lead Status
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Distribution of leads by their current status.
              </p>
            </div>

            {leadStatusBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500">No lead data available.</p>
            ) : (
              <div className="space-y-5">
                {leadStatusBreakdown.map(([status, count]) => (
                  <BreakdownRow
                    key={status}
                    label={status}
                    count={count}
                    total={reportData.leads.length}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Lead Priority
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Breakdown of lead priorities.
              </p>
            </div>

            {leadPriorityBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500">
                No lead priority data available.
              </p>
            ) : (
              <div className="space-y-5">
                {leadPriorityBreakdown.map(([priority, count]) => (
                  <BreakdownRow
                    key={priority}
                    label={priority}
                    count={count}
                    total={reportData.leads.length}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Task Status
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Current status of all tasks.
              </p>
            </div>

            {taskStatusBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500">
                No task data available.
              </p>
            ) : (
              <div className="space-y-5">
                {taskStatusBreakdown.map(([status, count]) => (
                  <BreakdownRow
                    key={status}
                    label={status}
                    count={count}
                    total={reportData.tasks.length}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Task Priority
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Priority distribution of tasks.
              </p>
            </div>

            {taskPriorityBreakdown.length === 0 ? (
              <p className="text-sm text-gray-500">
                No task priority data available.
              </p>
            ) : (
              <div className="space-y-5">
                {taskPriorityBreakdown.map(([priority, count]) => (
                  <BreakdownRow
                    key={priority}
                    label={priority}
                    count={count}
                    total={reportData.tasks.length}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Activity Overview
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Activities grouped by type.
            </p>
          </div>

          {activityTypeBreakdown.length === 0 ? (
            <p className="text-sm text-gray-500">
              No activity data available.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {activityTypeBreakdown.map(([type, count]) => (
                <div
                  key={type}
                  className="rounded-xl bg-gray-50 p-4"
                >
                  <p className="text-sm capitalize text-gray-500">
                    {type}
                  </p>

                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {count}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Deal Closures
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Deals with upcoming expected close dates.
            </p>
          </div>

          {upcomingDeals.length === 0 ? (
            <p className="text-sm text-gray-500">
              No upcoming deals found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="px-3 py-3 font-medium">Deal</th>
                    <th className="px-3 py-3 font-medium">Value</th>
                    <th className="px-3 py-3 font-medium">
                      Expected Close
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {upcomingDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-3 py-4 font-medium text-gray-900">
                        {deal.title}
                      </td>

                      <td className="px-3 py-4 text-gray-600">
                        {formatCurrency(Number(deal.value || 0))}
                      </td>

                      <td className="px-3 py-4 text-gray-600">
                        {formatDate(deal.expected_close_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Activities
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Latest activities recorded in your organization.
            </p>
          </div>

          {recentActivities.length === 0 ? (
            <p className="text-sm text-gray-500">
              No recent activities found.
            </p>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex flex-col justify-between gap-2 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {activity.subject}
                    </h3>

                    <p className="mt-1 text-sm capitalize text-gray-500">
                      {activity.type || "Activity"}
                    </p>
                  </div>

                  <p className="text-sm text-gray-500">
                    {formatDate(
                      activity.activity_date || activity.created_at
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}