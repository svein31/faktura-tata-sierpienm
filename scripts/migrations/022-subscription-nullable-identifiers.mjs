export const id = '022-subscription-nullable-identifiers';
const collectionName = 'Subscription';
const definitions = ['stripeCustomerId', 'stripeSubscriptionId'].map(field => ({
  field, key: { [field]: 1 }, legacyName: `Subscription_${field}_key`, targetName: `Subscription_${field}_string_key`,
}));
const restorableOptions = new Set(['name', 'unique', 'sparse', 'partialFilterExpression', 'collation', 'hidden', 'expireAfterSeconds', 'storageEngine', 'background']);
const ignoredMetadata = new Set(['v', 'ns', 'key']);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
const equal = (left, right) => canonical(left) === canonical(right);
const partial = field => ({ [field]: { $type: 'string' } });

async function listIndexes(collection) {
  try { return await collection.listIndexes().toArray(); }
  catch (error) { if (error.code !== 26) throw error; return []; }
}
function snapshot(index) {
  if (!index) return null;
  const unknown = Object.keys(index).filter(key => !restorableOptions.has(key) && !ignoredMetadata.has(key));
  if (unknown.length) throw new Error(`Unsupported Subscription index options on ${index.name}: ${unknown.join(', ')}. Inspect the index before migration.`);
  const options = Object.fromEntries(Object.entries(index).filter(([key]) => restorableOptions.has(key)));
  // MongoDB omits simple collation from listIndexes. Save it explicitly so
  // restoration cannot accidentally inherit a different collection default.
  options.collation ||= { locale: 'simple' };
  return { key: index.key, options };
}
function validateOwned(index, definition, target = false) {
  if (!equal(index.key, definition.key) || index.unique !== true) {
    throw new Error(`Unexpected definition of ${index.name}. Migration 022 only owns the named unique ascending Stripe identifier indexes.`);
  }
  snapshot(index);
  if (target && (index.sparse || !equal(index.partialFilterExpression, partial(definition.field)))) {
    throw new Error(`Unexpected options on migration-owned ${index.name}. Refusing to replace an unrecognised index.`);
  }
}
async function assertScalarIdentifiers(collection, field) {
  const malformed = await collection.findOne({ $expr: { $not: { $in: [{ $type: `$${field}` }, ['missing', 'null', 'string']] } } }, { projection: { _id: 1 } });
  if (malformed) throw new Error(`Subscription.${field} contains a non-string, non-null value. Correct that record before changing indexes; migration 022 never deletes or rewrites data.`);
}
async function assertNoDuplicates(collection, field, options, operation) {
  const match = options.partialFilterExpression || (options.sparse ? { [field]: { $exists: true } } : {});
  const duplicates = await collection.aggregate([
    { $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 },
  ], options.collation ? { collation: options.collation } : {}).toArray();
  if (duplicates.length) throw new Error(`${operation} is impossible for Subscription.${field}: current records contain duplicate values included by the requested unique index (including null/missing where applicable). No records were changed. Keep migration 022 applied or reconcile records before rollback.`);
}
function assertCheckpoint(checkpoint) {
  if (checkpoint.schemaVersion !== 1 || !Array.isArray(checkpoint.entries)) throw new Error('Invalid migration 022 checkpoint.');
  for (const entry of checkpoint.entries) {
    const definition = definitions.find(value => value.field === entry.field);
    if (!definition || !equal(entry.key, definition.key) || !equal(entry.target?.key, definition.key) || entry.target?.options?.name !== definition.targetName ||
      entry.target.options.unique !== true || !equal(entry.target.options.partialFilterExpression, partial(entry.field)) ||
      entry.target.options.sparse || (entry.legacy && (entry.legacy.options.name !== definition.legacyName || !equal(entry.legacy.key, definition.key) || entry.legacy.options.unique !== true))) {
      throw new Error('Unrecognised migration 022 index ownership in checkpoint.');
    }
  }
}
function checkCurrent(indexes, entry) {
  const definition = definitions.find(value => value.field === entry.field);
  for (const index of indexes) {
    if (equal(index.key, entry.key) && ![definition.legacyName, definition.targetName].includes(index.name)) {
      throw new Error(`Unowned Subscription index ${index.name} also indexes ${entry.field}. Inspect it explicitly before migration 022.`);
    }
  }
  const legacy = indexes.find(index => index.name === definition.legacyName);
  const target = indexes.find(index => index.name === definition.targetName);
  if ((legacy && !equal(snapshot(legacy), entry.legacy)) || (target && !equal(snapshot(target), entry.target))) {
    throw new Error(`Subscription indexes for ${entry.field} changed after migration 022 planning. Refusing to drop or replace an unrecognised index.`);
  }
  return { legacy, target };
}

