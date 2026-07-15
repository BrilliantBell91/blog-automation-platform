import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      // Notion 이미지 도메인 (S3 저장). Notion은 워크스페이스 리전에 따라 서로 다른
      // S3 버킷/리전을 쓴다(실측 확인: 한국 워크스페이스는
      // prod-files-secure-apne2.s3.ap-northeast-2.amazonaws.com 사용, 미국 리전과 다름).
      // 특정 리전만 허용하면 다른 리전 워크스페이스에서 이미지가 전부 깨지므로
      // 와일드카드로 모든 리전을 포괄한다.
      {
        protocol: "https",
        hostname: "prod-files-secure*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "s3.*.amazonaws.com",
      },
      // Notion 공식 도메인
      {
        protocol: "https",
        hostname: "www.notion.so",
      },
    ],
    formats: ["image/avif", "image/webp"],
    qualities: [75, 85],
    minimumCacheTTL: 3600,
  },
};

export default nextConfig;
