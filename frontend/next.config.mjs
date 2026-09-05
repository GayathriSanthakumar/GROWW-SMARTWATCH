/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export so the built frontend can be served by the same Node process
  // as the API + Socket.IO (one origin = no CORS/cookie issues, simpler deploy).
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
