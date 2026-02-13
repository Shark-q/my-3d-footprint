# Google Photorealistic 3D Tiles 集成方案

## 概述

在现有 Mapbox 底图基础上，增加 **Google Maps Platform Photorealistic 3D Tiles** 作为第二底图源，使用 **deck.gl** 或 **CesiumJS** 加载，为用户提供更逼真的 3D 地图体验。

---

## 现状分析

### 当前架构

```
MapboxView.tsx  →  story-engine  →  Mapbox GL JS
```

- 底图：Mapbox GL JS
- 相机参数：`zoom`, `pitch`, `bearing`, `center`
- 功能：Explore Mode / Story Mode / Creator Mode

---

## 方案设计

### 目标架构

```
MapProvider.tsx (地图源切换)
  ├── MapboxView.tsx  →  Mapbox GL JS
  └── Google3DView.tsx  →  deck.gl + Google 3D Tiles
        ↓
  story-engine ←→ CameraAdapter (统一接口)
```

### 技术选型

| 选项 | 推荐度 | 理由 |
|------|--------|------|
| **deck.gl** | ⭐⭐⭐⭐ | 可与 Mapbox 共用 WebGL context，包体积适中 |
| CesiumJS | ⭐⭐⭐ | 功能全但体积大（~1.5MB），适合独立 3D 页面 |

---

## 实施计划

### Phase 1: Explore Mode 集成（2-3天）

- [ ] 安装 `@deck.gl/core` 和 `@deck.gl/geo-layers`
- [ ] 创建 `Google3DView.tsx` 组件
- [ ] 添加底图切换按钮（Mapbox / Google 3D）
- [ ] 仅在 Explore Mode 启用，不影响 Story Engine

### Phase 2: Camera Adapter 抽象层（1-2天）

- [ ] 定义统一相机接口 `ICameraController`
- [ ] 实现 `MapboxCameraAdapter`
- [ ] 实现 `DeckGLCameraAdapter`

```typescript
interface ICameraController {
  flyTo(target: CameraTarget, options?: FlyOptions): void;
  getState(): CameraState;
  setOnMoveEnd(callback: () => void): void;
}
```

### Phase 3: Creator Mode 支持（3-5天）

- [ ] 接入 story-engine 的 director.ts
- [ ] 适配 `getFrameState()` 输出到 deck.gl 相机
- [ ] 测试视频导出（WebGL context 录制）

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **包体积增大** | 首屏加载变慢 | 使用动态导入 (code splitting) |
| **相机 API 差异** | 运镜效果不一致 | Camera Adapter 统一接口 |
| **3D Tiles 覆盖不全** | 偏远地区无 3D | 自动 fallback 到卫星图 |
| **API 成本** | 生产环境费用 | 设置配额警报，优先免费层用户用 Mapbox |

---

## Google 3D Tiles 限制

- ✅ 主要城市：高质量 3D 建筑
- ⚠️ 偏远地区：仅卫星图，无 3D
- ❌ 样式定制：无法修改颜色/隐藏图层
- ❌ 离线：必须实时流式加载

---

## 成本估算

| 项目 | 免费额度 | 超出后价格 |
|------|----------|-----------|
| Map Tiles API | $200/月等值 | ~$7/1000次加载 |
| 3D Tiles (Photorealistic) | 包含在上述额度 | 同上 |

> 建议：为免费用户默认使用 Mapbox，付费用户解锁 Google 3D

---

## 文件结构预览

```
src/
├── components/
│   ├── MapboxView.tsx      (现有)
│   ├── Google3DView.tsx    (新增)
│   └── MapProvider.tsx     (新增 - 切换逻辑)
├── lib/
│   ├── camera/
│   │   ├── types.ts        (ICameraController 接口)
│   │   ├── mapbox-adapter.ts
│   │   └── deckgl-adapter.ts
│   └── story-engine/       (现有，需适配)
```

---

## 决策点

1. **先做 Explore Mode 还是 Creator Mode？**  
   → 建议先 Explore Mode，验证技术可行性

2. **用 deck.gl 还是 CesiumJS？**  
   → 推荐 deck.gl（与 Mapbox 集成更好）

3. **是否需要后端代理 API Key？**  
   → 生产环境建议是，避免 Key 暴露
