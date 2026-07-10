"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface AssistiveHubContextValue {
  isAssistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
}

const AssistiveHubContext = createContext<AssistiveHubContextValue | null>(null);

export function AssistiveHubProvider({ children }: { children: ReactNode }) {
  const [isAssistantOpen, setAssistantOpen] = useState(false);

  const value = useMemo<AssistiveHubContextValue>(
    () => ({
      isAssistantOpen,
      setAssistantOpen,
      toggleAssistant: () => setAssistantOpen((open) => !open),
    }),
    [isAssistantOpen]
  );

  return <AssistiveHubContext.Provider value={value}>{children}</AssistiveHubContext.Provider>;
}

export function useAssistiveHub() {
  const context = useContext(AssistiveHubContext);

  if (!context) {
    throw new Error("useAssistiveHub debe usarse dentro de AssistiveHubProvider");
  }

  return context;
}
