"use client";

import * as React from "react";
import {
  DEFAULT_VISUAL_SKIN,
  getVisualSkin,
  type VisualSkin,
  VISUAL_SKIN_STORAGE_KEY,
} from "@/lib/visual-skins";

interface VisualSkinContextValue {
  skin: VisualSkin;
  setSkin: (skin: VisualSkin) => void;
}

const VisualSkinContext = React.createContext<VisualSkinContextValue | null>(null);

function applyVisualSkin(skin: VisualSkin) {
  document.documentElement.dataset.visualSkin = skin;
}

export function VisualSkinProvider({ children }: { children: React.ReactNode }) {
  const [skin, setSkinState] = React.useState<VisualSkin>(DEFAULT_VISUAL_SKIN);

  React.useLayoutEffect(() => {
    let storedSkin: VisualSkin = DEFAULT_VISUAL_SKIN;

    try {
      storedSkin = getVisualSkin(window.localStorage.getItem(VISUAL_SKIN_STORAGE_KEY));
    } catch {
      storedSkin = DEFAULT_VISUAL_SKIN;
    }

    setSkinState(storedSkin);
    applyVisualSkin(storedSkin);
  }, []);

  React.useEffect(() => {
    applyVisualSkin(skin);

    try {
      window.localStorage.setItem(VISUAL_SKIN_STORAGE_KEY, skin);
    } catch {
      // La skin sigue funcionando aunque el navegador bloquee localStorage.
    }
  }, [skin]);

  const value = React.useMemo<VisualSkinContextValue>(
    () => ({
      skin,
      setSkin: setSkinState,
    }),
    [skin]
  );

  return <VisualSkinContext.Provider value={value}>{children}</VisualSkinContext.Provider>;
}

export function useVisualSkin() {
  const context = React.useContext(VisualSkinContext);

  if (!context) {
    throw new Error("useVisualSkin debe usarse dentro de VisualSkinProvider");
  }

  return context;
}
