// Deterministic browser-only catalog boundary; the actual search hook is used.
import { create } from "zustand";

export const useAppStore = create<{ invoices: { id: string }[] }>(() => ({ invoices: [] }));
