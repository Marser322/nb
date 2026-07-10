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
        <div className={cn("mx-auto flex max-w-xl flex-col items-center px-4 py-6 text-center text-muted-foreground md:px-6 md:py-10", className)}>
            <div className="relative mb-4 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background/70 shadow-md shadow-foreground/5 md:h-28 md:w-28">
                {showImage ? (
                    <Image
                        src={imageSrc}
                        alt={imageAlt}
                        fill
                        sizes="(max-width: 768px) 96px, 112px"
                        className="object-cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <Icon className="h-10 w-10 text-primary/55" aria-hidden="true" />
                )}
                <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            </div>
            <h3 className="text-lg font-bold text-foreground text-balance md:text-xl">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed">{description}</p>
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}
