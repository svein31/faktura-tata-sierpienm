/** Public portal DTO: never return tenant IDs, audit metadata, XML, tokens or internal workflow data. */
export function portalDocument(document: Record<string, unknown>) {
  return Object.fromEntries(["number", "title", "type", "status", "version", "issueDate", "saleDate", "dueDate", "validUntil", "currency", "isProforma", "paymentStatus", "totalNet", "totalVat", "totalGross", "lines", "acceptedAt", "rejectionReason"].filter(key => key in document).map(key => [key, document[key]]));
}
