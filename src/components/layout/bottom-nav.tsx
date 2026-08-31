"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  FileText,
  LayoutDashboard,
  Plus,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Pulpit", icon: LayoutDashboard, exact: true },
  { href: "/invoices", label: "Faktury", icon: FileText },
  {
    href: "/invoices/new",
    label: "Wystaw",
    icon: Plus,
    isAction: true,
  },
  { href: "/settings/companies", label: "Firmy", icon: Building2 },
  { href: "/settings/account", label: "Konto", icon: UserCog },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Nawigacja mobilna"
      className="no-print fixed inset-x-0 bottom-0 z-40 block md:hidden"
    >
      <div className="border-t border-border/60 bg-background/90 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            if (item.isAction) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative -mt-5 flex min-h-[48px] min-w-[48px] flex-col items-center justify-center"
                  aria-label="Wystaw nową fakturę"
                >
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className="flex h-13 w-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
                    style={{ width: "3.25rem", height: "3.25rem" }}
                  >
                    <Plus className="h-6 w-6 stroke-[2.5]" />
                  </motion.div>
                  <span className="mt-0.5 text-[9.5px] font-semibold text-primary">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-[44px] min-w-[48px] flex-1 flex-col items-center justify-center py-1 text-center transition-colors active:scale-95",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative flex h-6 w-6 items-center justify-center">
                  {active && (
                    <motion.div
                      layoutId="bottom-nav-active"
                      className="absolute inset-0 -m-1.5 rounded-xl bg-primary/10"
                      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                    />
                  )}
                  <item.icon
                    className={cn("relative z-10 h-5 w-5", active ? "text-primary" : "text-muted-foreground")}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                </div>
                <span className="relative z-10 mt-1 text-[9.5px] font-medium leading-none tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
