"use client";

import * as React from "react";

export function CookiePreferencesButton({
  className = "hover:text-foreground transition-colors cursor-pointer",
  children = "Ustawienia prywatności",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("open-cookie-preferences"));
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
