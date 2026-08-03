import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const ADMIN_URL =
      process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3001";
    const ORGANIZATION_URL =
      process.env.NEXT_PUBLIC_ORGANIZATION_URL || "http://localhost:3002";
    const STUDYBUDDY_URL =
      process.env.NEXT_PUBLIC_STUDYBUDDY_URL || "http://localhost:3003";
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
        {
          source: "/organization",
          destination: `${ORGANIZATION_URL}/organization`,
        },
        {
          source: "/organization/:path*",
          destination: `${ORGANIZATION_URL}/organization/:path*`,
        },
        {
          source: "/organization-static/:path*",
          destination: `${ORGANIZATION_URL}/organization-static/:path*`,
        },
        {
          source: "/studybuddy",
          destination: `${STUDYBUDDY_URL}/studybuddy`,
        },
        {
          source: "/studybuddy/:path*",
          destination: `${STUDYBUDDY_URL}/studybuddy/:path*`,
        },
        {
          source: "/studybuddy-static/:path*",
          destination: `${STUDYBUDDY_URL}/studybuddy-static/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
