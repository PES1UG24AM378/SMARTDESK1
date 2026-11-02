/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // the local embedding library uses native modules and must not be bundled
    serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'sharp'],
    // runs instrumentation.js at server start (loads the embedding model once)
    instrumentationHook: true,
  },
};
export default nextConfig;
