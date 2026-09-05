import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit', 'pdfkit-table'],
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/pdfkit/js/data/**',
      './node_modules/pdfkit-table/node_modules/pdfkit/js/data/**',
      './public/fonts/**'
    ]
  }
};

export default nextConfig;
