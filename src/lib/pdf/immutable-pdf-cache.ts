import "server-only";

type CachedPdf = { buffer: Buffer; versionId: string; sourceHash: string; sha256: string | null; number: string };

/** Bounded worker-local bytes of immutable print versions. This never caches authentication,
 * membership or the choice of current version; callers must derive the key from fresh data.
 */
export function createImmutablePdfCache(maxBytes = 64 * 1024 * 1024, maxEntries = 1024) {
  const entries = new Map<string, CachedPdf>();
  let bytes = 0;
  return {
    read(versionId: string, sourceHash: string): CachedPdf | undefined {
      const entry = entries.get(versionId);
      if (!entry || entry.sourceHash !== sourceHash) return undefined;
      entries.delete(versionId); entries.set(versionId, entry);
      return { ...entry, buffer: Buffer.from(entry.buffer) };
    },
    put(entry: CachedPdf) {
      if (entry.buffer.length > maxBytes || maxEntries < 1) return;
      const prior = entries.get(entry.versionId);
      if (prior) { bytes -= prior.buffer.length; entries.delete(entry.versionId); }
      while (entries.size && (entries.size >= maxEntries || bytes + entry.buffer.length > maxBytes)) {
        const first = entries.entries().next().value!;
        bytes -= first[1].buffer.length; entries.delete(first[0]);
      }
      entries.set(entry.versionId, { ...entry, buffer: Buffer.from(entry.buffer) });
      bytes += entry.buffer.length;
    },
    size: () => ({ entries: entries.size, bytes }),
  };
}
