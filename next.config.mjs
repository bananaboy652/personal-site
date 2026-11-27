/** @type {import('next').NextConfig} */
const nextConfig = {
  // Each project has its own page under /projects/<slug>; the list of them is a section of the home page.
  async redirects() {
    return [{ source: '/projects', destination: '/#project', permanent: false }];
  },
  images: {
    domains: [
      "api.microlink.io", // Microlink Image Preview
    ],
  },
};

export default nextConfig;
