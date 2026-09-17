"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { PaymentCalendar } from "@/components/calendar/payment-calendar";

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Terminarz płatności & Podatki"
        description="Miesięczny kalendarz przepływów pieniężnych (wpływy z faktur, wydatki kosztowe) oraz ustawowe terminy podatkowe ZUS, VAT i PIT/CIT."
      />
      <PaymentCalendar />
    </div>
  );
}
