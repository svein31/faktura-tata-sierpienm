const ts = require("typescript");

module.exports = function typescriptBrowserLoader(source) {
  return ts.transpileModule(source, {
    fileName: this.resourcePath,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
};
