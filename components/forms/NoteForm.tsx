"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Note = {
  id: string;
  title: string;
  content: string | null;
};

type NoteFormProps = {
  organizationId: string;
  userId: string;
  note?: Note | null;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function NoteForm({
  organizationId,
  userId,
  note,
  onSuccess,
  onCancel,
}: NoteFormProps) {
  const isEditMode = Boolean(note);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content ?? "");
    } else {
      setTitle("");
      setContent("");
    }

    setError("");
  }, [note]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      setError("Please enter a note title.");
      return;
    }

    if (!trimmedContent) {
      setError("Please enter note content.");
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();

    if (isEditMode && note) {
      const { error: updateError } = await supabase
        .from("notes")
        .update({
          title: trimmedTitle,
          content: trimmedContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", note.id)
        .eq("organization_id", organizationId);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("notes")
        .insert({
          organization_id: organizationId,
          created_by: userId,
          title: trimmedTitle,
          content: trimmedContent,
        });

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    setTitle("");
    setContent("");
    setLoading(false);

    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Note Title
        </label>

        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter note title"
          required
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Note Content
        </label>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Write your note here..."
          rows={6}
          required
          className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : isEditMode
              ? "Update Note"
              : "Save Note"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}