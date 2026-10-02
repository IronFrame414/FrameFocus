// S122 Part 8 — the stamp's refusal, ONE sentence for the route's 409 and the
// tab's notice [Josh, RULED 2026-10-01: refuse, and name how many]. Pure, so a
// client component can show it without importing the server's stamp.

export function alreadyHasTasks(n: number): string {
  return `This project already has ${n} ${n === 1 ? 'task' : 'tasks'}; stamping would mix two plans. Stamp onto a project with no tasks.`;
}
