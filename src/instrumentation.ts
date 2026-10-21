import type { Instrumentation } from "next";
import { expectedFrameworkError } from "./lib/product-diagnostics";
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installServerErrorSink } = await import("./lib/server/error-sink");
    installServerErrorSink();
  }
}
export const onRequestError: Instrumentation.onRequestError = async error => {
  if (expectedFrameworkError(error)) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportUnexpectedError } = await import("./lib/error-report");
    reportUnexpectedError(error);
  }
};
