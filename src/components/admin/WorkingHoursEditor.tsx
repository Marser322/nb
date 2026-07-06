"use client";

import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { WorkingHours } from "@/types/database.types";

const DAYS_OF_WEEK = [
    { key: "lunes", label: "Lunes" },
    { key: "martes", label: "Martes" },
    { key: "miercoles", label: "Miércoles" },
    { key: "jueves", label: "Jueves" },
    { key: "viernes", label: "Viernes" },
    { key: "sabado", label: "Sábado" },
    { key: "domingo", label: "Domingo" },
];

interface WorkingHoursEditorProps {
    value: WorkingHours | null;
    onChange: (newValue: WorkingHours | null) => void;
}

export function WorkingHoursEditor({ value, onChange }: WorkingHoursEditorProps) {
    // Inicializar el estado interno con las horas del valor provisto
    const [localHours, setLocalHours] = useState<WorkingHours>({});

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        setLocalHours(value || {});
    }, [value]);
    /* eslint-enable react-hooks/set-state-in-effect */

    const updateDayConfig = (
        dayKey: string,
        field: "start" | "end" | "break_start" | "break_end" | "hasBreak",
        fieldValue: string | boolean
    ) => {
        const currentDayConfig = localHours[dayKey] || { start: "09:00", end: "20:00" };
        
        const newDayConfig = {
            ...currentDayConfig,
        };

        if (field === "hasBreak") {
            if (!fieldValue) {
                delete newDayConfig.break_start;
                delete newDayConfig.break_end;
            } else {
                newDayConfig.break_start = "13:00";
                newDayConfig.break_end = "14:00";
            }
        } else {
            newDayConfig[field] = fieldValue as string;
        }

        const newHours = {
            ...localHours,
            [dayKey]: newDayConfig,
        };

        setLocalHours(newHours);
        onChange(Object.keys(newHours).length > 0 ? newHours : null);
    };

    const toggleDay = (dayKey: string, isOpen: boolean) => {
        const newHours = { ...localHours };
        if (isOpen) {
            newHours[dayKey] = {
                start: "09:00",
                end: "20:00",
            };
        } else {
            delete newHours[dayKey];
        }
        setLocalHours(newHours);
        onChange(Object.keys(newHours).length > 0 ? newHours : null);
    };

    return (
        <div className="space-y-4 p-4 rounded-lg glass-card">
            <h3 className="text-sm font-semibold text-primary tracking-wider uppercase mb-2">
                Horarios Semanales
            </h3>
            <div className="divide-y divide-border/50 space-y-3">
                {DAYS_OF_WEEK.map((day) => {
                    const dayConfig = localHours[day.key];
                    const isOpen = !!dayConfig;
                    const hasBreak = !!(dayConfig && dayConfig.break_start && dayConfig.break_end);

                    // Validaciones locales rápidas
                    let errorMsg: string | null = null;
                    if (isOpen && dayConfig) {
                        const { start, end, break_start, break_end } = dayConfig;
                        if (start >= end) {
                            errorMsg = "Cierre posterior al inicio.";
                        } else if (break_start && break_end) {
                            if (break_start >= break_end) {
                                errorMsg = "Fin del descanso posterior al inicio.";
                            } else if (break_start <= start || break_end >= end) {
                                errorMsg = "Descanso dentro de la jornada.";
                            }
                        }
                    }

                    return (
                        <div key={day.key} className="pt-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <Switch
                                        checked={isOpen}
                                        onCheckedChange={(checked) => toggleDay(day.key, checked)}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                    <span className={`text-sm font-medium ${isOpen ? "text-foreground" : "text-muted-foreground"}`}>
                                        {day.label}
                                    </span>
                                </div>

                                {isOpen && dayConfig && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded border border-border">
                                            <span className="text-[10px] text-muted-foreground">Inicio</span>
                                            <Input
                                                type="time"
                                                value={dayConfig.start.slice(0, 5)}
                                                onChange={(e) => updateDayConfig(day.key, "start", e.target.value)}
                                                className="w-[85px] h-7 bg-transparent border-0 p-0 text-xs text-center focus:ring-0 text-foreground focus:outline-none"
                                            />
                                        </div>
                                        <span className="text-muted-foreground text-xs">—</span>
                                        <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded border border-border">
                                            <span className="text-[10px] text-muted-foreground">Fin</span>
                                            <Input
                                                type="time"
                                                value={dayConfig.end.slice(0, 5)}
                                                onChange={(e) => updateDayConfig(day.key, "end", e.target.value)}
                                                className="w-[85px] h-7 bg-transparent border-0 p-0 text-xs text-center focus:ring-0 text-foreground focus:outline-none"
                                            />
                                        </div>

                                        {!hasBreak ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => updateDayConfig(day.key, "hasBreak", true)}
                                                className="h-7 text-xs text-primary hover:text-primary-foreground hover:bg-primary/20 gap-1 px-2"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Descanso
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => updateDayConfig(day.key, "hasBreak", false)}
                                                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/20 gap-1 px-2"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                Descanso
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {isOpen && dayConfig && hasBreak && (
                                <div className="flex items-center gap-2 pl-12 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded border border-primary/20">
                                        <span className="text-[10px] text-primary/70">Pausa</span>
                                        <Input
                                            type="time"
                                            value={dayConfig.break_start?.slice(0, 5) || "13:00"}
                                            onChange={(e) => updateDayConfig(day.key, "break_start", e.target.value)}
                                            className="w-[80px] h-6 bg-transparent border-0 p-0 text-xs text-center focus:ring-0 text-foreground"
                                        />
                                    </div>
                                    <span className="text-primary/40 text-xs">a</span>
                                    <div className="flex items-center gap-1.5 bg-card px-2 py-1 rounded border border-primary/20">
                                        <Input
                                            type="time"
                                            value={dayConfig.break_end?.slice(0, 5) || "14:00"}
                                            onChange={(e) => updateDayConfig(day.key, "break_end", e.target.value)}
                                            className="w-[80px] h-6 bg-transparent border-0 p-0 text-xs text-center focus:ring-0 text-foreground"
                                        />
                                    </div>
                                </div>
                            )}

                            {errorMsg && (
                                <div className="text-[11px] text-red-400 pl-12 mt-1 font-medium italic">
                                    ⚠️ {errorMsg}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
