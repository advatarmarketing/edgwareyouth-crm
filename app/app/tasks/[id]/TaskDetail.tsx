"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { setTaskStatus, addTaskComment, type ActionState } from "../actions";
import { input, fieldLabel, button } from "@/lib/ui";
import type { TaskStatus } from "@/lib/supabase/types";

const EMPTY: ActionState = { error: null, ok: null };

export function StatusForm({ taskId, status, blockedReason }: { taskId: string; status: TaskStatus; blockedReason: string | null }) {
  const [state, action] = useFormState(setTaskStatus, EMPTY);
  const [chosen, setChosen] = useState<TaskStatus>(status);

  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
      <input type="hidden" name="id" value={taskId} />

      <label style={{ display: "grid", gap: 5 }}>
        <span style={fieldLabel}>Status</span>
        <select
          name="status"
          value={chosen}
          onChange={(e) => setChosen(e.target.value as TaskStatus)}
          style={input}
        >
          <option value="todo">To do</option>
          <option value="doing">Doing</option>
          <option value="done">Done</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>

      {/* Only asked for when it applies, but required when it does —
          the database rejects a blocked task with no reason, so the
          form asks rather than letting the write fail. */}
      {chosen === "blocked" && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={fieldLabel}>What is blocking it?</span>
          <textarea
            name="blocked_reason"
            rows={2}
            required
            defaultValue={blockedReason ?? ""}
            style={{ ...input, resize: "vertical" }}
          />
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>
            Whoever assigned this gets told.
          </span>
        </label>
      )}

      <div>
        <button type="submit" style={button}>Update</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
        {state.ok && <span style={{ color: "var(--ok-fg)", marginLeft: 12 }}>{state.ok}</span>}
      </div>
    </form>
  );
}

export function CommentForm({ taskId }: { taskId: string }) {
  const [state, action] = useFormState(addTaskComment, EMPTY);

  return (
    <form action={action} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
      <input type="hidden" name="task_id" value={taskId} />
      <textarea name="body" rows={2} placeholder="Add a comment" style={{ ...input, resize: "vertical" }} />
      <div>
        <button type="submit" style={button}>Comment</button>
        {state.error && <span style={{ color: "var(--danger-fg)", marginLeft: 12 }}>{state.error}</span>}
      </div>
    </form>
  );
}
