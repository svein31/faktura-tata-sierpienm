/** Structured stderr is collected by the host. Never log request bodies, query strings or exception messages (which may contain invoice data). */
export function reportUnexpectedError(error: unknown) {
  const incident = crypto.randomUUID();
  const stack = error instanceof Error ? error.stack?.split("\n").slice(1).join("\n") || error.name : typeof error;
  let hash = 2166136261;
  for (const char of stack) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const fingerprint = (hash >>> 0).toString(16);
  console.error(JSON.stringify({ event: "application_error", severity: "error", incident, fingerprint, timestamp: new Date().toISOString() }));
  return incident;
}
