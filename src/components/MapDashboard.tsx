// src/components/MapDashboard.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import html2canvas from "html2canvas";
import EXIF from "exif-js";
import { useUser, UserButton } from "@clerk/nextjs";

// 环境变量配置 (禁止硬编码 Token)
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) throw new Error("Missing NEXT_PUBLIC_MAPBOX_TOKEN");

export default function MapDashboard() {
  const { user } = useUser();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // 状态管理
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFogEnabled, setIsFogEnabled] = useState(false);
  const [fogLevel, setFogLevel] = useState("city");

  // 1. 初始化：从数据库拉取用户数据
  useEffect(() => {
    async function fetchUserData() {
      try {
        const res = await fetch("/api/my-footprint"); // 调用我们写好的后端接口
        if (res.ok) {
          const data = await res.json();
          setPhotos(data.photos || []);
          console.log("用户数据加载完成:", data.photos?.length);
        }
      } catch (e) {
        console.error("加载失败", e);
      } finally {
        setLoading(false);
      }
    }
    fetchUserData();
  }, []);

  // 2. 初始化地图 (复刻 mapbox.html 的配置)
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN!;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11", // 深色风格
      projection: { name: "globe" } as any,
      center: [105, 35],
      zoom: 1.5,
      pitch: 0,
    });

    const m = map.current;
    m.on("style.load", () => {
      // 迷雾效果
      m.setFog({
        color: "rgb(11, 11, 25)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });

      // 添加点亮图层 (Lit Layer) - 对应你 HTML 里的迷雾逻辑
      m.addSource('lit-border-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'lit-fill-layer', type: 'fill', source: 'lit-border-source',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#00f2fe', 'fill-opacity': 0.2 }
      });
      m.addLayer({
        id: 'lit-border-layer', type: 'line', source: 'lit-border-source',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#00f2fe', 'line-width': 3, 'line-blur': 2 }
      });
    });
  }, []);

  // 3. 渲染照片 Marker
  useEffect(() => {
    if (!map.current || photos.length === 0) return;

    photos.forEach((photo) => {
      const el = document.createElement("div");
      // 还原你的 CSS 类名逻辑
      el.className = `custom-marker ${isFogEnabled ? 'fog-mode' : ''}`;
      // 动态样式
      el.style.backgroundImage = isFogEnabled ? 'none' : `url(${photo.img})`;
      el.style.width = isFogEnabled ? '12px' : '48px';
      el.style.height = isFogEnabled ? '12px' : '48px';
      el.style.borderRadius = "50%";
      el.style.border = isFogEnabled ? '2px solid #fff' : '3px solid #fff';
      el.style.backgroundColor = isFogEnabled ? '#00f2fe' : 'transparent';
      el.style.boxShadow = isFogEnabled ? '0 0 10px #00f2fe' : '0 10px 25px rgba(0,0,0,0.6)';
      el.style.backgroundSize = "cover";
      el.style.cursor = "pointer";
      el.style.transition = "all 0.5s ease";

      // 点击飞向照片
      el.addEventListener("click", () => {
        map.current?.flyTo({ center: [photo.lng, photo.lat], zoom: 14, pitch: 45 });
      });

      // 简单的 Popup
      const popupHTML = `
        <div class="p-2 text-black max-w-[200px]">
          <h3 class="font-bold text-sm mb-1">${photo.name || "未命名"}</h3>
          <p class="text-xs text-gray-500">📍 ${photo.locationName || "未知地点"}</p>
        </div>
      `;

      new mapboxgl.Marker(el)
        .setLngLat([photo.lng, photo.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupHTML))
        .addTo(map.current!);
    });
  }, [photos, isFogEnabled]);

  // 4. 迷雾模式切换逻辑
  const toggleFogMode = () => {
    setIsFogEnabled(!isFogEnabled);
    if (!map.current) return;

    const visibility = !isFogEnabled ? 'visible' : 'none';
    ['lit-fill-layer', 'lit-border-layer'].forEach(layer => {
      if (map.current!.getLayer(layer)) {
        map.current!.setLayoutProperty(layer, 'visibility', visibility);
      }
    });

    if (!isFogEnabled) {
      map.current.easeTo({ pitch: 45, zoom: 4, duration: 1200 });
      // 这里可以加入 "unlockRegion" 的逻辑，遍历 photos 里的坐标去点亮地图
    } else {
      map.current.easeTo({ pitch: 0, duration: 1200 });
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* 全屏地图 */}
      <div ref={mapContainer} className="absolute inset-0 z-0" />

      {/* === 侧边栏 (Control Center) === */}
      <div id="sidebar" className="absolute top-6 left-6 w-[360px] h-[calc(100%-48px)] z-10 flex flex-col transition-transform duration-500">
        <div className="flex-1 flex flex-col bg-[#141419]/75 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden relative">

          {/* Header */}
          <div className="p-6 pb-4 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">

            {/* 用户信息栏 (登录后显示) */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tight">
                Control Center
              </h2>
              <div className="bg-white/10 p-1 rounded-full">
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4">当前用户: <span className="text-neon">{user?.fullName}</span></p>

            {/* 控制按钮组 */}
            <div className="control-panel grid grid-cols-2 gap-3">
              {/* 上传按钮 (可以链接回我们之前的上传逻辑，或者做一个模态框) */}
              <button onClick={() => alert("上传功能集成中...")} className="col-span-1 group relative overflow-hidden rounded-2xl bg-blue-600/90 p-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition-all">
                <div className="flex items-center justify-center gap-2">📸 上传照片</div>
              </button>

              <button className="col-span-1 group rounded-2xl bg-white/10 p-3 text-sm font-semibold text-gray-200 shadow-lg backdrop-blur-md border border-white/5 hover:bg-white/20">
                <div className="flex items-center justify-center gap-2">📍 修正定位</div>
              </button>

              <button
                onClick={toggleFogMode}
                className={`col-span-2 mt-2 rounded-2xl border border-white/10 p-4 text-sm font-bold shadow-lg transition-all active:scale-95 ${isFogEnabled ? 'bg-red-500/80 text-white' : 'bg-gradient-to-r from-gray-800 to-gray-900 text-[#00f2fe]'}`}
              >
                {isFogEnabled ? "❌ 退出探索模式" : "🗺️ 开启足迹探索"}
              </button>

              <button className="col-span-2 mt-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-3 text-sm font-bold text-white shadow-lg hover:brightness-110">
                📖 开启沉浸故事
              </button>
            </div>
          </div>

          {/* 照片列表 */}
          <div id="photo-list" className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {loading ? (
              <div className="flex justify-center mt-10 text-gray-500 animate-pulse">正在同步云端数据...</div>
            ) : photos.length === 0 ? (
              <div className="empty-tip flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
                <span>暂无上传记录</span>
              </div>
            ) : (
              photos.map(p => (
                <div key={p.id} onClick={() => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 })} className="flex items-center p-3 mb-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-all border border-transparent hover:border-white/20">
                  <img src={p.img} className="w-12 h-12 rounded-lg object-cover mr-3 bg-gray-800" />
                  <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-medium text-gray-200 truncate">{p.name || "未命名回忆"}</div>
                    <div className="text-xs text-gray-500">{p.locationName}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="h-6 bg-gradient-to-t from-black/40 to-transparent pointer-events-none absolute bottom-0 w-full"></div>
        </div>
      </div>
    </div>
  );
}