import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const ADMIN_URL =
      process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001";
    return {
      beforeFiles: [
        {
          source: "/admin",
          destination: `${ADMIN_URL}/admin`,
        },
        {
          source: "/admin/:path*",
          destination: `${ADMIN_URL}/admin/:path*`,
        },
        {
          source: "/admin-static/:path*",
          destination: `${ADMIN_URL}/admin-static/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
