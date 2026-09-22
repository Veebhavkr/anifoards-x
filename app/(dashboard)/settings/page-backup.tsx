"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DashboardShell from "@/components/layout/DashboardShell";

type Organization = {
  id: string;
  name: string | null;
  slug?: string | null;
  logo_url?: string | null;
  created_at?: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  token: string;
  expires_at: string;
  created_at: string;
};

type Member = {
  id: string;
  role: string | null;
  user_id: string;
  created_at?: string;
  profile?: {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export default function SettingsPage() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [currentRole, setCurrentRole] = useState("member");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);
  const [copiedInvitationId, setCopiedInvitationId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!currentUser) throw new Error("User session not found.");

      setUser(currentUser);
      setFullName(currentUser.user_metadata?.full_name || "");

      const { data: profile, error: profileLoadError } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, phone")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileLoadError) throw profileLoadError;
      setFullName(profile?.full_name || currentUser.user_metadata?.full_name || "");
      setAvatarUrl(profile?.avatar_url || currentUser.user_metadata?.avatar_url || "");
      setPhone(profile?.phone || "");

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", currentUser.id)
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;
      setCurrentRole(String(membership?.role || "member").toLowerCase());

      if (!membership?.organization_id) {
        throw new Error("No organization is linked to this account.");
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id, name, slug, logo_url, created_at")
        .eq("id", membership.organization_id)
        .single();

      if (orgError) throw orgError;

      setOrganization(org);
      setWorkspaceName(org.name || "");
      setWorkspaceSlug(org.slug || "");
      setWorkspaceLogoUrl(org.logo_url || "");

      const { data: invitationRows, error: invitationsError } = await supabase
        .from("organization_invitations")
        .select("id, email, role, status, token, expires_at, created_at")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false });

      if (invitationsError) {
        setInvitations([]);
      } else {
        setInvitations((invitationRows || []) as Invitation[]);
      }

      const { data: memberRows, error: membersError } = await supabase
        .from("organization_members")
        .select("id, role, user_id, created_at")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: true });

      if (membersError) {
        setMembers([]);
      } else {
        const rows = (memberRows || []) as Member[];
        const memberUserIds = rows.map((member) => member.user_id);

        if (memberUserIds.length > 0) {
          const { data: profileRows } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, phone")
            .in("id", memberUserIds);

          const profileMap = new Map(
            (profileRows || []).map((profile: any) => [profile.id, profile])
          );

          setMembers(
            rows.map((member) => ({
              ...member,
              profile: profileMap.get(member.user_id) || null,
            }))
          );
        } else {
          setMembers(rows);
        }
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!organization) return;

  if (!["owner", "admin"].includes(currentRole)) {
  setError("Only owners and admins can edit workspace settings.");
  return;
}

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const normalizedName = workspaceName.trim();
      const normalizedSlug = workspaceSlug.trim().toLowerCase().replace(/\s+/g, "-");
      const normalizedLogoUrl = workspaceLogoUrl.trim() || null;

      const { data: updatedOrganization, error: updateError } = await supabase
        .from("organizations")
        .update({
          name: normalizedName,
          slug: normalizedSlug,
          logo_url: normalizedLogoUrl,
        })
        .eq("id", organization.id)
        .select("id")
        .single();

      if (updateError) throw updateError;

      if (!updatedOrganization) {
        throw new Error(
          "Workspace was not updated. You may not have permission to edit it."
        );
      }

      setOrganization({
        ...organization,
        name: normalizedName,
        slug: normalizedSlug,
        logo_url: normalizedLogoUrl,
      });
      setMessage("Workspace settings saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Unable to save workspace settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            full_name: fullName.trim() || null,
            avatar_url: avatarUrl.trim() || null,
            phone: phone.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          avatar_url: avatarUrl.trim(),
        },
      });

      if (authError) throw authError;
      setMessage("Profile settings saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Unable to save profile settings.");
    } finally {
      setSaving(false);
    }
  }

  async function sendInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !user) return;
    if (!["owner", "admin"].includes(currentRole)) {
      setError("Only owners and admins can send invitations.");
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      setError("Please enter an email address.");
      return;
    }

    setInviting(true);
    setMessage("");
    setError("");

    try {
      const { data: existingInvitation } = await supabase
        .from("organization_invitations")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInvitation) {
        throw new Error("A pending invitation already exists for this email.");
      }

      const { data: invitation, error: invitationError } = await supabase
        .from("organization_invitations")
        .insert({
          organization_id: organization.id,
          email,
          role: inviteRole,
          invited_by: user.id,
        })
        .select("id, email, role, status, token, expires_at, created_at")
        .single();

      if (invitationError) throw invitationError;

      setInvitations((current) => [invitation as Invitation, ...current]);
      setInviteEmail("");
      setInviteRole("member");
      setMessage("Invitation created successfully. Share the invitation token with the team member until email delivery is connected.");
    } catch (err: any) {
      setError(err?.message || "Unable to create invitation.");
    } finally {
      setInviting(false);
    }
  }

  async function copyInvitationLink(invitation: Invitation) {
    const link = `${window.location.origin}/invite/accept?token=${encodeURIComponent(invitation.token)}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedInvitationId(invitation.id);
      setMessage("Invitation link copied successfully.");
      setError("");
      window.setTimeout(() => setCopiedInvitationId(null), 2000);
    } catch {
      setError(`Copy failed. Invitation link: ${link}`);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!["owner", "admin"].includes(currentRole)) {
      setError("Only owners and admins can revoke invitations.");
      return;
    }

    setMessage("");
    setError("");

    const { error: revokeError } = await supabase
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("organization_id", organization?.id || "");

    if (revokeError) {
      setError(revokeError.message);
      return;
    }

    setInvitations((current) =>
      current.map((invitation) =>
        invitation.id === invitationId
          ? { ...invitation, status: "revoked" }
          : invitation
      )
    );
    setMessage("Invitation revoked successfully.");
  }

  async function removeMember(member: Member) {
    if (!organization || !user) return;

    if (!["owner", "admin"].includes(currentRole)) {
      setError("Only owners and admins can remove members.");
      return;
    }

    if (member.user_id === user.id) {
      setError("You cannot remove yourself from the organization.");
      return;
    }

    if (String(member.role || "").toLowerCase() === "owner") {
      setError("The organization owner cannot be removed.");
      return;
    }

    const memberName = member.profile?.full_name || "this member";
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) return;

    setMessage("");
    setError("");

    try {
      const { error: removeError } = await supabase.rpc(
        "remove_organization_member",
        {
          p_organization_id: organization.id,
          p_user_id: member.user_id,
        },
      );

      if (removeError) throw removeError;

      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setMessage("Team member removed successfully.");
    } catch (err: any) {
      setError(err?.message || "Unable to remove team member.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">
          Loading settings...
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Workspace</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage your workspace, profile, team members and account preferences.
          </p>
        </div>

        {message && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Workspace Profile</h2>
              <p className="mt-1 text-sm text-gray-500">Update your organization information.</p>
            </div>

            {["owner", "admin"].includes(currentRole) ? (
              <form onSubmit={saveWorkspace} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Workspace Name</label>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Your company name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Workspace Slug</label>
                <input
                  value={workspaceSlug}
                  onChange={(event) => setWorkspaceSlug(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="your-company"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL (optional)</label>
                <input
                  type="url"
                  value={workspaceLogoUrl}
                  onChange={(event) => setWorkspaceLogoUrl(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="https://example.com/logo.png"
                />
                <p className="mt-1 text-xs text-gray-500">Use a publicly accessible image URL.</p>
              </div>
              <button
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Workspace"}
              </button>
              </form>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Only workspace owners and admins can edit workspace settings.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Account Profile</h2>
              <p className="mt-1 text-sm text-gray-500">Manage your personal account information.</p>
            </div>

            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email Address</label>
                <input
                  value={user?.email || ""}
                  disabled
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  type="tel"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Your phone number"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Avatar URL</label>
                <input
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  type="url"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="https://example.com/avatar.png"
                />
              </div>
              <button
                disabled={saving}
                className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
              <p className="mt-1 text-sm text-gray-500">Members connected to this workspace.</p>
            </div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3 font-semibold">Member</th>
                  <th className="px-3 py-3 font-semibold">User ID</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-3 py-3 font-semibold">Joined</th>
                  <th className="px-3 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No team members found.
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          {member.profile?.avatar_url ? (
                            <img
                              src={member.profile.avatar_url}
                              alt={member.profile.full_name || "Team member"}
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                              {(member.profile?.full_name || "M").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">
                              {member.profile?.full_name || "Unnamed member"}
                            </p>
                            <p className="text-xs text-gray-500">Workspace member</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-gray-600">{member.user_id}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
                          {member.role || "member"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {["owner", "admin"].includes(currentRole) &&
                        member.user_id !== user?.id &&
                        String(member.role || "").toLowerCase() !== "owner" ? (
                          <button
                            type="button"
                            onClick={() => removeMember(member)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Invite Team Members</h2>
              <p className="mt-1 text-sm text-gray-500">Create invitations for people you want to add to this workspace.</p>
            </div>
            <span className="w-fit rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              {invitations.filter((invitation) => invitation.status === "pending").length} pending
            </span>
          </div>

          {["owner", "admin"].includes(currentRole) ? (
            <form onSubmit={sendInvitation} className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                  placeholder="member@example.com"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {inviting ? "Creating..." : "Create Invite"}
              </button>
            </form>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Only workspace owners and admins can create invitations.
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Role</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Expires</th>
                  <th className="px-3 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                      No invitations created yet.
                    </td>
                  </tr>
                ) : (
                  invitations.map((invitation) => (
                    <tr key={invitation.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-3 text-gray-700">{invitation.email}</td>
                      <td className="px-3 py-3 capitalize text-gray-600">{invitation.role}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                          invitation.status === "pending"
                            ? "bg-yellow-100 text-yellow-700"
                            : invitation.status === "accepted"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                        }`}>
                          {invitation.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {invitation.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => copyInvitationLink(invitation)}
                              className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
                            >
                              {copiedInvitationId === invitation.id ? "Copied" : "Copy Link"}
                            </button>
                          )}
                          {invitation.status === "pending" && ["owner", "admin"].includes(currentRole) ? (
                            <button
                              type="button"
                              onClick={() => revokeInvitation(invitation.id)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Revoke
                            </button>
                          ) : null}
                          {invitation.status !== "pending" && (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Copy a pending invitation link and share it with the invited person. They must sign in using the invited email address to accept it.
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Roles & Permissions</h2>
            <p className="mt-1 text-sm text-gray-500">Review your workspace access level and available permissions.</p>
          </div>

          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Your current role</p>
                <p className="mt-1 text-lg font-bold capitalize text-blue-950">{currentRole}</p>
              </div>
              <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                {currentRole === "owner" ? "Full access" : currentRole === "admin" ? "Administrative access" : "Standard access"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              { role: "Owner", description: "Full workspace control, members and settings." },
              { role: "Admin", description: "Manage daily operations and team workflows." },
              { role: "Member", description: "Work with CRM records and assigned activities." },
            ].map((item) => (
              <div key={item.role} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-gray-900">{item.role}</h3>
                  {currentRole === item.role.toLowerCase() && (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-semibold text-green-700">Current</span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-500">{item.description}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500">Role changes are not enabled here yet. They will be added with protected owner/admin actions.</p>
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Account Actions</h2>
          <p className="mt-1 text-sm text-gray-500">Sign out from your current account on this device.</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Sign Out
          </button>
        </section>
      </div>
    </DashboardShell>
  );
}
