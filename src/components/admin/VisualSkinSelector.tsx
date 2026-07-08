"use client";

import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VISUAL_SKINS, type VisualSkinDefinition } from "@/lib/visual-skins";
import { cn } from "@/lib/utils";
import { useVisualSkin } from "./VisualSkinProvider";

export function VisualSkinSelector() {
  const { skin, setSkin } = useVisualSkin();
  const activeSkin = VISUAL_SKINS.find((item) => item.id === skin) || VISUAL_SKINS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="admin-skin-trigger"
          title={`Máscara visual: ${activeSkin.label}`}
          aria-label={`Cambiar máscara visual. Actual: ${activeSkin.label}`}
        >
          <Palette className="h-5 w-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="admin-skin-menu w-80 p-2">
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block text-sm font-semibold">Máscaras visuales</span>
          <span className="block text-xs font-normal text-muted-foreground">
            Cambiá el frente del panel sin tocar los datos.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {VISUAL_SKINS.map((item) => {
          const isActive = item.id === skin;

          return (
            <DropdownMenuItem
              key={item.id}
              aria-pressed={isActive}
              onSelect={() => setSkin(item.id)}
              className={cn(
                "admin-skin-option my-1 cursor-pointer items-center gap-3 rounded-lg px-3 py-3",
                isActive && "admin-skin-option-active"
              )}
            >
              <SkinSwatch skin={item} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
              {isActive && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkinSwatch({ skin }: { skin: VisualSkinDefinition }) {
  return (
    <span className="flex h-8 w-12 shrink-0 overflow-hidden rounded-md border border-border/70 shadow-inner">
      {skin.swatches.map((color) => (
        <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}
