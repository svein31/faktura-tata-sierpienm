/**
 * Fakturo — Application startup file dla cyber_Folks (panel Node.js / Passenger).
 *
 * - Czyta PORT z procesu (panel podaje port z zakresu 35100–35599 albo 54xxx —
 *   dokładny zakres zależy od panelu, patrz deploy/cyberfolks/DEPLOY.md).
 * - Nasłuchuje na 127.0.0.1 (reverse proxy / .htaccess kieruje ruch do aplikacji).
 * - Uruchamia Next.js (`next start`) jako proces potomny — wymaga wcześniejszego
 *   `npm run build` (katalog .next).
 *
 * Uruchomienie lokalne:  PORT=3000 node app.js
 */

"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || "3000";
const HOST = process.env.HOST || "127.0.0.1";

const nextBin = path.join(__dirname, "node_modules", "next", "dist", "bin", "next");

if (!fs.existsSync(path.join(__dirname, ".next", "BUILD_ID"))) {
  console.error(
    "[Fakturo] Brak katalogu .next (BUILD_ID). Najpierw wykonaj: npm ci && npm run build"
  );
  process.exit(1);
}

console.log(`[Fakturo] Starting Next.js on ${HOST}:${PORT} (env: ${process.env.NODE_ENV ?? "production"})`);

const child = spawn(
  process.execPath,
  [nextBin, "start", "-p", PORT, "-H", HOST],
  {
    cwd: __dirname,
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  }
);

child.on("error", (err) => {
  console.error("[Fakturo] Błąd startu Next.js:", err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  console.log(`[Fakturo] Next.js exited (code=${code}, signal=${signal})`);
  process.exit(code ?? (signal ? 1 : 0));
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
