"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Contact = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default function ContactDetailPage() {
  const params = useParams<{ id?: string; contactId?: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadContact() {
      const contactId = params?.id ?? params?.contactId;

      if (!contactId) {
        setError("Contact ID is missing.");
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please login first.");
        setLoading(false);
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership?.organization_id) {
        setError("No organization found.");
        setLoading(false);
        return;
      }

      const { data, error: contactError } = await supabase
        .from("contacts")
        .select(
          "id, organization_id, first_name, last_name, email, phone, job_title, created_at, updated_at"
        )
        .eq("id", contactId)
        .eq("organization_id", membership.organization_id)
        .maybeSingle();

      if (contactError) {
        setError(contactError.message);
      } else if (!data) {
        setError("Contact not found.");
      } else {
        setContact(data);
      }

      setLoading(false);
    }

    loadContact();
  }, [params?.id, params?.contactId]);

  async function handleDelete() {
    if (!contact) return;

    const confirmed = window.confirm(
      `Delete ${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}? This action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setDeleting(false);
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
      setDeleting(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id)
      .eq("organization_id", membership.organization_id);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    router.push("/contacts");
  }

  const fullName = contact
    ? `${contact.first_name} ${contact.last_name ?? ""}`.trim()
    : "Contact";

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/contacts" className="transition hover:text-gray-900">
            Contacts
          </Link>
          <span>/</span>
          <span className="text-gray-900">Contact Details</span>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
            <p className="mt-4 text-sm text-gray-500">Loading contact...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm text-red-700">{error}</p>
            <Link
              href="/contacts"
              className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to Contacts
            </Link>
          </div>
        ) : contact ? (
          <>
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-xl font-bold text-white">
                  {`${contact.first_name.charAt(0)}${contact.last_name?.charAt(0) ?? ""}`.toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Contact Profile
                  </p>
                  <h1 className="mt-1 text-2xl font-bold text-gray-950">
                    {fullName}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {contact.job_title ?? "No job title added"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/contacts?edit=${contact.id}`}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Edit Contact
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                <h2 className="text-lg font-bold text-gray-950">
                  Contact Information
                </h2>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      First Name
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {contact.first_name}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Last Name
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {contact.last_name ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Email
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-gray-900">
                      {contact.email ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Phone
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {contact.phone ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Job Title
                    </p>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      {contact.job_title ?? "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Status
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-950">
                  CRM Activity
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                  Related activities, tasks, notes, and deals can be connected
                  to this contact in the next CRM integration phase.
                </p>

                <div className="mt-6 rounded-xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Contact ID
                  </p>
                  <p className="mt-2 break-all text-xs text-gray-600">
                    {contact.id}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
