export type VisualSkin = "nb-luxe" | "quantix-noir" | "neon-focus" | "flow-amber";

export interface VisualSkinDefinition {
  id: VisualSkin;
  label: string;
  description: string;
  swatches: readonly string[];
}

export const VISUAL_SKIN_STORAGE_KEY = "nb-admin-visual-skin";
export const DEFAULT_VISUAL_SKIN: VisualSkin = "nb-luxe";

export const VISUAL_SKINS: readonly VisualSkinDefinition[] = [
  {
    id: "nb-luxe",
    label: "NB Luxe vivo",
    description: "Dorado barbería premium con más textura y presencia.",
    swatches: ["#0A0805", "#D4AF37", "#F6E8C8"],
  },
  {
    id: "quantix-noir",
    label: "Noir Trading",
    description: "Negro profundo, cristal humo y acentos violetas.",
    swatches: ["#05060A", "#7C7BFF", "#F7F5FF"],
  },
  {
    id: "neon-focus",
    label: "Neon Focus",
    description: "Azules eléctricos, violeta suave y paneles glass.",
    swatches: ["#020716", "#38BDF8", "#A855F7"],
  },
  {
    id: "flow-amber",
    label: "Ámbar Flow",
    description: "Energía operativa con naranja, verde y contraste alto.",
    swatches: ["#080502", "#FF6A00", "#22C55E"],
  },
];

export function isVisualSkin(value: string | null | undefined): value is VisualSkin {
  return VISUAL_SKINS.some((skin) => skin.id === value);
}

export function getVisualSkin(value: string | null | undefined): VisualSkin {
  return isVisualSkin(value) ? value : DEFAULT_VISUAL_SKIN;
}
