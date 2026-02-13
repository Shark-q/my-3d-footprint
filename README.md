# My 3D Footprint (我的 3D 足迹)

[![Next.js 16](https://img.shields.io/badge/Next.js-16.0.4-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Mapbox GL JS](https://img.shields.io/badge/Mapbox-GL%20JS-4264fb?style=flat-square&logo=mapbox)](https://www.mapbox.com/)

一个极具视觉冲击力的 3D 地球足迹记录应用。上传你的旅行照片，自动点亮地图上的区域，探索未知的迷雾，并生成沉浸式的 AI 旅行故事。

## ✨ 核心特性

- **🌍 3D 沉浸式地球**: 基于 Mapbox GL JS 的高性能 3D 地球，支持地形渲染、大气层光效和动态视角切换。
- **🌫️ 战争迷雾 (Fog of War)**: 探索模式下，地图默认被迷雾覆盖。上传照片自动点亮对应区域（支持国家、省份、城市三级精度）。
  - **国内**: 集成高德/阿里云 GeoJSON 数据，精确匹配行政区划。
  - **国际**: 智能匹配全球国家边界，点亮你的环球足迹。
- **📸 智能照片解析**:
  - 自动读取照片 EXIF 信息（GPS 经纬度、拍摄时间）。
  - 内置逆地理编码服务，自动获取地点名称。
  - 支持手动修正定位偏移。
- **📖 沉浸故事模式 (Story Mode)**:
  - 将你的足迹串联成一条时间线故事。
  - **滚动视差交互**: 滚动阅读时，地球自动飞行至对应地点。
  - **实时天气回溯**: 自动查询照片拍摄当天的历史天气。
  - **AI 润色回忆**: 集成通义千问 (Dashscope) 多模态大模型，根据照片内容和环境自动生成动人的旅行文案。
- **🔒 安全与隐私**:
  - 基于 Clerk 的全套用户认证体系。
  - 敏感 API Key 严格存放于服务端环境变量。
  - 图片资源存储于 Supabase Storage。

## 🛠️ 技术栈

- **框架**: [Next.js 16 (App Router)](https://nextjs.org/)
- **语言**: TypeScript
- **UI 库**: React 19 + Tailwind CSS v4 (CSS-first configuration)
- **地图引擎**: Mapbox GL JS + Turf.js (地理空间计算)
- **后端服务**:
  - **数据库**: Prisma + PostgreSQL (with PostGIS extentions)
  - **存储**: Supabase Storage
  - **认证**: Clerk
  - **AI**: Aliyun Dashscope (Qwen-VL-Max)
- **工具**: Exif.js, html2canvas

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/my-3d-footprint.git
cd my-3d-footprint
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填入你的 API Keys：

```bash
cp .env.example .env.local
```

你需要配置以下服务：
- **Mapbox**: 获取 Public Token。
- **Clerk**: 获取 Publishable Key 和 Secret Key。
- **Supabase**: 获取 Project URL 和 Service Role Key。
- **Dashscope**: 获取阿里云百炼 API Key。
- **Visual Crossing**: 获取 Weather API Key。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 开始体验。

## 📂 目录结构

```
src/
├── app/                    # Next.js App Router 页面与 API
│   ├── api/                # 后端 API (天气、地理编码、AI 分析等)
│   ├── map/                # 地图主页
│   └── ...
├── components/             # React 组件
│   ├── MapboxView.tsx      # 地图核心组件
│   ├── StoryMode.tsx       # 故事模式组件
│   └── ...
├── lib/                    # 工具函数与客户端单例 (Prisma, Supabase)
└── ...
```

## 📝 贡献指南

欢迎提交 Issue 和 Pull Request！请确保并在提交前运行 `npm run lint`。

## 📄 许可证

[MIT](LICENSE)
