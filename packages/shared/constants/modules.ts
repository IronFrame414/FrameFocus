// ── Module Status ──

export const MODULE_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
} as const;

export type ModuleStatusValue = typeof MODULE_STATUS[keyof typeof MODULE_STATUS];