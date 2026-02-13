export type AspectRatio = '9:16' | '16:9' | '1:1';
export type Resolution = '720p' | '1080p' | '2k';

export interface CameraState {
    center: [number, number]; // [lng, lat]
    zoom: number;
    pitch: number;
    bearing: number;
}

export interface StoryNode {
    id: string;
    photoId: string; // 关联的原始照片 ID
    imgUrl: string;

    // 地理位置 (用于生成镜头)
    lat: number;
    lng: number;

    // 时间控制
    startTime: number; // 在整个视频中的开始时间 (秒)
    duration: number;  // 该片段持续时长 (秒)

    // 内容
    caption?: string;  // 字幕文案

    // 镜头关键帧 (可选，如果为空则使用默认策略)
    startCamera?: CameraState;
    endCamera?: CameraState;

    // 导演高级控制 (Phase 1 New)
    easing?: 'linear' | 'easeInOutCubic' | 'slowOut'; // 运镜曲线
    pitchOverride?: number; // 强制大仰角

    // 路径控制 (Phase 3 New)
    pathType?: 'linear' | 'curved';
    controlPoint?: [number, number]; // [lng, lat] for Bezier curve
    peakZoomDelta?: number;  // 垂直弧线：缩放峰值增量
    orbitSpeed?: number;     // 到达后旋转速度 (度/秒)
}

export interface MusicTrack {
    id: string;
    name: string;
    url: string; // MP3 URL
    duration: number;
}

export interface StoryConfig {
    templateId: string;
    aspectRatio: AspectRatio;
    resolution: Resolution;
    music?: {
        trackId: string;
        volume: number; // 0-1
        loop: boolean;
    };
}

export interface Story {
    id: string;
    nodes: StoryNode[];
    totalDuration: number;
    config: StoryConfig;
}

// 前端使用的模板定义 (对应数据库的 StoryTemplate.config)
export interface StoryTemplateConfig {
    id: string;
    name: string;
    description: string;
    coverImage: string; // 预览图

    // 默认策略
    defaultDurationPerPhoto: number; // 每张照片默认时长
    transitions: 'fly' | 'fade' | 'cut';

    // 推荐配置
    recommendedMusicId?: string;
    cameraStrategy: 'cinematic' | 'dynamic' | 'static';
}
