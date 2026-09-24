const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
if (process.platform === "win32") {
  const extraPaths = [
    "C:\\Users\\wwwyc\\AppData\\Local\\Programs\\Python\\Python312",
    "C:\\Users\\wwwyc\\AppData\\Local\\Programs\\Python\\Python312\\Scripts",
    "C:\\Program Files\\Git\\usr\\bin",
    "C:\\Program Files\\Git\\mingw64\\bin",
  ];
  process.env.PATH = extraPaths.filter(p => fs.existsSync(p)).join(path.delimiter) + path.delimiter + process.env.PATH;
}
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
for (const ext of [".ts", ".tsx"]) require.extensions[ext] = function (mod, file) {
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, file);
};
