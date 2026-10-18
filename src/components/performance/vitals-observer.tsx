"use client";

import { useCallback, useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { pilotDocumentContext, sendPilotVital } from "@/lib/pilot-client";

/** Official Next/Web Vitals observers calculate session-window CLS and interaction INP. */
export default function VitalsObserver() {
  const [context] = useState(pilotDocumentContext);
  const report = useCallback((metric: { name: string; id: string; value: number }) => {
    if (!["TTFB", "LCP", "INP", "CLS"].includes(metric.name)) return;
    void sendPilotVital({ metric: metric.name, metricId: metric.id, value: metric.value, ...context });
  }, [context]);
  useReportWebVitals(report);
  return null;
}
