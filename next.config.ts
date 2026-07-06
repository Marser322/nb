import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // Nota: en Next 16 la clave `eslint` en next.config ya no está soportada
  // (emitía warnings). El linting se corre aparte con `npm run lint` (ideal en CI).
};

export default nextConfig;
