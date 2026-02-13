import { useState, useCallback } from 'react';
import { Story } from '../lib/story-engine/types';
// import { getFrameState, FrameState } from '../lib/story-engine/director';

export interface StoryTimelineResult {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    frameState: any | null; // FrameState is deleted

    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
}

/**
 * TODO: Creator Mode 待重建
 * 已禁用原有的导演引擎逻辑
 */
export function useStoryTimeline(story: Story | null): StoryTimelineResult {
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const play = useCallback(() => setIsPlaying(true), []);
    const pause = useCallback(() => setIsPlaying(false), []);
    const seek = useCallback((time: number) => {
        const t = Math.max(0, Math.min(time, story?.totalDuration || 0));
        setCurrentTime(t);
    }, [story]);

    return {
        currentTime,
        duration: story?.totalDuration || 0,
        isPlaying,
        frameState: null, // 禁用帧计算
        play,
        pause,
        seek
    };
}
