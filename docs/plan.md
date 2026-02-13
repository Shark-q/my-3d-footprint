
-----

# 开发方案：旅行足迹海报生成器 (MVP)

## 1\. 项目概述

**目标**：在 Next.js 项目中开发一个“旅行回忆海报生成器”功能。
**核心逻辑**：采用“三明治合成法”生成一张 2:3 比例的竖版海报，并支持将其导出为图片。
**视觉风格**：底层为地图/风景，中间层为旅行轨迹，上层为散落的宝丽来照片（Polaroid）。

## 2\. 技术栈

  - **框架**: Next.js 16 (App Router)
  - **样式**: Tailwind CSS v4
  - **地图服务**: Mapbox GL JS + Mapbox Map Matching API
  - **图片生成**: html2canvas (用于最终导出)
  - **语言**: TypeScript

-----

## 3\. 核心数据结构 (Types)

请在 `src/types/poster.ts` 中定义以下接口：

```typescript
export interface Photo {
  id: string;
  url: string; // 照片地址
  caption: string; // 照片标题 (e.g. "雪山之巅")
  date: string; // 短日期 (e.g. "12.23")
  lat: number;
  lng: number;
  timestamp: number; // 用于排序
}

export interface PosterConfig {
  title: string; // e.g. "ZERMATT"
  subtitle: string; // e.g. "DEC 2024"
  locationName: string;
  weatherInfo: string;
  altitudeInfo: string;
}
```

-----

## 4\. 组件架构设计 (The Sandwich Layout)

海报容器需固定为 **600px x 900px** (2:3 比例)，采用绝对定位层叠：

1.  **Layer 0 (底层 - 背景)**:
      - 组件名: `PosterBackground`
      - 内容: 一张全屏的风景图或地图底图（MVP 阶段使用 `img` 标签加载一张占位图）。
2.  **Layer 1 (中间层 - 轨迹)**:
      - 组件名: `RouteOverlay`
      - 内容: 一个透明背景的 Canvas 或 SVG。
      - 逻辑: 接收一组坐标点，调用 Mapbox Map Matching API 获取平滑路径，并绘制一条红色粗线 (\#ff0000, round caps)。
3.  **Layer 2 (上层 - 照片)**:
      - 组件名: `PolaroidScatter`
      - 内容: 渲染 3 张 `Polaroid` 组件。
      - 布局: 使用绝对定位 (`top`, `left`, `rotate`) 将照片错落放置。
4.  **UI Overlay (顶层 - 文字)**:
      - 组件名: `PosterHeader` & `PosterFooter`
      - 内容: 顶部的半透明 Banner（标题）和底部的状态栏（天气/海拔）。

-----

## 5\. 详细实施步骤 (Step-by-Step Instructions)

请按照以下顺序生成代码：

### 任务 1: 创建工具函数 (Map Matching)

创建 `src/lib/mapbox.ts`。
实现函数 `getSmartRoute(coordinates: [number, number][])`。

  - **逻辑**: 将坐标点拼接，调用 Mapbox Map Matching API (`walking` profile)。
  - **注意**: 免费版 API 单次限制 100 个点，如果输入点过多，请先实现一个简单的抽稀算法 (Downsampling)。
  - **返回**: GeoJSON Geometry (LineString)。

### 任务 2: 开发 Polaroid 组件

创建 `src/components/poster/Polaroid.tsx`。

  - **Props**: `photoUrl`, `caption`, `date`, `rotation`, `className`.
  - **样式**:
      - 白色卡片背景 (`bg-white`), 阴影 (`shadow-xl`).
      - 图片容器: 宽高比 3:4，使用 `overflow-hidden`。
      - 图片: 使用 `object-cover` 实现自动裁剪填满。
      - 旋转: 使用 `transform: rotate(${rotation}deg)`。
      - 字体: 手写体风格 (可暂用 serif 代替)。

### 任务 3: 组装海报页面

创建 `src/app/poster-preview/page.tsx`。

  - 定义模拟数据 (Mock Data): 3 张照片的 URL 和坐标，以及基本的标题信息。
  - 布局: 使用 Tailwind 构建 600x900 的相对定位容器 (`relative`).
  - 渲染顺序: 背景图 -\> 轨迹层 -\> 照片层 -\> 文字层。
  - **轨迹层实现**: 暂时使用一个透明的 Mapbox 实例 (`react-map-gl` 或原生 `mapbox-gl`)，只加载 `LineString` Source 和 `Line` Layer，地图样式设为透明或仅显示地形。

### 任务 4: 实现导出功能

在页面底部添加一个“下载海报”按钮。

  - 点击时导入 `html2canvas`。
  - 选择海报容器 DOM 元素。
  - 生成 Canvas 并转为 dataURL。
  - 触发 `<a download="poster.jpg">` 下载。
  - **关键点**: 设置 `useCORS: true` 以防止跨域图片导致画布空白。

-----

## 6\. 给 AI 的注意事项 (Constraints)

1.  **真实性**: 照片裁剪必须使用 CSS `object-cover`，不要试图修改原始图片文件。
2.  **样式**: 使用 Tailwind CSS 的 `absolute` 定位来精确控制元素位置。
3.  **Mapbox**: 确保组件正确读取 `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`。
4.  **类型安全**: 所有组件必须是 TypeScript 强类型的。

-----
