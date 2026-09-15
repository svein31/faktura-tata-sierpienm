import { MongoClient } from 'mongodb';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Forward and reverse migrations are explicit; neither db push nor SQL migrations run here.
export async function migrateData(db, direction = 'up', target) {
  if (!['up', 'down', 'status'].includes(direction)) throw new Error('Use up, down <id>, or status');
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d.*\.mjs$/.test(file)).sort();
  const migrations = await Promise.all(files.map(file => import(new URL(file, directory).href)));
  const journal = db.collection('_fakturoMigrations');
  if (direction === 'status') return journal.find({}).toArray();
  if (direction === 'down' && !target) throw new Error('Rollback requires an explicit migration id');
  const lock = db.collection('_fakturoMigrationLocks');
  // A crashed migration leaves the lock for an operator to inspect instead of risking a concurrent migration.
  await lock.insertOne({ _id: 'migration', startedAt: new Date() });
  try {
    const ordered = direction === 'down' ? [...migrations].reverse() : migrations;
    if (target && !migrations.some(m => m.id === target)) throw new Error('Unknown migration');
    for (const migration of ordered) {
      if (target && migration.id !== target) continue;
      let applied = await journal.findOne({ _id: migration.id });
      if (direction === 'up' && applied?.status !== 'applied') {
        if (!applied) {
          const checkpoint = await migration.plan(db);
          applied = { _id: migration.id, status: 'pending', checkpoint };
          await journal.insertOne(applied);
        }
        await migration.up(db, applied.checkpoint);
        await journal.updateOne({ _id: migration.id }, { $set: { status: 'applied', appliedAt: new Date() } });
      } else if (direction === 'down' && applied) {
        if (await journal.countDocuments({ _id: { $gt: migration.id } })) throw new Error('Rollback later migrations first');
        await migration.down(db, applied.checkpoint);
        await journal.deleteOne({ _id: migration.id });
      }
    }
  } finally { await lock.deleteOne({ _id: 'migration' }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL?.startsWith('mongodb')) throw new Error('DATABASE_URL must point to MongoDB');
  const client = new MongoClient(process.env.DATABASE_URL);
  try { await client.connect(); console.log(await migrateData(client.db(), process.argv[2] || 'up', process.argv[3]) || 'Migration completed'); }
  finally { await client.close(); }
}
