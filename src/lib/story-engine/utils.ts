export const Easings = {
    linear: (t: number) => t,
    // 慢-快-慢，适合大范围转移，电影感极强
    easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    // 缓慢减速，适合结束镜头
    slowOut: (t: number) => 1 - Math.pow(1 - t, 3),
};

export type EasingType = keyof typeof Easings;

// 通用线性插值
export function lerp(start: number, end: number, t: number): number {
    return start * (1 - t) + end * t;
}

// 角度插值 (处理 350° -> 10° 的跨越问题，确保走最短路径)
export function lerpAngle(start: number, end: number, t: number): number {
    let d = end - start;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return start + d * t;
}

// 经纬度插值
export function lerpLngLat(start: [number, number], end: [number, number], t: number): [number, number] {
    return [
        lerp(start[0], end[0], t),
        lerp(start[1], end[1], t)
    ];
}
// 二阶贝塞尔曲线插值 (Quadratic Bezier)
export function getBezierCurve(
    p0: [number, number], // Start [lng, lat]
    p1: [number, number], // Control [lng, lat]
    p2: [number, number], // End [lng, lat]
    t: number
): [number, number] {
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    return [x, y];
}

// 计算控制点：在 P0 和 P2 之间，向侧面偏移一定距离
export function calculateControlPoint(
    p0: [number, number],
    p2: [number, number],
    offsetRatio: number = 0.2 // 偏移比例，正数向左，负数向右（相对方向）
): [number, number] {
    const dx = p2[0] - p0[0];
    const dy = p2[1] - p0[1];
    const cx = (p0[0] + p2[0]) / 2;
    const cy = (p0[1] + p2[1]) / 2;

    // 垂直向量 (-dy, dx)
    const perpX = -dy;
    const perpY = dx;

    return [
        cx + perpX * offsetRatio,
        cy + perpY * offsetRatio
    ];
}

// ============================================================
// Phase 3: 电影级 3D 弧线运镜支持
// ============================================================

/**
 * 计算基于两点距离的缩放峰值增量
 * 距离越远，相机"跳"得越高（缩放越小）
 */
export function calculatePeakZoomDelta(
    start: [number, number],
    end: [number, number]
): number {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 经验公式：距离 0.1 度 ≈ 11km
    // 短距离 (<0.05°): 小跳跃, delta = 1-2
    // 中距离 (0.05°-0.5°): 中等跳跃, delta = 2-4
    // 长距离 (>0.5°): 大跳跃, delta = 4-6
    const delta = Math.min(10, Math.max(1, distance * 8));
    return delta;
}

/**
 * 重映射弧线进度 - 压缩缓动曲线的"慢动作"区间
 * 将 [0, 1] 的进度映射到 [margin, 1-margin]，让弧线效果更均匀分布
 * 
 * 原理：正弦曲线在 t=0 和 t=1 附近变化很慢，看起来像平移。
 * 通过将 t 从 [0,1] 映射到 [0.15, 0.85]，跳过"平坦"的头尾部分。
 */
export function remapArcProgress(t: number, margin: number = 0.15): number {
    // 将 t 从 [0, 1] 映射到 [margin, 1-margin]
    const range = 1 - 2 * margin;
    return margin + t * range;
}

/**
 * 3D 弧线缩放插值 - 中间最小（最远），两端正常
 * 使用正弦曲线创建平滑的"跳起-降落"效果
 * 
 * [优化] 使用 remapArcProgress 压缩慢动作区间，消除头尾的"平移"感
 */
export function getArcZoom(
    startZoom: number,
    endZoom: number,
    peakDelta: number,
    t: number
): number {
    // 基础线性插值（使用原始 t）
    const baseZoom = lerp(startZoom, endZoom, t);

    // 使用重映射的 t 计算弧线偏移，让弧线效果在整个过程中更均匀
    const remappedT = remapArcProgress(t, 0.15);
    const arcOffset = Math.sin(remappedT * Math.PI) * peakDelta;

    // 返回降低后的缩放（更远）
    return baseZoom - arcOffset;
}

/**
 * 自适应俯仰角 - Google Maps 风格两阶段抛物线
 * Phase 1 (0 -> 0.5): Pitch 减小，相机拉升至鸟瞰视角
 * Phase 2 (0.5 -> 1): Pitch 增大，相机俯冲切入目标
 * 
 * 使用正弦曲线驱动，确保峰值在 t=0.5 时发生
 * [优化] 使用 remapArcProgress 压缩慢动作区间
 */
export function getAdaptivePitch(
    startPitch: number,
    endPitch: number,
    t: number
): number {
    // 巡航（峰值）时的俯仰角：接近垂直俯视
    const cruisePitch = 0; // 0 度 = 完全垂直俯视

    // 使用重映射的 t 计算正弦因子，让俯仰变化更均匀
    const remappedT = remapArcProgress(t, 0.15);
    const sineFactor = Math.sin(remappedT * Math.PI);

    // 计算基准俯仰角（起止点的线性插值，使用原始 t）
    const basePitch = lerp(startPitch, endPitch, t);

    // 用正弦曲线将俯仰角压向0度（垂直俯视）
    // sineFactor=1 时完全到达 cruisePitch
    return lerp(basePitch, cruisePitch, sineFactor);
}

// ============================================================
// Phase 4: 照片故事合成支持 (Photo Story Compositing)
// ============================================================

/**
 * 计算照片在"定格"期间的透明度 (Trapezoidal Opacity)
 * 逻辑：前 10% 淡入，中间 80% 保持，后 10% 淡出
 * 用于实现照片平滑出现和消失的效果
 * @param t 当前定格阶段进度 (0 ~ 1)
 * @param fadeInRatio 淡入时间占比 (默认 0.1)
 * @param fadeOutRatio 淡出时间占比 (默认 0.1)
 */
export function getPhotoOpacity(
    t: number,
    fadeInRatio: number = 0.1,
    fadeOutRatio: number = 0.1
): number {
    if (t < 0 || t > 1) return 0;

    if (t < fadeInRatio) {
        // Fade In: 0 -> 1
        return Easings.linear(t / fadeInRatio);
    } else if (t > (1 - fadeOutRatio)) {
        // Fade Out: 1 -> 0
        return Easings.linear((1 - t) / fadeOutRatio);
    } else {
        // Hold: 1
        return 1;
    }
}

/**
 * 计算"定格"期间的缓慢漂移视角 (Cinematic Drift)
 * 让地图在照片展示时不完全静止，而是缓慢旋转，增加电影感呼吸感
 * @param startBearing 进入定格时的初始朝向
 * @param t 当前定格阶段进度 (0 ~ 1)
 * @param totalDriftAngle 总漂移角度 (推荐 3~8度)
 */
export function getDriftBearing(
    startBearing: number,
    t: number,
    totalDriftAngle: number = 5
): number {
    // 使用线性漂移，保持匀速转动
    return startBearing + t * totalDriftAngle;
}
