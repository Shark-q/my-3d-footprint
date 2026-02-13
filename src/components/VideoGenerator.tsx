"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Story } from '@/lib/story-engine/types';
// import { getFrameState } from '@/lib/story-engine/director';

interface VideoGeneratorProps {
    story: Story;
    width?: number;
    height?: number;
    isPro?: boolean;
    onProgress: (percent: number, status: string) => void;
    onComplete: (videoUrl: string) => void;
    onError: (error: Error) => void;
}

/**
 * TODO: Creator Mode 待重建
 * 已禁用原有的视频生成引擎
 */
export default function VideoGenerator({
    story,
    onProgress,
    onComplete,
    onError
}: VideoGeneratorProps) {
    useEffect(() => {
        onProgress(0, "引擎维护中...");
        // 暂时不支持生成
    }, []);

    return (
        <div className="fixed top-0 left-0 w-full h-full bg-black/90 z-[9999] flex flex-col items-center justify-center p-4">
            <div className="text-white text-xl mb-4 font-bold">
                Creator Mode 重塑中...
            </div>
            <button
                onClick={() => onComplete("")}
                className="px-6 py-3 bg-white/10 text-white rounded-xl"
            >
                返回
            </button>
        </div>
    );
}
