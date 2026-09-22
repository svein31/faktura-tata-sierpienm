import { backupDatabase, restoreDatabase } from './archive.mjs';
const [action, file, databaseName] = process.argv.slice(2);
try {
  if (!file || !['create', 'restore'].includes(action)) throw new Error('Usage: node scripts/backup/run.mjs create FILE | restore FILE NEW_DATABASE_NAME');
  const counts = action === 'create'
    ? await backupDatabase(process.env.BACKUP_DATABASE_URL, file, process.env.BACKUP_KEY)
    : await restoreDatabase(process.env.RESTORE_DATABASE_URL, file, process.env.BACKUP_KEY, databaseName);
  console.log(JSON.stringify({ event: 'backup_' + action, success: true, collections: Object.keys(counts).length, documents: Object.values(counts).reduce((a,b) => a+b,0) }));
} catch {
  // Driver errors can include credentials or business data. Report failure without dumping them to shared logs.
  console.error(JSON.stringify({ event: 'backup_' + action, success: false, message: 'Backup/restore failed. Check configuration and inspect privately.' })); process.exitCode = 1;
}
