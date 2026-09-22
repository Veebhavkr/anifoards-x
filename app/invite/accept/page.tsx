
"use client";

import {
  Suspense,
  useEffect,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AcceptInvitationContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    checkSession();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function checkSession() {
    setLoading(true);
    setError("");
    setMessage("");

    if (!token) {
      setError(
        "Invitation token is missing or invalid.",
      );
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      // Preserve invitation URL after login
      const redirectPath =
        `/invite/accept?token=${encodeURIComponent(token)}`;

      router.replace(
        `/login?redirect=${encodeURIComponent(redirectPath)}`,
      );

      return;
    }

    setLoading(false);
  }

  
async function acceptInvitation() {
  if (!token || accepting) {
    return;
  }

  setAccepting(true);
  setError("");
  setMessage("");

  try {
    const { data, error: rpcError } =
      await supabase.rpc(
        "accept_organization_invitation",
        {
          p_token: token,
        },
      );

    // Show the actual Supabase RPC error
    if (rpcError) {
      console.error("Invitation RPC Error:", rpcError);

      throw new Error(
        [
          rpcError.message,
          rpcError.details,
          rpcError.hint,
          rpcError.code,
        ]
          .filter(Boolean)
          .join(" | "),
      );
    }

    console.log("Invitation RPC Response:", data);

    // Validate RPC response
    if (!data?.success) {
      throw new Error(
        data?.message ||
          data?.error ||
          "The invitation could not be accepted. Check the browser console for details.",
      );
    }

    setMessage(
      data.message ||
        "Invitation accepted successfully.",
    );

    setTimeout(() => {
      router.replace("/dashboard");
    }, 1200);
  } catch (err: unknown) {
    console.error("Accept Invitation Error:", err);

    const errorMessage =
      err instanceof Error
        ? err.message
        : "Unable to accept this invitation.";

    setError(errorMessage);
  } finally {
    setAccepting(false);
  }
}

  function goToDashboard() {
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            Anifoards-X
          </p>

          <h1 className="mt-3 text-2xl font-bold text-gray-900">
            Join Workspace
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            Accept your invitation to join the organization
            workspace.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Checking invitation...
          </div>
        ) : (
          <>
            {message && (
              <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {!error && !message && (
              <button
                type="button"
                onClick={acceptInvitation}
                disabled={accepting || !token}
                className="mt-8 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {accepting
                  ? "Accepting..."
                  : "Accept Invitation"}
              </button>
            )}

            <button
              type="button"
              onClick={goToDashboard}
              className="mt-3 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </section>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
          <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-sm text-gray-500">
              Loading invitation...
            </p>
          </section>
        </main>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  );
}