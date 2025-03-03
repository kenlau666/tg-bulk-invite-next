/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  rewrites: async () => {
    return [
      {
        source: "/api/:path*",
        destination:
          process.env.NODE_ENV === "development"
            ? "http://34.92.136.54:5328/api/:path*"
            : "http://tg.surftunnel88.com/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
