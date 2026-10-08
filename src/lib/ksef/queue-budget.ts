/** Keep cron work below the caller's 25 second timeout. A deadline spans every MF request. */
export const QUEUE_RUN_BUDGET_MS = 20_000;
export const QUEUE_VERIFY_BUDGET_MS = 4_000;
export const QUEUE_EMAIL_RESERVE_MS = 6_000;
export const QUEUE_MIN_JOB_BUDGET_MS = 1_000;

export function canStartQueueJob(deadlineAtMs: number, now = Date.now()) {
  return deadlineAtMs - now >= QUEUE_MIN_JOB_BUDGET_MS;
}

export function queueRunBudget(startedAtMs = Date.now()) {
  return {
    startedAtMs,
    deadlineAtMs: startedAtMs + QUEUE_RUN_BUDGET_MS,
    verificationDeadlineAtMs: startedAtMs + QUEUE_VERIFY_BUDGET_MS,
    transmissionDeadlineAtMs: startedAtMs + QUEUE_RUN_BUDGET_MS - QUEUE_EMAIL_RESERVE_MS,
  };
}
