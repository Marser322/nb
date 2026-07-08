"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface ImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    folder: "avatars" | "products" | "services";
    placeholder?: string;
}

export function ImageUpload({ value, onChange, folder, placeholder = "Subir imagen" }: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tamaño < 2MB
        if (file.size > 2 * 1024 * 1024) {
            toast.error("El archivo es demasiado grande (máximo 2 MB)");
            return;
        }

        // Validar tipo de imagen
        if (!file.type.startsWith("image/")) {
            toast.error("Solo se admiten archivos de imagen");
            return;
        }

        try {
            setIsUploading(true);
            const fileExt = file.name.split(".").pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const filePath = `${folder}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from("media")
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: true,
                });

            if (uploadError) {
                console.error("Error al subir archivo:", uploadError);
                toast.error("Error al subir la imagen a Storage");
                return;
            }

            const { data: { publicUrl } } = supabase.storage
                .from("media")
                .getPublicUrl(filePath);

            onChange(publicUrl);
            toast.success("Imagen subida con éxito");
        } catch (error) {
            console.error("Error al subir archivo:", error);
            toast.error("Ocurrió un error inesperado al subir la imagen");
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div className="space-y-4">
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                disabled={isUploading}
            />

            {value ? (
                <div className="relative w-40 h-40 rounded-lg overflow-hidden border border-border/50 bg-muted/20 group">
                    <Image
                        src={value}
                        alt="Preview"
                        fill
                        sizes="160px"
                        className="object-cover"
                        unoptimized={value.startsWith("http") && !value.includes(".supabase.co")}
                    />
                    <button
                        type="button"
                        onClick={handleRemove}
                        className="absolute top-2 right-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
                        disabled={isUploading}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-40 h-40 border border-dashed border-border hover:border-primary/50 bg-card/30 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors p-4 text-center group"
                >
                    {isUploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Subiendo...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                            <Upload className="h-8 w-8 text-primary/80 group-hover:text-primary transition-colors" />
                            <span className="text-xs font-medium">{placeholder}</span>
                            <span className="text-[10px] text-muted-foreground/60">Máx 2 MB</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
