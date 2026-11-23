import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", env: { NEXT_PUBLIC_PORTAL: "hotel" }, images: { unoptimized: true } };
export default nextConfig;
