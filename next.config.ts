import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp"],
  poweredByHeader: false,
};
export default config;
