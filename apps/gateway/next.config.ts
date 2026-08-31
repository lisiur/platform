import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

type AppPlatform = {
  name: string;
  port: number;
  basePath?: string;
  assetPrefix?: string;
  disabled?: boolean;
  built?: boolean;
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

    // Read the root manifest.json — the single source of truth for app ports.
    // Dev-only (guarded above): in production nginx handles routing.
    //
    // Dev mode proxies EVERY non-gateway app with a basePath — including
    // those marked `disabled` or `built: false` in the manifest. Those flags
    // gate deploy-time artifacts (nginx, PM2, tarball, updater), not dev: if
    // you're running the app locally, `pnpm dev:<name>` should still expose
    // it through the gateway at its declared basePath. The deploy-time
    // filter (`!disabled && built !== false`) lives in gen-nginx.mjs,
    // ecosystem.config.js, assemble.sh, and updater/pm2.ts.
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../manifest.json"), "utf8"),
    );
    const apps = (manifest.apps as AppPlatform[]).filter(
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
