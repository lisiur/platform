import manifest from "@root/manifest.json";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const app = manifest.apps.find(
  (a: { name: string }) => a.name === "organization",
);
if (!app) throw new Error("organization not found in manifest.json");
const basePath = app.basePath ?? "";
const assetPrefix = app.assetPrefix ?? "";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  assetPrefix,
  htmlLimitedBots: /.*/,
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
