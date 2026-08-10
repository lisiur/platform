import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const { basePath, assetPrefix } = JSON.parse(
  readFileSync("package.json", "utf8"),
).platform;

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
  assetPrefix,
  htmlLimitedBots: /.*/,
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
