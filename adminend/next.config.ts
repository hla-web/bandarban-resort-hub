import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", env: { NEXT_PUBLIC_PORTAL: "admin" }, images: { unoptimized: true } };
export default nextConfig;
