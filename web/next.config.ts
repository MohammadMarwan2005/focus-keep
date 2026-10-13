import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // low-RAM production box: one static-generation worker, no extra threads
  experimental: { cpus: 1, workerThreads: false },
};

export default nextConfig;
