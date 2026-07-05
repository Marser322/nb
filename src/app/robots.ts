import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nbbarber.vercel.app";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/admin-login", "/setup-admin", "/barbero", "/api"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
    };
}
