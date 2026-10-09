// Browser fixture state and deterministic failures; never imported by the app.
import { create } from "zustand";
const notifications = [
  { id: "test-a", kind: "test", title: "Testowe powiadomienie A", body: "Syntetyczne dane", read: false, createdAt: "2026-10-08T12:00:00Z" },
  { id: "test-b", kind: "test", title: "Testowe powiadomienie B", body: "Syntetyczne dane", read: false, createdAt: "2026-10-08T12:00:00Z" },
];
export const useAppStore = create<any>((set: (state: Record<string, unknown>) => void, get: () => any) => ({
  contractors: [{ id: "test-contractor", name: "Żółć — testowy kontrahent", nip: "1234567890", email: "synthetic@example.invalid" }],
  products: [], invoices: [], selectedCompanyId: "synthetic-company", hydrated: true,
  notifications, notificationPrefs: { soundEnabled: false, browserEnabled: false },
  setDraft: () => {},
  markNotificationRead: async (id: string) => {
    if ((window as any).failNotificationWrites) throw new Error("Synthetic write failure");
    set({ notifications: get().notifications.map((item: any) => item.id === id ? { ...item, read: true } : item) });
  },
  fetchNotifications: async () => {}, updateNotificationPrefs: async () => {},
}));
export const getContractor = () => undefined;
