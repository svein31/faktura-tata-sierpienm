"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installGoogleAnalytics, syncGoogleAnalyticsRoute } from "@/lib/google-analytics";

export function GoogleAnalytics() {
  const pathname = usePathname();
  useEffect(() => installGoogleAnalytics(), []);
  useEffect(() => { syncGoogleAnalyticsRoute(); }, [pathname]);
  return null;
}
