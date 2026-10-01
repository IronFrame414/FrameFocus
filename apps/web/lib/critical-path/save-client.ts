import type { CriticalPathTaskSave } from '@framefocus/shared/validation/critical-path';

// S122 Part 3 — the line sheet's one save path on a Critical Path project.
// The route writes as the caller (RLS + the Q12 guard decide), then the engine
// recomputes and writes the dates through. Errors come back in the route's
// words (a 403 carries the database's own sentence).

export async function saveCriticalPathTask(
  projectId: string,
  taskId: string,
  body: CriticalPathTaskSave
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/projects/${projectId}/critical-path/tasks/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'The save did not reach the server. Check the connection and try again.' };
  }
  if (res.ok) return { ok: true };
  let message = `The save failed (${res.status}).`;
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === 'string' && j.error) message = j.error;
  } catch {
    // keep the status-code message
  }
  return { ok: false, error: message };
}
