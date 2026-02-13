"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { Photo } from '@/types';
import * as turf from '@turf/turf';

interface FootprintReportProps {
    isOpen: boolean;
    onClose: () => void;
    photos: Photo[];
    visitedAreasCount: number;
    getMapSnapshot: () => string;
}

type Theme = 'theme-cyber' | 'theme-paper' | 'theme-retro';

export default function FootprintReport({ isOpen, onClose, photos, visitedAreasCount, getMapSnapshot }: FootprintReportProps) {
    const [mapSrc, setMapSrc] = useState<string>("");
    const [currentTheme, setCurrentTheme] = useState<Theme>('theme-cyber');
    const [isSaving, setIsSaving] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    // Update snapshot when opening
    useEffect(() => {
        if (isOpen) {
            // Small delay to ensure map render is complete if we just moved it
            setTimeout(() => {
                setMapSrc(getMapSnapshot());
            }, 500);
        }
    }, [isOpen, getMapSnapshot]);

    // Calculate Stats
    const stats = useMemo(() => {
        if (photos.length === 0) return { days: 0, distance: 0, furthest: 0 };

        // Sort by date just in case
        const sorted = [...photos].sort((a, b) => {
            const tA = new Date(a.dateTime || 0).getTime();
            const tB = new Date(b.dateTime || 0).getTime();
            return tA - tB;
        });

        // Time Span
        const first = new Date(sorted[0].dateTime || Date.now());
        const last = new Date(sorted[sorted.length - 1].dateTime || Date.now());
        const days = Math.ceil((last.getTime() - first.getTime()) / (1000 * 3600 * 24)) + 1;

        // Total Distance (Cumulative)
        let totalDist = 0;
        if (sorted.length > 1) {
            const line = turf.lineString(sorted.map(p => [p.lng, p.lat]));
            totalDist = turf.length(line, { units: 'kilometers' });
        }

        // Furthest from start
        let maxDist = 0;
        const startPt = turf.point([sorted[0].lng, sorted[0].lat]);
        sorted.forEach(p => {
            const pt = turf.point([p.lng, p.lat]);
            const d = turf.distance(startPt, pt, { units: 'kilometers' });
            if (d > maxDist) maxDist = d;
        });

        return {
            days,
            distance: Math.round(totalDist),
            furthest: Math.round(maxDist)
        };
    }, [photos]);

    const handleDownload = async () => {
        if (!reportRef.current) return;
        setIsSaving(true);
        try {
            const canvas = await html2canvas(reportRef.current, {
                useCORS: true,
                scale: 2, // Retina quality
                backgroundColor: null,
                logging: true, // Enable logging for debugging
                allowTaint: true,
            });
            const link = document.createElement('a');
            link.download = `Footprint_Report_${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e: any) {
            console.error("Export failed", e);
            alert(`Report generation failed: ${e.message || JSON.stringify(e)}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    // Theme Styles - Using Inline Styles to guarantee RGB compatibility for html2canvas
    // Tailwind v4 uses oklab/oklch by default which html2canvas doesn't support.

    const themeConfig = {
        'theme-cyber': {
            container: { backgroundColor: '#050505', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.1)' },
            accent: { color: '#00f2fe' },
            mapBorder: { borderColor: 'rgba(0, 242, 254, 0.5)' }
        },
        'theme-paper': {
            container: { backgroundColor: '#ffffff', color: '#111827', borderColor: '#e5e7eb' },
            accent: { color: '#2563eb' },
            mapBorder: { borderColor: 'currentColor' }
        },
        'theme-retro': {
            container: { backgroundColor: '#f4e4bc', color: '#5c4033', borderColor: 'rgba(139, 94, 60, 0.2)' },
            accent: { color: '#8b5e3c' },
            mapBorder: { borderColor: 'currentColor' }
        }
    };

    const currentStyle = themeConfig[currentTheme];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">

            {/* Main Report Card */}
            <div
                ref={reportRef}
                id="report-card"
                className="relative w-[375px] min-h-[667px] flex flex-col gap-4 p-6 shadow-2xl transition-all duration-300 border"
                style={currentStyle.container}
            >
                {/* Header */}
                <div className="text-center space-y-2 mt-4">
                    <h1 className="text-2xl font-black tracking-[0.2em] uppercase" style={currentStyle.accent}>
                        My Footprints
                    </h1>
                    <p className="text-[10px] opacity-60 tracking-widest">
                        {new Date().toLocaleDateString()} | EXPLORER LOG
                    </p>
                </div>

                {/* Map Snapshot */}
                <div
                    className="relative w-full h-[280px] overflow-hidden border-2 shadow-lg rounded-sm group"
                    style={currentStyle.mapBorder}
                >
                    {mapSrc ? (
                        <img src={mapSrc} alt="Map" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#111827', color: '#6b7280' }}>
                            Loading Map...
                        </div>
                    )}
                    {/* Decorative Corners */}
                    <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-current opacity-50"></div>
                    <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-current opacity-50"></div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-y-6 py-6 border-y border-dashed mt-2" style={{ borderColor: 'rgba(128, 128, 128, 0.2)' }}>
                    <div className="text-center">
                        <span className="block text-3xl font-bold">{photos.length}</span>
                        <span className="text-[10px] tracking-widest uppercase mt-1" style={currentStyle.accent}>Moments</span>
                    </div>
                    <div className="text-center">
                        <span className="block text-3xl font-bold">{visitedAreasCount}</span>
                        <span className="text-[10px] tracking-widest uppercase mt-1" style={currentStyle.accent}>Areas Lit</span>
                    </div>
                    <div className="text-center">
                        <span className="block text-3xl font-bold">{stats.days}</span>
                        <span className="text-[10px] tracking-widest uppercase mt-1" style={currentStyle.accent}>Days Spanned</span>
                    </div>
                    <div className="text-center">
                        <span className="block text-3xl font-bold">{stats.distance} <span className="text-sm font-normal">km</span></span>
                        <span className="text-[10px] tracking-widest uppercase mt-1" style={currentStyle.accent}>Traveled</span>
                    </div>
                </div>

                {/* Photo Mosaic (Mini Grid) */}
                <div className="flex-1 overflow-hidden">
                    <div className="grid grid-cols-4 gap-1" style={{ opacity: 0.8 }}>
                        {photos.slice(0, 8).map(p => (
                            <img key={p.id} src={p.img} className="w-full h-12 object-cover rounded-sm" style={{ filter: 'grayscale(0.3)' }} />
                        ))}
                    </div>
                    {photos.length > 8 && (
                        <div className="text-[9px] text-center mt-2 opacity-50 tracking-widest">
                            + {photos.length - 8} MORE MEMORIES
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-auto text-center text-[9px] opacity-50 tracking-[4px] uppercase pb-4">
                    Generated by 3D Footprint AI
                </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-10 flex flex-col items-center gap-6 w-full animate-in slide-in-from-bottom-4 duration-500">
                {/* Theme Switcher */}
                <div className="flex gap-4 bg-black/40 backdrop-blur-xl p-2 rounded-full border border-white/10">
                    <button
                        onClick={() => setCurrentTheme('theme-cyber')}
                        className={`w-8 h-8 rounded-full bg-[#050505] border-2 border-[#00f2fe] hover:scale-110 transition-transform ${currentTheme === 'theme-cyber' ? 'ring-2 ring-white/50' : ''}`}
                        title="Cyber"
                    />
                    <button
                        onClick={() => setCurrentTheme('theme-paper')}
                        className={`w-8 h-8 rounded-full bg-white border-2 border-gray-300 hover:scale-110 transition-transform ${currentTheme === 'theme-paper' ? 'ring-2 ring-white/50' : ''}`}
                        title="Paper"
                    />
                    <button
                        onClick={() => setCurrentTheme('theme-retro')}
                        className={`w-8 h-8 rounded-full bg-[#f4e4bc] border-2 border-[#8b5e3c] hover:scale-110 transition-transform ${currentTheme === 'theme-retro' ? 'ring-2 ring-white/50' : ''}`}
                        title="Retro"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-full bg-white/10 text-white text-sm font-medium hover:bg-white/20 backdrop-blur transition-colors"
                    >
                        关闭预览
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={isSaving}
                        className="px-8 py-2.5 rounded-full bg-[#00f2fe] text-black text-sm font-bold hover:bg-white hover:shadow-[0_0_20px_rgba(0,242,254,0.6)] transition-all disabled:opacity-50"
                    >
                        {isSaving ? "生成中..." : "📥 保存长图"}
                    </button>
                </div>
            </div>
        </div>
    );
}
