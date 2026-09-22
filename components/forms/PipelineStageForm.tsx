
"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PipelineStage = {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
};

type PipelineStageFormProps = {
  pipelineId: string;
  stage?: PipelineStage | null;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function PipelineStageForm({
  pipelineId,
  stage,
  onSuccess,
  onCancel,
}: PipelineStageFormProps) {
  const isEditMode = Boolean(stage);

  const [name, setName] = useState("");
  const [probability, setProbability] = useState("0");
  const [position, setPosition] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (stage) {
      setName(stage.name);
      setProbability(String(stage.probability));
      setPosition(String(stage.position));
    } else {
      setName("");
      setProbability("0");
      setPosition("0");
    }

    setError("");
  }, [stage]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    const stageName = name.trim();
    const stageProbability = Number(probability);
    const stagePosition = Number(position);

    if (!stageName) {
      setError("Please enter a stage name.");
      setLoading(false);
      return;
    }

    if (
      Number.isNaN(stageProbability) ||
      stageProbability < 0 ||
      stageProbability > 100
    ) {
      setError("Probability must be between 0 and 100.");
      setLoading(false);
      return;
    }

    if (
      Number.isNaN(stagePosition) ||
      stagePosition < 0 ||
      !Number.isInteger(stagePosition)
    ) {
      setError("Position must be a whole number greater than or equal to 0.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (isEditMode && stage) {
      const { error: updateError } = await supabase
        .from("pipeline_stages")
        .update({
          name: stageName,
          position: stagePosition,
          probability: stageProbability,
        })
        .eq("id", stage.id)
        .eq("pipeline_id", pipelineId);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("pipeline_stages")
        .insert({
          pipeline_id: pipelineId,
          name: stageName,
          position: stagePosition,
          probability: stageProbability,
        });

      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }
    }

    setName("");
    setProbability("0");
    setPosition("0");
    setLoading(false);

    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Stage Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        className="w-full rounded-lg border px-4 py-3 outline-none focus:border-black"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <input
          type="number"
          placeholder="Position"
          value={position}
          min="0"
          step="1"
          onChange={(event) => setPosition(event.target.value)}
          required
          className="w-full rounded-lg border px-4 py-3 outline-none focus:border-black"
        />

        <input
          type="number"
          placeholder="Probability %"
          value={probability}
          min="0"
          max="100"
          step="1"
          onChange={(event) => setProbability(event.target.value)}
          required
          className="w-full rounded-lg border px-4 py-3 outline-none focus:border-black"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-black px-4 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Saving..."
            : isEditMode
              ? "Update Stage"
              : "Save Stage"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}