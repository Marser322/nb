"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ImageWithFallbackProps = Omit<ImageProps, "src" | "alt"> & {
    src?: string | null;
    alt: string;
    fallbackClassName?: string;
    iconClassName?: string;
    fallbackLabel?: string;
};

export function ImageWithFallback({
    src,
    alt,
    className,
    fallbackClassName,
    iconClassName,
    fallbackLabel = "Imagen no disponible",
    onError,
    ...props
}: ImageWithFallbackProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const hasFailed = Boolean(src && failedSrc === src);

    if (!src || hasFailed) {
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
            src={src}
            alt={alt}
            className={className}
            onError={(event) => {
                setFailedSrc(src);
                onError?.(event);
            }}
            {...props}
        />
    );
}
