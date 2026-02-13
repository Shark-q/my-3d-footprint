# AGENTS.md - my-3d-footprint

> **重要提示**：如果在后续对话中达成了新的共识或修改了规则，请务必更新此文件。

## 项目概述

这是一个基于 Next.js 的 3D 足迹地图 SaaS 应用，允许用户上传照片、在 Mapbox 3D 地图上展示旅行足迹，并使用 AI 生成游记文案。

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.x |
| 前端 | React | 19.x |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS (CSS-first) | 4.x |
| 地图 | Mapbox GL JS | 2.15.x |
| 数据库 | PostgreSQL + Prisma + PostGIS | Prisma 5.x |
| 存储 | Supabase Storage | - |
| 认证 | Clerk | 6.x |
| AI | 阿里云 Dashscope (qwen-vl-max) | - |

---

## 目录结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   │   ├── analyze-photo/  # AI 照片分析
│   │   ├── geocode/        # 逆地理编码
│   │   ├── my-footprint/   # 足迹 CRUD
│   │   ├── photos/         # 照片管理
│   │   └── upload/         # 上传流程
│   ├── map/                # 地图页面
│   ├── globals.css         # 全局样式 + Tailwind 主题
│   ├── layout.tsx          # 根布局 (ClerkProvider)
│   └── page.tsx            # 首页
├── components/             # React 组件
│   ├── MapboxView.tsx      # 主地图组件
│   ├── MapDashboard.tsx    # 地图控制面板
│   └── MapPlayer.tsx       # 足迹播放器
└── lib/                    # 工具库
    ├── prisma.ts           # Prisma 客户端单例
    └── supabase.ts         # Supabase Admin 客户端
```

---

## 环境变量

所有敏感配置**必须**通过环境变量管理，**禁止硬编码**。

### 必需变量

```bash
# Database (Prisma + PostgreSQL + PostGIS)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase Storage
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Maps
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...  # 客户端可用
AMAP_KEY=xxx                         # 仅服务端

# AI & Third-party APIs
DASHSCOPE_API_KEY=sk-...
WEATHER_API_KEY=xxx
```

### 命名规范

- `NEXT_PUBLIC_*` 前缀：客户端可访问的变量
- 无前缀：仅服务端 API 路由可用

---

## 编码规范

### TypeScript

- 严格模式已启用 (`strict: true`)
- 使用 `@/*` 路径别名指向 `./src/*`
- 目标编译版本：ES2017

### React 组件

- 客户端组件必须添加 `"use client";` 指令
- React Compiler 已启用，遵循其优化规则
- 组件文件使用 PascalCase 命名

### 国际化与格式化

- 日期格式：故事模式中使用 `YYYY年MM月DD日HH点mm分ss秒`（例如：2025年11月23日08点15分00秒），其他地方推荐使用标准 `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm`。

### 样式 (Tailwind CSS v4)

- 使用 CSS-first 配置方式
- 主题定义在 `globals.css` 中使用 `@theme` 指令
- 无需 `tailwind.config.js` 文件
- Mapbox 样式通过 `@import 'mapbox-gl/dist/mapbox-gl.css'` 引入

### 注释语言

- 代码注释、用户提示等使用中文

---

## API 设计规范

### 响应格式

```typescript
// 成功响应
{ success: true, data: {...} }

// 失败响应
{ success: false, error: "Error message", code?: "ERROR_CODE" }
```

### API 路由

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/my-footprint` | 获取用户足迹数据 |
| PUT | `/api/my-footprint` | 修改照片位置 |
| POST | `/api/my-footprint` | 上传处理与 AI 分析 |
| POST | `/api/upload/presign` | 获取 Supabase 签名上传 URL |
| POST | `/api/upload/complete` | 完成上传并存储元数据 |
| POST | `/api/analyze-photo` | AI 分析照片生成文案 |
| GET | `/api/geocode` | 逆地理编码 |
| GET | `/api/region-boundary` | 获取行政区边界 GeoJSON |

---

## 逆地理编码策略

采用智能多轨制：

| 区域 | 逆地理编码 | 边界数据 |
|------|-----------|----------|
| 中国境内 | 高德 API (`AMAP_KEY`) | 阿里云 DataV GeoJSON |
| 国际热门国家 (20个) | Mapbox Geocoding | 本地 GeoJSON + turf.js |
| 其他国际地区 | Mapbox Geocoding | GitHub world.geo.json |

### 支持省/市精度的国际国家
ARG, AUS, BRA, CAN, CHE, DEU, ESP, FRA, GBR, IND, ITA, JPN, KOR, MEX, NLD, RUS, SGP, USA, ZAF

---

## 数据库模型

### User (用户)

- `clerkId`: Clerk 用户 ID
- `email`: 用户邮箱
- `tier`: 用户层级 (FREE / PRO)
- `storageUsed`: 已用存储空间 (bytes)
- `aiCredits`: AI 调用次数

### Journey (旅程)

- `title`: 旅程标题
- `isPublic`: 是否公开
- `userId`: 所属用户

### PhotoNode (照片节点)

- `location`: PostGIS 地理坐标
- `takenAt`: 拍摄时间
- `s3Key`: Supabase 存储路径
- `caption`: 用户描述
- `aiDiaryText`: AI 生成文案
- `locationName`: 地点名称
- `weatherInfo`: 天气信息 (JSON)

---

## 用户层级配额

| 层级 | 存储空间 | AI Credits / 月 | 状态 |
|------|----------|-----------------|------|
| FREE | 500 MB | 10 次 | ✅ 已实现 |
| PRO | 10 GB | 100 次 | ⏳ 待实现 |

---

## 认证规则

- 所有页面强制登录（Clerk）
- 未登录用户自动重定向至 Clerk 登录页
- 中间件配置在 `src/middleware.ts`

---

## 代码质量要求

### 禁止事项

- ❌ 硬编码 API Key / Token
- ❌ 提交 `console.log` 调试代码到生产环境
- ❌ 单文件超过 500 行（建议 300 行以内）

### 建议事项

- ✅ 大型组件按功能拆分
- ✅ 复杂逻辑抽取为自定义 Hook
- ✅ API 路由使用统一的错误处理

---

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 代码检查
npm run lint

# 数据库迁移
npx prisma migrate dev

# 生成 Prisma 客户端
npx prisma generate
```

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `prisma/schema.prisma` | 数据库模型定义 |
| `src/lib/prisma.ts` | Prisma 客户端单例 |
| `src/lib/supabase.ts` | Supabase Admin 客户端 |
| `src/middleware.ts` | Clerk 认证中间件 |
| `src/app/globals.css` | Tailwind 主题 + 全局样式 |

---

## 待办事项

- [x] ~~创建 `.env.example` 文件~~ ✅ 已完成
- [x] ~~移除硬编码的 Mapbox Token（MapDashboard.tsx, MapPlayer.tsx, MapboxView.tsx）~~ ✅ 已完成
- [x] ~~移除 `supabase.ts` 中的调试日志~~ ✅ 已完成
- [x] ~~更新 `README.md` 包含完整项目说明~~ ✅ 已完成
- [ ] 实现 PRO 层级付费逻辑
- [ ] 添加 API 路由的集成测试

---

*最后更新: 2025-12-15*
