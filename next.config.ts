import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // The collector sidecar's virtualenv is invoked as a subprocess, never
  // imported. Tracing it would follow interpreter symlinks out of the project.
  outputFileTracingExcludes: { "*": ["./python/.venv/**", "./data/**"] },
};

export default nextConfig;
