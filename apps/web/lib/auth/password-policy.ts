/**
 * The password floor, in ONE place. Before S109 the 8-character minimum lived
 * only inside `app/reset-password/page.tsx`, client-side; a second entry point
 * would have had to copy it. The self-service change (#162) enforces it on the
 * SERVER as well, in `changeMyPassword`. The hosted Supabase Auth minimum is a
 * separate setting and is not visible from the repo (no `supabase/config.toml`).
 */
export const PASSWORD_MIN_LENGTH = 8;

export function passwordTooShortMessage(): string {
  return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
}
