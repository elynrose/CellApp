/**
 * Lightweight checks for schedule strings. Full cron evaluation runs on the server worker.
 */

/** @returns {{ ok: boolean, error?: string }} */
export function validateCronExpression(expr) {
  if (!expr || typeof expr !== 'string' || !expr.trim()) {
    return { ok: true }; // empty = not using cron
  }
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return {
      ok: false,
      error: 'Cron must have 5 fields (min hour dom month dow) or 6 with optional seconds.'
    };
  }
  return { ok: true };
}

/**
 * Browser-side next fire fallback when cron-parser is unavailable: 1 minute from now.
 */
export function defaultNextRunDate() {
  return new Date(Date.now() + 60 * 1000);
}
