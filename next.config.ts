import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      // Notion 이미지 도메인 (S3 저장)
      {
        protocol: "https",
        hostname: "prod-files-secure.s3.us-west-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "s3.us-west-2.amazonaws.com",
      },
      // Notion 공식 도메인
      {
        protocol: "https",
        hostname: "www.notion.so",
      },
    ],
  },
};

export default nextConfig;
