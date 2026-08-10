import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { NextConfig } from "next";

type AppPlatform = {
  name: string;
  port: number;
  basePath?: string;
  assetPrefix?: string;
};

type ProxiedApp = {
  name: string;
  port: number;
  basePath: string;
  assetPrefix: string;
};

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    // Discover sibling apps from their own package.json "platform" field, so a
    // newly added app is proxied automatically with no edits here. The read is
    // dev-only (guarded above): in production nginx handles routing, and the
    // standalone bundle never touches these files.
    const appsRoot = resolve(process.cwd(), "..");
    const apps = readdirSync(appsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d): AppPlatform => {
        const platform = JSON.parse(
          readFileSync(join(appsRoot, d.name, "package.json"), "utf8"),
        ).platform;
        return { name: d.name, ...platform };
      })
      .filter(
        (a): a is ProxiedApp =>
          a.name !== "gateway" &&
          a.basePath !== undefined &&
          a.assetPrefix !== undefined,
      );

    return {
      beforeFiles: apps.flatMap((a) => {
        const url = `http://localhost:${a.port}`;
        return [
          { source: a.basePath, destination: `${url}${a.basePath}` },
          {
            source: `${a.basePath}/:path*`,
            destination: `${url}${a.basePath}/:path*`,
          },
          {
            source: `${a.assetPrefix}/:path*`,
            destination: `${url}${a.assetPrefix}/:path*`,
          },
        ];
      }),
    };
  },
};

export default nextConfig;
