import React, { useEffect, useRef, useState } from 'react';
import { Photo } from '@/types';
// TODO: Creator Mode 待重建 - 已删除模板和导演引擎
// import { generateStoryFromPhotos } from '@/lib/story-engine/generator';
// import { useStoryTimeline } from '@/hooks/useStoryTimeline';
// import { Story } from '@/lib/story-engine/types';
// import VideoGenerator from './VideoGenerator';

interface StoryModeProps {
    photos: Photo[];
    onExit: () => void;
    onFlyTo: (lat: number, lng: number, pitch?: number, zoom?: number, immediate?: boolean) => void;
    onUpdatePhotoText: (id: string, text: string) => void;
}

type ViewMode = 'scroll' | 'video';

export default function StoryMode({ photos, onExit, onFlyTo, onUpdatePhotoText }: StoryModeProps) {
    const [localPhotos, setLocalPhotos] = useState<Photo[]>([]);

    useEffect(() => {
        const sorted = [...photos].sort((a, b) => {
            if (!a.dateTime) return 1;
            if (!b.dateTime) return -1;
            return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
        });
        setLocalPhotos(sorted);
    }, [photos]);

    // TODO: Creator Mode 待重建 - 当前只保留 Scroll View
    return (
        <LegacyScrollView
            photos={localPhotos}
            onExit={onExit}
            onFlyTo={onFlyTo}
            onUpdatePhotoText={onUpdatePhotoText}
        />
    );
}

// ----------------------------------------------------------------------------
// 1. Legacy Scroll View
// ----------------------------------------------------------------------------
function LegacyScrollView({ photos, onExit, onFlyTo, onUpdatePhotoText }: StoryModeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [loadingAI, setLoadingAI] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute('data-id');
                        if (id && id !== activeId) {
                            setActiveId(id);
                            const photo = photos.find(p => p.id === id);
                            if (photo) {
                                onFlyTo(photo.lat, photo.lng, 45, 16.5);
                            }
                        }
                    }
                });
            },
            { root: containerRef.current, threshold: 0.5, rootMargin: '-20% 0px -20% 0px' }
        );

        const chapters = document.querySelectorAll('.story-chapter');
        chapters.forEach(chapter => observer.observe(chapter));

        return () => observer.disconnect();
    }, [photos, onFlyTo, activeId]);

    const fetchWeather = async (photo: Photo) => {
        if (typeof photo.weather === 'string') return photo.weather;
        if (photo.weather?.conditions) return `${photo.weather.conditions} ${photo.weather.temp}°C`;
        return "天气未知";
    };

    const generateAIStory = async (photo: Photo) => {
        setLoadingAI(prev => ({ ...prev, [photo.id]: true }));
        try {
            const res = await fetch('/api/analyze-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: photo.img,
                    exif: { dateTime: photo.dateTime, lat: photo.lat, lon: photo.lng },
                    locationName: photo.locationName || "未知地点",
                    weather: typeof photo.weather === 'string' ? photo.weather : JSON.stringify(photo.weather || {})
                })
            });
            const data = await res.json();
            if (data.text) {
                onUpdatePhotoText(photo.id, data.text);
            }
        } catch (error) {
            console.error("AI Generation failed", error);
        } finally {
            setLoadingAI(prev => ({ ...prev, [photo.id]: false }));
        }
    };

    return (
        <>
            <div
                ref={containerRef}
                className="fixed top-0 right-0 w-full md:w-[480px] h-full overflow-y-auto z-20 pt-24 pb-48 px-6 no-scrollbar bg-gradient-to-l from-black/80 via-black/40 to-transparent backdrop-blur-sm"
            >
                {photos.map((photo, index) => (
                    <ChapterCard
                        key={photo.id}
                        index={index}
                        photo={photo}
                        isActive={activeId === photo.id}
                        loading={loadingAI[photo.id]}
                        onGenerateAI={() => generateAIStory(photo)}
                        onUpdateText={(text) => onUpdatePhotoText(photo.id, text)}
                        fetchWeather={() => fetchWeather(photo)}
                    />
                ))}
            </div>

            <button
                onClick={onExit}
                className="fixed top-8 right-12 z-30 group rounded-full bg-white/10 backdrop-blur-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-white shadow-2xl transition-all hover:bg-white hover:text-black hover:scale-105"
            >
                <span className="mr-2">✕</span> 退出旅程
            </button>
        </>
    );
}

interface ChapterCardProps {
    index: number;
    photo: Photo;
    isActive: boolean;
    loading?: boolean;
    onGenerateAI: () => void;
    onUpdateText: (text: string) => void;
    fetchWeather: () => Promise<string>;
}

function ChapterCard({ index, photo, isActive, loading, onGenerateAI, onUpdateText, fetchWeather }: ChapterCardProps) {
    const [weather, setWeather] = useState<string>("正在查询...");

    useEffect(() => {
        fetchWeather().then((w: string) => setWeather(w));
    }, []);

    const formatDateToChinese = (isoString?: string) => {
        if (!isoString || isoString === "未知时间") return "未知日期";
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return "未知日期";
            return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
        } catch (e) { return "未知日期"; }
    };

    return (
        <div
            data-id={photo.id}
            className={`story-chapter w-full max-w-[360px] mx-auto mb-[50vh] p-6 rounded-3xl bg-black/60 border border-white/10 transition-all duration-700 relative ${isActive ? 'opacity-100 scale-100 shadow-[0_0_30px_rgba(0,242,254,0.15)] border-cyan-400/40' : 'opacity-40 scale-95'}`}
            style={{ marginTop: index === 0 ? '10vh' : '0' }}
        >
            <div className="absolute top-4 right-6 text-6xl font-black text-white/5 pointer-events-none z-0">
                {index + 1}
            </div>
            <div className="relative z-10">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-md">{photo.name || `时刻 ${index + 1}`}</h3>
                <div className="w-full h-56 rounded-2xl overflow-hidden mb-5 shadow-lg bg-gray-800">
                    <img src={photo.img} alt={photo.name} className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-700" />
                </div>

                <div className="flex flex-wrap gap-2 mb-4 text-xs text-gray-300">
                    <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
                        <span>📅</span><span>{formatDateToChinese(photo.dateTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-sm">
                        <span>🌤️</span><span>{weather}</span>
                    </div>
                </div>

                <div className="chapter-text font-serif text-lg leading-relaxed text-gray-200 min-h-[80px] p-3 border-l-2 border-white/20 bg-black/20 rounded-r-lg focus:outline-none focus:bg-black/40 focus:border-cyan-400 transition-colors"
                    contentEditable
                    onBlur={(e) => onUpdateText(e.currentTarget.innerText)}
                    suppressContentEditableWarning
                >
                    {photo.userText || photo.aiText || "点击此处写下你的回忆..."}
                </div>

                <button
                    onClick={onGenerateAI}
                    disabled={loading}
                    className="mt-4 flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-bold py-2 px-4 rounded-full transition-all shadow-lg shadow-indigo-900/50 disabled:opacity-50"
                >
                    {loading && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                    <span>{loading ? "AI 正在思考..." : "✨ AI 润色回忆"}</span>
                </button>
            </div>
        </div>
    );
}


