import { useSyncExternalStore } from "react";

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}