export async function plan(db) {
  const indexes = await listIndexes(db.collection(collectionName));
  const collectionOptions = (await db.listCollections({ name: collectionName }).next())?.options || {};
  const entries = [];
  for (const definition of definitions) {
    for (const index of indexes) {
      if (equal(index.key, definition.key) && ![definition.legacyName, definition.targetName].includes(index.name)) {
        throw new Error(`Unowned Subscription index ${index.name} also indexes ${definition.field}. Inspect it explicitly before migration 022.`);
      }
    }
    const legacy = indexes.find(index => index.name === definition.legacyName);
    const target = indexes.find(index => index.name === definition.targetName);
    if (legacy) validateOwned(legacy, definition);
    if (target) validateOwned(target, definition, true);
    if (legacy && !legacy.sparse && equal(legacy.partialFilterExpression, partial(definition.field)) && !target) continue;
    if (!legacy && target) continue;
    const collation = legacy ? (legacy.collation || { locale: 'simple' }) : (collectionOptions.collation || { locale: 'simple' });
    const targetOptions = { name: definition.targetName, unique: true, partialFilterExpression: partial(definition.field), collation };
    if (target && !equal(snapshot(target), { key: definition.key, options: targetOptions })) {
      throw new Error(`Migration-owned ${definition.targetName} has incompatible options. Refusing to change its existing semantics.`);
    }
    entries.push({ field: definition.field, key: definition.key, legacy: snapshot(legacy), target: { key: definition.key, options: targetOptions }, targetPreexisting: !!target });
  }
  return { schemaVersion: 1, entries };
}

export async function up(db, checkpoint) {
  assertCheckpoint(checkpoint);
  const collection = db.collection(collectionName);
  const indexes = await listIndexes(collection);
  for (const entry of checkpoint.entries) {
    checkCurrent(indexes, entry);
    await assertScalarIdentifiers(collection, entry.field);
    await assertNoDuplicates(collection, entry.field, entry.target.options, 'Migration 022');
  }
  // Build both replacement indexes first. Real Stripe IDs remain unique while
  // each old index is removed; there is no unprotected drop/recreate interval.
  for (const entry of checkpoint.entries) await collection.createIndex(entry.target.key, entry.target.options);
  for (const entry of checkpoint.entries) {
    const current = checkCurrent(await listIndexes(collection), entry);
    if (current.legacy) await collection.dropIndex(current.legacy.name);
  }
}

export async function down(db, checkpoint) {
  assertCheckpoint(checkpoint);
  const collection = db.collection(collectionName);
  const indexes = await listIndexes(collection);
  for (const entry of checkpoint.entries) {
    const current = checkCurrent(indexes, entry);
    if (entry.targetPreexisting && !current.target) throw new Error(`Pre-existing ${entry.target.options.name} is missing. Refusing unsafe rollback.`);
    if (entry.legacy && !current.legacy && !current.target) throw new Error(`No owned index remains for ${entry.field}. Inspect the database before rollback.`);
    await assertScalarIdentifiers(collection, entry.field);
    if (entry.legacy) await assertNoDuplicates(collection, entry.field, entry.legacy.options, 'Rollback of migration 022');
  }
  // Null/missing duplicates can make the historical index impossible to build.
  // Preflight both fields before mutation and restore both old indexes before
  // removing replacements. Never delete data to make a rollback succeed.
  for (const entry of checkpoint.entries) if (entry.legacy) await collection.createIndex(entry.legacy.key, entry.legacy.options);
  for (const entry of checkpoint.entries) {
    const current = checkCurrent(await listIndexes(collection), entry);
    if (current.target && !entry.targetPreexisting) await collection.dropIndex(current.target.name);
  }
}
