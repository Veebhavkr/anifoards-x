"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";
import CalendarEventForm from "@/components/forms/CalendarEventForm";

type CalendarEvent = {
  id: string;
  organization_id: string;
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
  created_by: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CalendarEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [userId, setUserId] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadEvent() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }
    setUserId(auth.user.id);

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", auth.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership?.organization_id) {
      setError(membershipError?.message || "No organization found.");
      setLoading(false);
      return;
    }

    setOrganizationId(membership.organization_id);

    const { data, error: eventError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", params.id)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();

    if (eventError || !data) {
      setError(eventError?.message || "Calendar event not found.");
    } else {
      setEvent(data as CalendarEvent);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEvent();
  }, [params.id]);

  async function deleteEvent() {
    if (!event || !window.confirm("Delete this calendar event?")) return;
    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", event.id)
      .eq("organization_id", organizationId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/calendar");
  }

  return (
    <DashboardShell>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-500">Workspace / Calendar / Details</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">Calendar Event</h1>
          </div>
          <Link href="/calendar" className="text-sm font-medium text-blue-600 hover:underline">Back to Calendar</Link>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">Loading event...</div> : !event ? null : editing ? (
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <CalendarEventForm event={event} organizationId={organizationId} userId={userId} onSuccess={() => { setEditing(false); loadEvent(); }} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{event.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{event.all_day ? "All-day event" : `${formatDate(event.start_at)} – ${formatDate(event.end_at)}`}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Edit</button>
                <button onClick={deleteEvent} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Delete</button>
              </div>
            </div>
            {event.description && <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-gray-700">{event.description}</p>}
            <div className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
              <p><strong>Location:</strong> {event.location || "Not specified"}</p>
              <p><strong>All day:</strong> {event.all_day ? "Yes" : "No"}</p>
              <p><strong>Contact ID:</strong> {event.contact_id || "Not linked"}</p>
              <p><strong>Company ID:</strong> {event.company_id || "Not linked"}</p>
              <p><strong>Deal ID:</strong> {event.deal_id || "Not linked"}</p>
              <p><strong>Assigned to:</strong> {event.assigned_to || "Not assigned"}</p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
