import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep firebase-admin (and its CJS deps) outside the Turbopack SSR bundle.
  // Avoids ERR_REQUIRE_ESM from jwks-rsa requiring ESM-only jose@6 on Vercel.
  serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"],
};

export default nextConfig;
