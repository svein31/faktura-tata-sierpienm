"use client";

import { useCallback } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { sendPilotVital } from "@/lib/pilot-client";

const APP_ROUTES = /^\/(accountant|advances|analytics|audit|calendar|contractors|cost-reviews|dashboard|documents|expenses|finances|help|invoices|jpk|ksef|offers|orders|products|projects|recurring|reminders|settings|tax-estimate|warehouse)(\/|$)/;

/** Official Next/Web Vitals observers calculate session-window CLS and interaction INP. */
export default function VitalsObserver() {
  const report = useCallback((metric: { name: string; id: string; value: number }) => {
    if (!["TTFB", "LCP", "INP", "CLS"].includes(metric.name)) return;
    void sendPilotVital({ metric: metric.name, metricId: metric.id, value: metric.value,
      pageClass: APP_ROUTES.test(window.location.pathname) ? "app" : "public",
      device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop" });
  }, []);
  useReportWebVitals(report);
  return null;
}
