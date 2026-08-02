/* eslint-disable react-refresh/only-export-components -- This small provider intentionally co-locates its single selector hook. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AppModuleId } from "../moduleRegistry";

export type RootineAreaId = AppModuleId | "habits";

type ActiveAreaContextValue = {
  activeAreaId: RootineAreaId | null;
  setActiveAreaId: (value: RootineAreaId | null) => void;
};

const ActiveAreaContext = createContext<ActiveAreaContextValue | null>(null);

export function ActiveAreaProvider({ children }: { children: ReactNode }) {
  const [activeAreaId, setActive] = useState<RootineAreaId | null>(null);
  const setActiveAreaId = useCallback((value: RootineAreaId | null) => setActive(value), []);
  const contextValue = useMemo(() => ({ activeAreaId, setActiveAreaId }), [activeAreaId, setActiveAreaId]);
  return <ActiveAreaContext.Provider value={contextValue}>{children}</ActiveAreaContext.Provider>;
}

export function useActiveArea() {
  const value = useContext(ActiveAreaContext);
  if (!value) throw new Error("useActiveArea must be used inside ActiveAreaProvider");
  return value;
}
