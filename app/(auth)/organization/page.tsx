"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function OrganizationPage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateOrganization(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    const organizationName = name.trim();

    if (!organizationName) {
      setError("Please enter your organization name.");
      setLoading(false);
      return;
    }

    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug) {
      setError("Please enter a valid organization name.");
      setLoading(false);
      return;
    }

    const organizationId = crypto.randomUUID();

    const { error: organizationError } = await supabase
      .from("organizations")
      .insert({
        id: organizationId,
        name: organizationName,
        slug,
        created_by: user.id,
      });

    if (organizationError) {
      setError(organizationError.message);
      setLoading(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        role: "owner",
      });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-3xl font-bold">
          Create your organization
        </h1>

        <p className="mb-8 text-gray-500">
          Tell us about your business to get started with Anifoards.
        </p>

        <form
          onSubmit={handleCreateOrganization}
          className="space-y-4"
        >
          <input
            type="text"
            placeholder="Business / Organization Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border px-4 py-3 outline-none"
          />

          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </main>
  );
}