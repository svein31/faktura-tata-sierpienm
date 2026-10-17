"use client";

import { createContext } from "react";
import type { StoreApi } from "zustand";
import type { AppState } from "./store";

export const AppStoreContext = createContext<StoreApi<AppState> | null>(null);
