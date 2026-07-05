import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nbbarber.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = ["", "/reservar", "/tienda", "/lookbook", "/contacto"];

    return routes.map((route) => ({
        url: `${SITE_URL}${route}`,
        lastModified: new Date(),
    }));
}
