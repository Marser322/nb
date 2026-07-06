"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IllustratedEmptyStateProps {
    title: string;
    description: string;
    imageSrc?: string;
    imageAlt?: string;
    icon: LucideIcon;
    action?: ReactNode;
    className?: string;
}

export function IllustratedEmptyState({
    title,
    description,
    imageSrc,
    imageAlt = "",
    icon: Icon,
    action,
    className,
}: IllustratedEmptyStateProps) {
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = imageSrc && !imageFailed;

    return (
        <div className={cn("mx-auto flex max-w-xl flex-col items-center px-6 py-12 text-center text-muted-foreground", className)}>
            <div className="relative mb-5 flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg shadow-foreground/5">
                {showImage ? (
                    <Image
                        src={imageSrc}
                        alt={imageAlt}
                        fill
                        unoptimized
                        sizes="128px"
                        className="object-cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <Icon className="h-12 w-12 text-primary/55" />
                )}
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            </div>
            <h3 className="text-xl font-bold text-foreground">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed">{description}</p>
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
