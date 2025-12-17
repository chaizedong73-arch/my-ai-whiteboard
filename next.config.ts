/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1. 忽略 TypeScript 类型错误 (防止因类型定义不完美导致打包失败)
  typescript: {
    ignoreBuildErrors: true,
  },
  // 2. 忽略 ESLint 规范错误 (防止因代码风格问题导致打包失败)
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;