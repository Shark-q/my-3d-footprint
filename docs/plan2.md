# **技术实施方案：3D 导演引擎渐进式升级 (Director Engine Progressive Upgrade)**

项目: My 3D Footprint
版本: 2.0 (Cinematic Update - Refined)
日期: 2024-12-18
目标: 在保留现有架构的基础上，将 Story Mode 升级为支持电影级运镜的导演引擎。

## **1. 核心策略 (Strategy)**

采用 **渐进式升级 (Progressive Upgrade)** 策略，而非重写。
现有架构 (`StoryMode.tsx` -> `useStoryTimeline` -> `director.ts`) 已经很完善，我们只需增强核心算法和数据结构，即可实现目标效果。

**原有方案 (Rewrite) vs 新方案 (Upgrade):**
- ❌ **Rewrite**: 新建 `DirectorView`，维护两套逻辑，成本高，风险大。
- ✅ **Upgrade**: 增强 `director.ts`，所有现有模板自动受益，零回归风险。

---

## **2. 实施阶段 (Implementation Phases)**

### **Phase 1: 核心引擎升级 (MVP Priority)**

目标：实现流畅的曲线运镜和任意角度旋转（解决 "机械感" 移动问题）。

#### **2.1 数学工具库 (`src/lib/story-engine/utils.ts`)**
将数学逻辑抽离，引入缓动函数：
- `lerpAngle`: 解决 350° -> 10° 旋转一圈的问题，确保走最短路径。
- `Easings`: 引入 `easeInOutCubic` (电影感起止) 和 `slowOut` (最后减速)。

#### **2.2 类型定义扩展 (`src/lib/story-engine/types.ts`)**
在 `StoryNode` 中增加导演控制字段：
```typescript
export interface StoryNode {
    // ... existing fields
    easing?: 'linear' | 'easeInOutCubic' | 'slowOut'; // 运镜曲线
    pitchOverride?: number; // 强制大仰角 (如 80度)
}
```

#### **2.3 导演逻辑增强 (`src/lib/story-engine/director.ts`)**
升级 `getFrameState` 函数：
1.  **应用缓动**: 使用 `utils.ts` 中的函数计算 `progress`。
2.  **智能旋转**: 使用 `lerpAngle` 替代线性插值。
3.  **仰角突破**: 允许 `pitch` 超过 Mapbox 默认限制 (60° -> 85°)。

---

### **Phase 2: 视觉质感增强 (Visual Enhancement)**

目标：还原 "策马特史诗" 的视觉冲击力。

#### **3.1 地形与大气 (`src/components/MapboxView.tsx`)**
- **地形夸张**: 设置 `exaggeration: 1.5` 或 `1.8`，让山脉更巍峨。
- **大气雾效**: 配置 `map.setFog`，使用深蓝+金色晨光配色 (`#242B4B`, `#FDB813`)。

#### **3.2 新增模板 "Epic" (`src/lib/story-engine/generator.ts`)**
创建一个新的生成策略 `template_epic`：
- **运镜**: 默认使用大仰角 (75°) + 慢速旋转。
- **节奏**: `easing: 'easeInOutCubic'`。
- **时长**: 单镜头时长延长至 8-10秒。

---

### **Phase 3: 高级导演系统 (Future)**

- **DirectorScript**: 定义独立的分镜脚本格式（如原 plan2 所述）。
- **可视化编辑器**: 允许用户拖拽关键帧。

---

## **3. 架构对比 (Architecture View)**

### **Current**
`Photos` -> `Generator` -> `StoryNode[]` -> `Timeline (Linear Lerp)` -> `Map.flyTo`

### **New (Phase 1+2)**
`Photos` -> `Generator (with Epic Template)` -> `StoryNode[+Easing, +Pitch]` -> `Timeline (Curved Easing)` -> `Map.jumpTo (Frame Sync)`

**关键变更点**:
1.  **Interpolation**: Linear -> Easing Curves
2.  **Camera Control**: `flyTo` (Event driven) -> `jumpTo` (Frame driven / Hybrid)
    *   *注: MVP 阶段建议先优化 `flyTo` 参数或混合使用，全量 `jumpTo` 需做性能测试。*

## **4. 风险控制**

1.  **性能**: `map.jumpTo` 在高频调用下可能导致瓦片闪烁。
    *   *缓解*: 锁定帧率或仅在 "导出模式" 下使用高频更新，预览模式保持 `flyTo`。
2.  **兼容性**: 确保老数据 (`StoryNode` without easing) 默认回退到 `linear`。
