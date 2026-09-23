import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

const directory = process.env.BACKUP_COPY_SOURCE;
const target = process.env.BACKUP_COPY_TARGET;
if (!directory || !isAbsolute(directory) || !target || !/^[\w-]+:[^\s]+$/.test(target)) {
  console.error("Set absolute BACKUP_COPY_SOURCE and rclone BACKUP_COPY_TARGET in the operator environment.");
  process.exit(1);
}
// Remote credentials belong in the operator-owned rclone config, outside Git.
// Immutable copies never replace a previously uploaded archive or remove one.
const child = spawn("rclone", ["copy", directory, target, "--include", "*.enc", "--immutable", "--checksum", "--quiet"], { stdio: "inherit" });
child.on("error", () => { console.error("Backup transfer could not start."); process.exitCode = 1; });
child.on("exit", code => { if (code !== 0) process.exitCode = 1; });
