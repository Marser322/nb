"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ImageWithFallbackProps = Omit<ImageProps, "src" | "alt"> & {
    src?: string | null;
    fallbackSrc?: string | null;
    alt: string;
    fallbackClassName?: string;
    iconClassName?: string;
    fallbackLabel?: string;
};

export function ImageWithFallback({
    src,
    fallbackSrc,
    alt,
    className,
    fallbackClassName,
    iconClassName,
    fallbackLabel = "Imagen no disponible",
    onError,
    ...props
}: ImageWithFallbackProps) {
    const [failedSources, setFailedSources] = useState<string[]>([]);
    const resolvedSrc = src && !failedSources.includes(src)
        ? src
        : fallbackSrc && fallbackSrc !== src && !failedSources.includes(fallbackSrc)
            ? fallbackSrc
            : null;

    if (!resolvedSrc) {
        return (
            <div
                className={cn(
                    "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
                    fallbackClassName
                )}
                aria-label={alt ? `${fallbackLabel}: ${alt}` : fallbackLabel}
            >
                <ImageIcon className={cn("h-7 w-7", iconClassName)} aria-hidden="true" />
                <span className="sr-only">{fallbackLabel}</span>
            </div>
        );
    }

    return (
        <Image
            key={resolvedSrc}
            src={resolvedSrc}
            alt={alt}
            className={className}
            onError={(event) => {
                setFailedSources((current) =>
                    current.includes(resolvedSrc) ? current : [...current, resolvedSrc]
                );
                onError?.(event);
            }}
            {...props}
            unoptimized={props.unoptimized ?? resolvedSrc.startsWith("/")}
        />
    );
}
