import { reportBackup } from "../backup/receipt.mjs";
import { readdir, stat } from "node:fs/promises";
import { join, isAbsolute, basename } from "node:path";
import { spawn } from "node:child_process";
const directory = process.env.BACKUP_COPY_SOURCE;
const target = process.env.BACKUP_COPY_TARGET;
if (!directory || !isAbsolute(directory) || !target || !/^[\w-]+:[^\s]+$/.test(target)) {
  console.error("Set absolute BACKUP_COPY_SOURCE and rclone BACKUP_COPY_TARGET in the operator environment.");
  process.exit(1);
}
function transfer(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("rclone", ["copyto", file, target.replace(/\/$/, "") + "/" + basename(file), "--immutable", "--checksum", "--quiet"], { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("Transfer failed")));
  });
}
// Freeze the inventory before copying; never confirm a file created during transfer.
try {
  const files = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".enc")).map(async name => ({ file: join(directory, name), modified: (await stat(join(directory, name))).mtimeMs })));
  files.sort((a, b) => b.modified - a.modified);
  if (!files.length) throw new Error("No archives");
  for (const archive of files) await transfer(archive.file);
  await reportBackup("offsite", files[0].file);
} catch { console.error("Offsite backup transfer or confirmation failed."); process.exitCode = 1; }
