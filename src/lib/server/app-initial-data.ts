import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { reportUnexpectedError } from "@/lib/error-report";
import { readBootstrapData } from "@/lib/server/bootstrap-data";

/** React cache deduplicates only within this server request; user data is never globally cached. */
export const getInitialAppData = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // An unavailable initial read must not prevent the existing client retry path.
  const bootstrap = await readBootstrapData(user, true).catch(error => {
    reportUnexpectedError(error);
    return null;
  });
  return { user, bootstrap };
});
