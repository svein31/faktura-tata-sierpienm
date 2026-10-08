export const id = '020-pilot-metrics';
const definitions = [
  { collection: 'PilotMetric', key: { expiresAt: 1 }, name: 'PilotMetric_expiresAt_ttl', expireAfterSeconds: 0 },
  { collection: 'PilotMetric', key: { createdAt: 1 }, name: 'PilotMetric_createdAt_idx' },
  { collection: 'PilotVital', key: { expiresAt: 1 }, name: 'PilotVital_expiresAt_ttl', expireAfterSeconds: 0 },
  { collection: 'PilotVital', key: { visitor: 1 }, name: 'PilotVital_visitor_idx' },
  { collection: 'PilotVital', key: { createdAt: 1, metric: 1 }, name: 'PilotVital_createdAt_metric_idx' },
];
export async function plan(db) {
  const indexes = [];
  for (const definition of definitions) {
    let existing = [];
    try { existing = await db.collection(definition.collection).listIndexes().toArray(); }
    catch (error) { if (error.code !== 26) throw error; }
    const match = existing.find(index => JSON.stringify(index.key) === JSON.stringify(definition.key));
    if (match && definition.expireAfterSeconds === 0 && match.expireAfterSeconds !== 0) throw new Error('Pilot metrics have an incompatible expiry index.');
    if (!match) indexes.push(definition);
  }
  return { indexes };
}
export async function up(db, checkpoint) {
  for (const definition of checkpoint.indexes) {
    const { collection, key, ...options } = definition;
    await db.collection(collection).createIndex(key, options);
  }
}
export async function down(db, checkpoint) {
  for (const { collection, name } of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(name); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  }
}
