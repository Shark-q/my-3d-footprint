// src/components/MapPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// 环境变量配置 (禁止硬编码 Token)
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) throw new Error("Missing NEXT_PUBLIC_MAPBOX_TOKEN");

interface Photo {
  id: string;
  name: string;
  img: string;
  lat: number;
  lng: number;
  dateTime: string;
  weather?: any;
  locationName?: string;
}

export default function MapPlayer() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  // 1. 获取后端数据 (联动数据库！)
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/my-footprint");
        if (!res.ok) throw new Error("获取数据失败");
        const data = await res.json();
        setPhotos(data.photos || []);

        // 如果有数据，地图飞向第一张照片
        if (data.photos && data.photos.length > 0 && map.current) {
          const p = data.photos[0];
          map.current.flyTo({ center: [p.lng, p.lat], zoom: 4 });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 2. 初始化地图
  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN!;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      projection: { name: "globe" } as any,
      center: [105, 35],
      zoom: 1.5,
      pitch: 0,
    });

    const m = map.current;
    m.on("style.load", () => {
      m.setFog({
        color: "rgb(11, 11, 25)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      });
    });
  }, []);

  // 3. 渲染 Marker 和 Popup
  useEffect(() => {
    if (!map.current || photos.length === 0) return;

    // 清除旧的 marker (防止 React StrictMode 下重复渲染)
    const markers = document.getElementsByClassName('custom-marker');
    while (markers.length > 0) {
      markers[0].parentNode?.removeChild(markers[0]);
    }

    photos.forEach((photo) => {
      const el = document.createElement("div");
      el.className = "custom-marker group";
      // 样式在 globals.css 里定义，或者直接内联
      el.style.backgroundImage = `url(${photo.img})`;
      el.style.width = "48px";
      el.style.height = "48px";
      el.style.borderRadius = "50%";
      el.style.border = "3px solid white";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.cursor = "pointer";
      el.style.boxShadow = "0 10px 25px rgba(0,0,0,0.6)";
      el.style.transition = "transform 0.3s ease";

      // 点击事件
      el.addEventListener('click', () => {
        setSelectedPhotoId(photo.id);
        map.current?.flyTo({
          center: [photo.lng, photo.lat],
          zoom: 14,
          pitch: 45,
          speed: 1.2
        });
      });

      // 简单的 Popup
      const popupHTML = `
        <div class="text-black p-1 max-w-[200px]">
          <strong class="block mb-1 text-sm">${photo.name}</strong>
          <p class="text-xs text-gray-500">${photo.locationName || "未知地点"}</p>
        </div>
      `;
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupHTML);

      new mapboxgl.Marker({ element: el })
        .setLngLat([photo.lng, photo.lat])
        .setPopup(popup)
        .addTo(map.current!);
    });
  }, [photos]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 1. 全屏地图容器 */}
      <div ref={mapContainer} className="w-full h-full absolute inset-0 z-0" />

      {/* 2. 左侧悬浮面板 (还原你的 Sidebar) */}
      <div className="absolute top-6 left-6 w-[360px] h-[calc(100vh-48px)] z-10 flex flex-col pointer-events-none">

        {/* 玻璃拟态卡片 */}
        <div className="flex-1 flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden pointer-events-auto">

          {/* 顶部标题区 */}
          <div className="p-6 pb-4 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tight mb-2">
              My Footprints
            </h2>
            <div className="flex gap-2 text-xs text-gray-400">
              <span className="bg-white/10 px-2 py-1 rounded-md">📸 {photos.length} 张照片</span>
              <span className="bg-white/10 px-2 py-1 rounded-md">🚀 {loading ? "同步中..." : "已同步数据库"}</span>
            </div>
          </div>

          {/* 照片列表区 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            {loading ? (
              <div className="text-center text-gray-500 mt-10">正在从云端下载足迹...</div>
            ) : photos.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">还没有照片，快去上传吧！</div>
            ) : (
              photos.map(p => (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPhotoId(p.id);
                    map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14, pitch: 45 });
                  }}
                  className={`flex items-center p-3 rounded-xl cursor-pointer transition-all border border-transparent 
                     ${selectedPhotoId === p.id ? 'bg-white/20 border-white/30' : 'bg-white/5 hover:bg-white/10'}`}
                >
                  <img src={p.img} className="w-12 h-12 rounded-lg object-cover mr-3 bg-gray-800" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500 truncate">{p.locationName || "未知地点"}</div>
                  </div>
                  {p.weather && (
                    <div className="text-xs text-gray-400 flex flex-col items-end">
                      <span>{p.weather.temp}°C</span>
                      <span>{p.weather.conditions}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 底部渐变遮罩 */}
          <div className="h-6 bg-gradient-to-t from-black/40 to-transparent pointer-events-none absolute bottom-0 w-full"></div>
        </div>
      </div>

      {/* 3. 右下角功能按钮 (模仿原来的控制按钮) */}
      <div className="absolute bottom-10 right-10 flex gap-4 z-10">
        <a href="/" className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 font-bold transition-all hover:scale-105">
          ⬅️ 返回上传页
        </a>
      </div>
    </div>
  );
}