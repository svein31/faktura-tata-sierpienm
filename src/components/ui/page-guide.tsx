"use client";

import * as React from "react";
export { Tooltip, InfoTooltip, HelpTooltip } from "./tooltip";

export interface PageGuideProps {
  title?: string;
  description?: string;
  badge?: string;
  variant?: "default" | "info" | "success" | "warning";
  steps?: Array<{ title: string; description: string; badge?: string; action?: { label: string; href: string } }>;
  defaultOpen?: boolean;
  className?: string;
  storageKey?: string;
}

/**
 * Minimalistyczny adapter komponentu informacyjnego
 */
export function PageGuide(_props: PageGuideProps) {
  return null;
}

export function OnboardingBanner(_props: { hasCompany?: boolean; hasKsef?: boolean; hasInvoices?: boolean }) {
  return null;
}
