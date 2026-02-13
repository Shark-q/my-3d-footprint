"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import EXIF from 'exif-js';
import * as turf from '@turf/turf';
import { useUser, UserButton } from "@clerk/nextjs";
import StoryMode from './StoryMode';
import FootprintReport from './FootprintReport';
import FloatingButtons from './FloatingButtons';
import { useI18n } from '@/i18n/I18nProvider';

// Types
import { Photo } from '@/types';

const MapboxView = () => {
    const { t, locale } = useI18n();
    const { user } = useUser();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Data State
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(true);

    // Fog Mode State
    const [isFogEnabled, setIsFogEnabled] = useState(false);
    const [fogPrecision, setFogPrecision] = useState<'city' | 'province' | 'country'>('city');

    // Fix Location State
    const [isFixingLoc, setIsFixingLoc] = useState(false);
    const [selectedPhotoForFix, setSelectedPhotoForFix] = useState<Photo | null>(null);
    const [fixCoords, setFixCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [isPhotoSelectOpen, setIsPhotoSelectOpen] = useState(false); // 照片选择窗口

    // Upload State
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState("");
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Geolocation State
    const [isLocating, setIsLocating] = useState(false);
    const [locateError, setLocateError] = useState<string | null>(null);

    // Album View State
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [gridCols, setGridCols] = useState(3); // Zoom level: 2 = large, 5 = small
    const [dateRange, setDateRange] = useState<[number | null, number | null]>([null, null]); // Timestamp range

    // 环境变量配置 (禁止硬编码 Token)
    const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!MAPBOX_TOKEN) throw new Error("Missing NEXT_PUBLIC_MAPBOX_TOKEN");
    const PLACEHOLDER_IMG = "https://placehold.co/100x100/202b46/white?text=No+Img";

    const visitedAdcodes = useRef<Set<string>>(new Set());
    const visitedRegionUnion = useRef<any>(null);
    const visitedCenters = useRef<any>({ type: 'FeatureCollection', features: [] });

    // -------------------------------------------------------------------------
    // 1. Helper Functions
    // -------------------------------------------------------------------------

    // 智能逆地理编码：通过后端 API 处理，保护 API Key 安全
    const getLocationName = async (lat: number, lng: number): Promise<string> => {
        try {
            const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
            const data = await res.json();

            if (data.success && data.formattedAddress) {
                return data.formattedAddress;
            }

            return "未知地点";
        } catch (e) {
            console.error("地址解析失败:", e);
            return "未知地点";
        }
    };

    // -------------------------------------------------------------------------
    // 2. Map & Fog Core Logic
    // -------------------------------------------------------------------------

    // [New] Shared helper to update map sources
    const updateMapSources = (newFeatures: any[], regionName: string) => {
        if (!map.current) return;

        // Update Border Source
        const borderSource = map.current.getSource('lit-border-source') as mapboxgl.GeoJSONSource;
        if (borderSource) {
            if (!visitedRegionUnion.current) {
                visitedRegionUnion.current = { type: 'FeatureCollection', features: [] };
            }
            const existingNames = new Set(visitedRegionUnion.current.features.map((f: any) => f.properties?.name));
            const uniqueNewFeatures = newFeatures.filter((f: any) => !existingNames.has(f.properties?.name));

            if (uniqueNewFeatures.length > 0) {
                visitedRegionUnion.current.features.push(...uniqueNewFeatures);
                borderSource.setData(visitedRegionUnion.current);
            }
        }

        // Update Center Source
        if (newFeatures.length > 0) {
            let unionPoly = newFeatures[0];
            if (newFeatures.length > 1) {
                for (let i = 1; i < newFeatures.length; i++) {
                    try { unionPoly = turf.union(unionPoly, newFeatures[i]) || unionPoly; } catch (e) { }
                }
            }
            const centerPoint = turf.centerOfMass(unionPoly);
            centerPoint.properties = { name: regionName };

            const centerSource = map.current.getSource('lit-center-source') as mapboxgl.GeoJSONSource;
            if (centerSource) {
                visitedCenters.current.features.push(centerPoint);
                centerSource.setData(visitedCenters.current);
            }
        }
    };

    const fetchAndLightUp = async (adcode: string) => {
        try {
            const urlSimple = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}.json`;
            const urlFull = `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`;
            let geoJson = null;

            // 优先获取轮廓 (.json)，只显示外框
            let res = await fetch(urlSimple);
            if (res.ok) {
                geoJson = await res.json();
            } else {
                res = await fetch(urlFull);
                if (res.ok) geoJson = await res.json();
            }

            if (!geoJson) return;

            let newFeatures = [];
            let regionName = "";

            if (geoJson.type === 'FeatureCollection') {
                newFeatures = geoJson.features;
                regionName = geoJson.features[0]?.properties?.name;
            } else if (geoJson.type === 'Feature') {
                newFeatures = [geoJson];
                regionName = geoJson.properties?.name;
            }

            updateMapSources(newFeatures, regionName);

        } catch (error) {
            console.error(`边界获取失败 (${adcode}):`, error);
        }
    };

    // 国际区域高亮：从后端返回的 GeoJSON 直接更新地图
    const lightUpWithGeoJson = (feature: any, regionName: string) => {
        const newFeatures = [feature];

        // Ensure properties have name for deduplication
        newFeatures.forEach((f: any) => {
            if (!f.properties) f.properties = {};
            if (!f.properties.name) f.properties.name = regionName;
        });

        updateMapSources(newFeatures, regionName);
    };

    // 回退方案：从远程 GitHub 获取国家边界（用于不支持的国家）
    const fetchAndLightUpGlobalFallback = async (alpha2Code: string) => {
        try {
            // 1. Get Alpha-3 Code
            const restRes = await fetch(`https://restcountries.com/v3.1/alpha/${alpha2Code}`);
            const restData = await restRes.json();
            if (!restData || restData.length === 0) return;

            const alpha3Code = restData[0].cca3;
            const commonName = restData[0].name?.common || alpha3Code;

            // 2. Fetch GeoJSON from GitHub
            const geoRes = await fetch(`https://raw.githubusercontent.com/johan/world.geo.json/master/countries/${alpha3Code}.geo.json`);
            if (!geoRes.ok) return;

            const geoJson = await geoRes.json();

            let newFeatures = [];
            if (geoJson.type === 'FeatureCollection') {
                newFeatures = geoJson.features;
            } else if (geoJson.type === 'Feature') {
                newFeatures = [geoJson];
            }

            // Ensure properties have name for deduplication
            newFeatures.forEach((f: any) => {
                if (!f.properties) f.properties = {};
                f.properties.name = commonName;
            });

            updateMapSources(newFeatures, commonName);

        } catch (e) {
            console.error(`Global boundary fetch failed for ${alpha2Code}:`, e);
        }
    };

    const unlockRegion = async (lat: number, lng: number) => {
        try {
            // 通过后端 API 获取地理编码信息
            const geocodeRes = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
            const geocodeData = await geocodeRes.json();

            if (!geocodeData.success) return;

            if (geocodeData.provider === 'amap' && geocodeData.adcode) {
                // 中国区域 - 使用高德返回的 adcode
                const rawAdcode = geocodeData.adcode as string;

                if (!rawAdcode || typeof rawAdcode !== 'string') {
                    return;
                }

                let targetCode = rawAdcode;

                if (fogPrecision === 'country') targetCode = '100000';
                else if (fogPrecision === 'province') targetCode = rawAdcode.substring(0, 2) + '0000';
                else if (fogPrecision === 'city') {
                    const prefix2 = rawAdcode.substring(0, 2);
                    if (['11', '12', '31', '50', '81', '82'].includes(prefix2)) targetCode = prefix2 + '0000';
                    else targetCode = rawAdcode.substring(0, 4) + '00';
                }

                if (visitedAdcodes.current.has(targetCode)) return;
                visitedAdcodes.current.add(targetCode);
                await fetchAndLightUp(targetCode);

            } else if (geocodeData.provider === 'mapbox') {
                // 国际区域 - 使用新的 /api/region-boundary 端点
                const boundaryRes = await fetch(`/api/region-boundary?lat=${lat}&lng=${lng}&precision=${fogPrecision}`);
                const boundaryData = await boundaryRes.json();

                if (!boundaryData.success) return;

                if (boundaryData.supported && boundaryData.geojson) {
                    // 使用本地 GeoJSON 数据
                    const cacheKey = `${boundaryData.countryCode}_${boundaryData.precision}_${boundaryData.regionName}`;

                    if (visitedAdcodes.current.has(cacheKey)) return;
                    visitedAdcodes.current.add(cacheKey);

                    lightUpWithGeoJson(boundaryData.geojson, boundaryData.regionName);
                } else {
                    // 不支持的国家，使用远程 GitHub 数据作为回退
                    const upperCode = boundaryData.countryCode;
                    if (visitedAdcodes.current.has(upperCode)) return;
                    visitedAdcodes.current.add(upperCode);

                    // 需要 alpha-2 代码来调用回退函数
                    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=country`;
                    const mbRes = await fetch(mapboxUrl);
                    const mbData = await mbRes.json();

                    if (mbData.features && mbData.features.length > 0) {
                        const shortCode = mbData.features[0].properties?.short_code;
                        if (shortCode) {
                            await fetchAndLightUpGlobalFallback(shortCode);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("逆地理编码失败:", e);
        }
    };

    const updateFogBoundaries = useCallback(async (currentPhotos: Photo[]) => {
        if (!map.current) return;

        visitedAdcodes.current.clear();
        visitedRegionUnion.current = { type: 'FeatureCollection', features: [] };
        visitedCenters.current = { type: 'FeatureCollection', features: [] };

        const borderSource = map.current.getSource('lit-border-source') as mapboxgl.GeoJSONSource;
        if (borderSource) borderSource.setData({ type: 'FeatureCollection', features: [] });

        const centerSource = map.current.getSource('lit-center-source') as mapboxgl.GeoJSONSource;
        if (centerSource) centerSource.setData({ type: 'FeatureCollection', features: [] });

        console.log(`开始计算迷雾边界...`);
        for (const photo of currentPhotos) {
            await unlockRegion(photo.lat, photo.lng);
        }
    }, [fogPrecision]);

    // -------------------------------------------------------------------------
    // 3. Markers & Data
    // -------------------------------------------------------------------------

    const addMarkerToMap = useCallback((photo: Photo) => {
        if (!map.current) return;

        const el = document.createElement('div');
        el.className = 'custom-marker-wrapper group';


        const inner = document.createElement('div');
        inner.className = 'w-10 h-10 rounded-full border-2 border-white bg-cover bg-center shadow-lg cursor-pointer transition-transform duration-200 hover:scale-125 hover:z-50';
        inner.style.backgroundImage = `url(${photo.img || PLACEHOLDER_IMG})`;

        el.appendChild(inner);

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            map.current?.flyTo({ center: [photo.lng, photo.lat], zoom: 14, pitch: 45 });
        });

        const popupHTML = `
            <div class="p-1 text-black">
                <strong class="block text-sm">${photo.name || String(t('common.unknown'))}</strong>
                <span class="text-xs text-gray-500">${photo.locationName || ''}</span>
            </div>
        `;
        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(popupHTML);

        new mapboxgl.Marker({ element: el })
            .setLngLat([photo.lng, photo.lat])
            .setPopup(popup)
            .addTo(map.current);
    }, [PLACEHOLDER_IMG]);

    const fetchPhotos = useCallback(async () => {
        try {
            const res = await fetch('/api/my-footprint');
            const data = await res.json();

            if (data.photos) {
                setPhotos(data.photos);
            }
        } catch (e) {
            console.error("Failed to load photos", e);
        } finally {
            setLoading(false);
        }
    }, []);

    // 🔄 [New] Auto-update markers when photos change
    useEffect(() => {
        if (!map.current) return;

        // Clear existing markers
        const oldMarkers = document.getElementsByClassName('custom-marker-wrapper');
        while (oldMarkers.length > 0) {
            oldMarkers[0].remove();
        }

        // Add new markers
        photos.forEach(p => addMarkerToMap(p));
    }, [photos, addMarkerToMap]);

    // -------------------------------------------------------------------------
    // 4. Effects (Map Initialization - 科技感深色 + 3D地形)
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (map.current) return;

        console.log("初始化地图...");
        mapboxgl.accessToken = MAPBOX_TOKEN!;

        if (!mapContainer.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            preserveDrawingBuffer: true, // [Added] For html2canvas screenshot
            // [修改] 仅使用卫星底图，移除深色底图
            style: {
                version: 8,
                glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
                sources: {
                    // [分级优化] 1. NASA 全球高清纹理 (Zoom 0-4 极佳)
                    'nasa-blue-marble': {
                        type: 'raster',
                        tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg'],
                        tileSize: 256,
                        attribution: 'NASA GIBS'
                    },
                    // [分级优化] 2. ESRI 中等程度卫星图 (Zoom 4-8 平滑过渡)
                    'esri-satellite': {
                        type: 'raster',
                        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                        tileSize: 256,
                        attribution: 'Esri'
                    },
                    // 3. Mapbox 核心卫星源 (Zoom 8+ 使用)
                    'mapbox-satellite': { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 },
                    // [关键] 3D 地形源
                    'mapbox-dem': { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 }
                },
                layers: [
                    // 按层级叠加
                    {
                        id: 'nasa-layer', type: 'raster', source: 'nasa-blue-marble',
                        maxzoom: 6,
                        paint: {
                            // [丝滑过渡] Zoom 4-6 之间淡出
                            'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4, 1, 6, 0]
                        }
                    },
                    {
                        id: 'esri-layer', type: 'raster', source: 'esri-satellite',
                        minzoom: 3, maxzoom: 11,
                        paint: {
                            // [丝滑过渡] Zoom 4-6 淡入, Zoom 8-10 淡出
                            'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 1, 8, 1, 10, 0]
                        }
                    },
                    {
                        id: 'mapbox-satellite-layer', type: 'raster', source: 'mapbox-satellite',
                        minzoom: 7,
                        paint: {
                            // [丝滑过渡] Zoom 8-10 淡入
                            'raster-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 10, 1]
                        }
                    }
                ]
            },
            center: [105, 35],
            zoom: 3,
            pitch: 0,
            projection: 'globe' as any,
            attributionControl: false
        });

        const m = map.current;

        m.on('style.load', () => {
            console.log("样式加载成功");

            // [关键] 开启地形渲染 (Exaggeration 1.5 让山脉更明显)
            m.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

            // [修改] 真实地球大气层效果
            // 目标：复刻 Google Earth 的真实感
            // 1. 太空是深邃的黑
            // 2. 地球边缘有一层发光的蓝色光圈 (high-color)
            // 3. 表面有一层薄薄的雾气 (color)
            // 🌍 优化：真实感地球大气层
            // 参考 NASA 地球照片的视觉效果
            m.setFog({
                'range': [0.5, 10.0],        // 更宽的大气层可见范围
                'color': '#b4c6e0',          // 淡天蓝色雾气（模拟大气散射）
                'high-color': '#1a6bff',     // 明亮的钴蓝色光晕（平流层辉光）
                'horizon-blend': 0.15,       // 更柔和的地平线混合
                'space-color': '#020810',    // 极深的太空蓝黑色
                'star-intensity': 0.6        // 适度的星星亮度
            });

            // 初始化迷雾图层源
            if (!m.getSource('lit-border-source')) {
                m.addSource('lit-border-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

                // 填充层
                m.addLayer({
                    id: 'lit-fill-layer', type: 'fill', source: 'lit-border-source',
                    layout: { visibility: 'none' },
                    paint: { 'fill-color': '#00f2fe', 'fill-opacity': 0.15 }
                });
                // 边框层
                m.addLayer({
                    id: 'lit-border-layer', type: 'line', source: 'lit-border-source',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#00f2fe', 'line-width': 2, 'line-blur': 3, 'line-opacity': 0.8 }
                });
            }

            // 初始化文字源
            if (!m.getSource('lit-center-source')) {
                m.addSource('lit-center-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                m.addLayer({
                    id: 'lit-label-layer',
                    type: 'symbol',
                    source: 'lit-center-source',
                    layout: {
                        'visibility': 'none',
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': 14,
                        'text-anchor': 'center',
                        'text-allow-overlap': false
                    },
                    paint: {
                        'text-color': '#ffffff',
                        'text-halo-color': '#00f2fe',
                        'text-halo-width': 1,
                        'text-halo-blur': 2
                    }
                });
            }
        });

        // [修改] 移除 Zoom 监听器，不再根据缩放等级切换底图
        // m.on('zoom', () => {
        //     const zoom = m.getZoom();
        //     if (m.getLayer('mapbox-satellite-layer')) {
        //         if (zoom > 9) {
        //             m.setPaintProperty('mapbox-satellite-layer', 'raster-opacity', 1);
        //         } else {
        //             m.setPaintProperty('mapbox-satellite-layer', 'raster-opacity', 0);
        //         }
        //     }
        // });

        const resizeObserver = new ResizeObserver(() => m.resize());
        resizeObserver.observe(mapContainer.current);

        fetchPhotos();

        return () => resizeObserver.disconnect();
    }, [fetchPhotos]);

    // Handle Fix Location
    useEffect(() => {
        if (!map.current) return;
        const onMapClick = (e: mapboxgl.MapMouseEvent) => {
            if (isFixingLoc) setFixCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        };
        if (isFixingLoc) {
            map.current.getCanvas().style.cursor = 'crosshair';
            map.current.on('click', onMapClick);
        } else {
            map.current.getCanvas().style.cursor = '';
            map.current.off('click', onMapClick);
        }
        return () => { map.current?.off('click', onMapClick); };
    }, [isFixingLoc]);

    // Handle Fog Precision
    useEffect(() => {
        if (isFogEnabled) {
            updateFogBoundaries(photos);
        }
    }, [fogPrecision, isFogEnabled, photos, updateFogBoundaries]);


    // -------------------------------------------------------------------------
    // 5. User Actions
    // -------------------------------------------------------------------------

    const toggleFogMode = () => {
        const newFogState = !isFogEnabled;
        setIsFogEnabled(newFogState);

        if (!map.current) return;

        const m = map.current;

        const visibility = newFogState ? 'visible' : 'none';
        ['lit-fill-layer', 'lit-border-layer', 'lit-label-layer'].forEach(layer => {
            if (m.getLayer(layer)) {
                m.setLayoutProperty(layer, 'visibility', visibility);
            }
        });

        if (newFogState) {
            // 🌍 进入探索模式：切换到 Carto 深色底图
            // 1. 隐藏卫星图层
            ['nasa-layer', 'esri-layer', 'mapbox-satellite-layer'].forEach(layer => {
                if (m.getLayer(layer)) {
                    m.setLayoutProperty(layer, 'visibility', 'none');
                }
            });

            // 2. 添加 Carto 深色底图（如果不存在）
            if (!m.getSource('carto-dark')) {
                m.addSource('carto-dark', {
                    type: 'raster',
                    tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
                    tileSize: 256,
                    attribution: '© CARTO'
                });
            }
            if (!m.getLayer('carto-dark-layer')) {
                // 在最底层添加 Carto 图层
                const firstLayerId = m.getStyle().layers?.[0]?.id;
                m.addLayer({
                    id: 'carto-dark-layer',
                    type: 'raster',
                    source: 'carto-dark',
                    paint: { 'raster-opacity': 1 }
                }, firstLayerId);
            } else {
                m.setLayoutProperty('carto-dark-layer', 'visibility', 'visible');
            }

            m.easeTo({ pitch: 45, zoom: 4, duration: 1200 });
            updateFogBoundaries(photos);
        } else {
            // 🌍 退出探索模式：恢复卫星底图
            // 1. 隐藏 Carto 底图
            if (m.getLayer('carto-dark-layer')) {
                m.setLayoutProperty('carto-dark-layer', 'visibility', 'none');
            }

            // 2. 显示卫星图层
            ['nasa-layer', 'esri-layer', 'mapbox-satellite-layer'].forEach(layer => {
                if (m.getLayer(layer)) {
                    m.setLayoutProperty(layer, 'visibility', 'visible');
                }
            });

            m.easeTo({ pitch: 0, duration: 1200 });
        }
    };



    // -------------------------------------------------------------------------
    // [修复] 缺失的辅助函数：将度分秒坐标转换为十进制
    // -------------------------------------------------------------------------
    const convertDMSToDD = (dms: number[], ref: string) => {
        let dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
        if (ref === "S" || ref === "W") dd = dd * -1;
        return dd;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const userCaption = ""; // 取消弹窗，默认空日记

        try {
            setIsUploading(true);
            setUploadStatus(`1/4 ${String(t('upload.parsingGPS'))}...`);

            // @ts-ignore
            EXIF.getData(file, async function (this: any) {
                // @ts-ignore
                const latRaw = EXIF.getTag(this, "GPSLatitude");
                // @ts-ignore
                const lngRaw = EXIF.getTag(this, "GPSLongitude");
                // @ts-ignore
                const latRef = EXIF.getTag(this, "GPSLatitudeRef");
                // @ts-ignore
                const lngRef = EXIF.getTag(this, "GPSLongitudeRef");
                // @ts-ignore
                const dateRaw = EXIF.getTag(this, "DateTimeOriginal");
                // @ts-ignore
                const headingRaw = EXIF.getTag(this, "GPSImgDirection");
                if (process.env.NODE_ENV === 'development') {
                    console.log("🔍 [Debug] Raw EXIF Tags:", EXIF.getAllTags(this));
                    console.log("🔍 [Debug] headingRaw:", headingRaw);
                }

                let lat = 39.9042;
                let lng = 116.4074;
                let date = new Date().toISOString();
                let heading = null;

                if (headingRaw) {
                    // Handle Rational type from EXIF
                    heading = typeof headingRaw === 'object' ? (headingRaw.numerator / headingRaw.denominator) : headingRaw;
                }

                // [修复] 使用 as any 解决 TS 报错
                if (latRaw && lngRaw && latRef && lngRef) {
                    lat = convertDMSToDD(latRaw as any, latRef as string);
                    lng = convertDMSToDD(lngRaw as any, lngRef as string);
                }

                if (dateRaw) {
                    const [d, t] = (dateRaw as string).split(' ');
                    date = d.replace(/:/g, '-') + 'T' + t;
                }

                setUploadStatus(`2/4 ${String(t('upload.gettingLocation'))}...`);
                const locationName = await getLocationName(lat, lng);

                setUploadStatus(`3/4 ${String(t('upload.requestingPermission'))}...`);
                const presignRes = await fetch("/api/upload/presign", {
                    method: "POST",
                    body: JSON.stringify({ fileType: file.type }),
                });
                if (!presignRes.ok) throw new Error("Sign Failed");
                const { url, path } = await presignRes.json();

                setUploadStatus(`4/4 ${String(t('upload.uploading'))}...`);
                await fetch(url, {
                    method: "PUT",
                    body: file,
                    headers: { "Content-Type": file.type },
                });

                setUploadStatus(`${String(t('upload.saving'))}...`);
                await fetch("/api/upload/complete", {
                    method: "POST",
                    body: JSON.stringify({
                        filePath: path,
                        lat, lng,
                        takenAt: date,
                        size: file.size,
                        locationName: locationName || String(t('common.unknown')),
                        caption: userCaption,
                        heading: heading
                    })
                });
                if (process.env.NODE_ENV === 'development') {
                    console.log("🔍 [Debug] Send to complete API, heading:", heading);
                }

                setUploadStatus(`✅ ${String(t('upload.success'))}`);
                fetchPhotos();
                setTimeout(() => setUploadStatus(""), 2000);
            });

        } catch (error) {
            console.error(error);
            setUploadStatus(`❌ ${String(t('upload.failed'))}`);
        } finally {
            setIsUploading(false);
        }
    };

    const startFixLocation = () => {
        if (photos.length > 0) {
            // 打开照片选择窗口，让用户选择要修改的照片
            setIsPhotoSelectOpen(true);
        } else {
            alert(String(t('map.noPhotos')));
        }
    };

    const handleSelectPhotoForFix = (photo: Photo) => {
        // 用户选择了照片，进入定位修改模式
        setSelectedPhotoForFix(photo);
        setFixCoords({ lat: photo.lat, lng: photo.lng });
        setIsPhotoSelectOpen(false);
        setIsFixingLoc(true);
        map.current?.flyTo({ center: [photo.lng, photo.lat], zoom: 16 });
    };

    const cancelPhotoSelection = () => {
        setIsPhotoSelectOpen(false);
    };

    // [修复] 真正的后端调用逻辑
    // [修复] 确认修改定位 (包含经度标准化修复)
    const confirmFixLocation = async () => {
        if (!selectedPhotoForFix || !fixCoords) return;

        try {
            // === 🔥 [核心修复] 经度标准化 ===
            // Mapbox 允许地球无限旋转，经度可能变成 200, 300 等
            // 数据库要求经度必须在 -180 到 180 之间，所以需要转换
            let normalizedLng = fixCoords.lng;
            while (normalizedLng > 180) normalizedLng -= 360;
            while (normalizedLng < -180) normalizedLng += 360;
            // =================================

            // 1. 获取新的地名 (传入标准化后的坐标)
            const newLocationName = await getLocationName(fixCoords.lat, normalizedLng);

            // 2. 调用后端 API
            const res = await fetch('/api/my-footprint', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedPhotoForFix.id,
                    lat: fixCoords.lat,
                    lng: normalizedLng, // 👈 重点：发送标准化后的经度
                    locationName: newLocationName
                })
            });

            if (!res.ok) {
                // 尝试读取后端返回的错误详情
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "后端更新失败");
            }

            // 3. 更新前端状态
            const updatedPhotos = photos.map(p => {
                if (p.id === selectedPhotoForFix.id) {
                    return {
                        ...p,
                        lat: fixCoords.lat,
                        lng: normalizedLng, // 前端显示也同步更新
                        locationName: newLocationName
                    };
                }
                return p;
            });

            setPhotos(updatedPhotos);

            // 4. 重置 UI
            setIsFixingLoc(false);
            setFixCoords(null);
            setSelectedPhotoForFix(null);

            // 5. 飞向新位置
            map.current?.flyTo({ center: [normalizedLng, fixCoords.lat], zoom: 16 });

            // 可选：如果不想要弹窗，可以注释掉下面这行
            // alert("✅ 定位已成功修正！");

        } catch (error: any) {
            console.error("Fix Location Error:", error);
            alert(`❌ ${String(t('common.error'))}: ${error.message}`);
        }
    };

    // -------------------------------------------------------------------------
    // 6. JSX Render
    // -------------------------------------------------------------------------

    // State for Story Mode
    const [isStoryMode, setIsStoryMode] = useState(false);

    // ... existing functions ...

    const enterStoryMode = () => {
        if (photos.length === 0) {
            alert(String(t('map.noPhotos')));
            return;
        }
        setIsStoryMode(true);
        // Animate map to make room for sidebar
        map.current?.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 480 }, duration: 1000 });
    };

    const exitStoryMode = () => {
        setIsStoryMode(false);
        // Reset map view
        map.current?.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: 0, zoom: 3, duration: 1500 });
    };

    const handleFlyTo = (lat: number, lng: number, pitch = 45, zoom = 15, immediate = false) => {
        if (immediate) {
            // [性能优化] 播放预览时使用 jumpTo，避免动画队列堆积导致的卡顿
            map.current?.jumpTo({
                center: [lng, lat],
                zoom: zoom,
                pitch: pitch,
                padding: { top: 0, bottom: 0, left: 0, right: isStoryMode ? 480 : 0 }
            });
        } else {
            // [体验还原] 滚动章节卡片或点击时使用 flyTo，还原丝滑的飞越过渡
            map.current?.flyTo({
                center: [lng, lat],
                zoom: zoom,
                pitch: pitch,
                speed: 1,
                curve: 2.5,
                padding: { top: 0, bottom: 0, left: 0, right: isStoryMode ? 480 : 0 }
            });
        }
    };

    const updatePhotoText = async (id: string, text: string) => {
        // Update local state immediately
        setPhotos(prev => prev.map(p =>
            p.id === id ? { ...p, userText: text } : p
        ));

        // Persist to database
        try {
            await fetch('/api/my-footprint', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, caption: text })
            });
        } catch (e) {
            console.error("Failed to save text:", e);
        }
    };

    // -------------------------------------------------------------------------
    // 7. Memoized & Grouped Data
    // -------------------------------------------------------------------------

    // Sort and filter photos
    const filteredPhotos = React.useMemo(() => {
        const sorted = [...photos].sort((a, b) => {
            const dateA = a.dateTime ? new Date(a.dateTime).getTime() : 0;
            const dateB = b.dateTime ? new Date(b.dateTime).getTime() : 0;
            return dateB - dateA; // Newest first
        });

        // 1. Search Term Filtering
        let result = sorted;
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            // Handle simple year search (e.g., "2024")
            const isYearSearch = /^\d{4}$/.test(term);
            const isMonthSearch = /^\d{4}年\d{1,2}月$/.test(term); // e.g. 2024年12月

            result = result.filter(p => {
                const date = p.dateTime ? new Date(p.dateTime) : null;
                if (isYearSearch && date) {
                    return date.getFullYear().toString() === term;
                }
                if (isMonthSearch && date) {
                    const qYear = parseInt(term.split('年')[0]);
                    const qMonth = parseInt(term.split('年')[1].replace('月', ''));
                    return date.getFullYear() === qYear && (date.getMonth() + 1) === qMonth;
                }

                return (
                    (p.name && p.name.toLowerCase().includes(term)) ||
                    (p.locationName && p.locationName.toLowerCase().includes(term)) ||
                    (p.caption && p.caption.toLowerCase().includes(term))
                );
            });
        }

        // 2. Date Range Filtering
        if (dateRange[0] !== null && dateRange[1] !== null) {
            result = result.filter(p => {
                const t = p.dateTime ? new Date(p.dateTime).getTime() : 0;
                return t >= dateRange[0]! && t <= dateRange[1]!;
            });
        }

        return result;
    }, [photos, searchTerm, dateRange]);

    // Calculate min/max dates for slider
    const { minTime, maxTime } = React.useMemo(() => {
        if (photos.length === 0) return { minTime: 0, maxTime: 100 };
        const times = photos.map(p => p.dateTime ? new Date(p.dateTime).getTime() : 0).filter(t => t > 0);
        if (times.length === 0) return { minTime: 0, maxTime: 100 };
        return { minTime: Math.min(...times), maxTime: Math.max(...times) };
    }, [photos]);

    // Group photos by year/month
    const groupedPhotos = React.useMemo(() => {
        const groups: { [key: string]: Photo[] } = {};
        filteredPhotos.forEach(p => {
            const date = p.dateTime ? new Date(p.dateTime) : null;
            const key = date && !isNaN(date.getTime())
                ? `${date.getFullYear()}年${date.getMonth() + 1}月`
                : String(t('common.unknown'));

            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        return groups;
    }, [filteredPhotos]);

    return (
        <div className="w-full h-screen relative overflow-hidden">
            {/* 🌍 Mapbox 地图容器 */}
            <div
                ref={mapContainer}
                className="absolute inset-0 w-full h-full"
            />

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept="image/*"
            />

            {/* Editing Panel (Use existing isFixingLoc state) */}
            {isFixingLoc && fixCoords && (
                <div id="location-editor-panel" className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-[400px] bg-black/80 backdrop-blur-md border border-cyan-400/30 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] p-5 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-cyan-400 font-bold flex items-center gap-2 text-sm">
                            <span className="animate-pulse">📍</span> {String(t('locationFix.fixing'))}...
                        </h3>
                        <button onClick={() => setIsFixingLoc(false)} className="text-gray-400 hover:text-white text-xs">✕ {String(t('common.cancel'))}</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-3 text-center border-b border-white/10 pb-2">
                        {String(t('locationFix.clickMap'))}
                    </p>
                    <div className="flex gap-3 mb-4">
                        <div className="flex-1">
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{String(t('locationFix.latitude'))}</label>
                            <input
                                type="number"
                                value={fixCoords.lat}
                                onChange={(e) => setFixCoords(prev => prev ? { ...prev, lat: parseFloat(e.target.value) } : null)}
                                step="0.000001"
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none focus:bg-white/10 transition-colors"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{String(t('locationFix.longitude'))}</label>
                            <input
                                type="number"
                                value={fixCoords.lng}
                                onChange={(e) => setFixCoords(prev => prev ? { ...prev, lng: parseFloat(e.target.value) } : null)}
                                step="0.000001"
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none focus:bg-white/10 transition-colors"
                            />
                        </div>
                    </div>
                    <button onClick={confirmFixLocation} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-bold text-sm shadow-lg hover:shadow-cyan-400/20 hover:scale-[1.02] active:scale-95 transition-all">
                        {String(t('locationFix.confirmSave'))}
                    </button>
                </div>
            )}

            {/* Photo Selection Modal - Choose which photo to fix location */}
            {isPhotoSelectOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-[480px] max-h-[70vh] bg-[#0F172A]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-white/[0.06] flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-semibold text-[#F8FAFC]">{String(t('locationFix.selectPhoto'))}</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{String(t('locationFix.selectDescription'))}</p>
                            </div>
                            <button 
                                onClick={cancelPhotoSelection}
                                className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Photo Grid */}
                        <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
                            {photos.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-sm">{String(t('map.noPhotos'))}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-3">
                                    {photos.map((photo) => {
                                        const dateObj = photo.dateTime ? new Date(photo.dateTime) : null;
                                        const dateStr = dateObj && !isNaN(dateObj.getTime())
                                            ? `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                                            : String(t('common.unknown'));
                                        
                                        return (
                                            <button
                                                key={photo.id}
                                                onClick={() => handleSelectPhotoForFix(photo)}
                                                className="group relative aspect-square rounded-xl overflow-hidden bg-slate-800/50 border border-white/[0.06] hover:border-[#22C55E]/50 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-200 cursor-pointer text-left"
                                            >
                                                {/* Photo Thumbnail */}
                                                <img 
                                                    src={photo.img} 
                                                    alt={photo.name || String(t('common.photo'))}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                />
                                                
                                                {/* Overlay on Hover */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5">
                                                    <p className="text-[10px] text-white/90 font-medium truncate">
                                                        {photo.locationName || String(t('common.unknown'))}
                                                    </p>
                                                    <p className="text-[9px] text-white/60">
                                                        {dateStr}
                                                    </p>
                                                </div>
                                                
                                                {/* Selected Indicator */}
                                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#22C55E] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02] rounded-b-2xl">
                            <p className="text-xs text-slate-500 text-center">
                                {String(t('locationFix.totalPhotos')).replace('{count}', String(photos.length))} · {String(t('locationFix.startFix'))}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar Control Center */}
            {!isStoryMode && (
                <div id="sidebar" className="absolute top-6 left-6 w-[360px] h-[calc(100%-48px)] z-10 flex flex-col transition-transform duration-500 font-sans">
                    <div className="flex-1 flex flex-col bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden relative">

                        {/* 1. Header Area */}
                        <div className="px-5 pt-5 pb-3 flex justify-between items-center border-b border-white/[0.06]">
                            <div>
                                <h2 className="text-lg font-semibold text-[#F8FAFC] tracking-tight">
                                    {String(t('map.console'))}
                                </h2>
                                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5 font-medium">Console</div>
                            </div>
                            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: "w-8 h-8 border border-white/10 rounded-full" } }} />
                        </div>

                        {/* 2. Action Grid */}
                        <div className="p-4 grid grid-cols-2 gap-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                            {/* Primary: Upload */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="col-span-1 group relative overflow-hidden rounded-xl bg-[#22C55E] hover:bg-[#16A34A] p-3 text-sm font-semibold text-white shadow-lg shadow-green-900/20 transition-all duration-200 active:scale-[0.96] flex flex-col items-center justify-center gap-1 cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>{String(t('map.uploadPhoto'))}</span>
                            </button>

                            {/* Secondary: Fix Location */}
                            <button
                                onClick={startFixLocation}
                                className="col-span-1 group rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] p-3 text-sm font-medium text-slate-300 hover:text-white transition-all duration-200 active:scale-[0.96] flex flex-col items-center justify-center gap-1 cursor-pointer"
                            >
                                <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{String(t('map.fixLocation'))}</span>
                            </button>

                            {/* Mode Toggles */}
                            <div className="col-span-2 grid grid-cols-2 gap-2.5 mt-1">
                                {/* Fog Mode */}
                                <button
                                    className={`rounded-xl border p-2.5 flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-200 active:scale-[0.96] cursor-pointer ${isFogEnabled
                                        ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#22C55E]'
                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                                        }`}
                                    onClick={toggleFogMode}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>{String(isFogEnabled ? t('map.exitExplore') : t('map.exploreMode'))}</span>
                                </button>

                                {/* Story Mode */}
                                <button
                                    className="rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border border-indigo-500/25 p-2.5 flex items-center justify-center gap-2 text-sm font-semibold text-indigo-300 transition-all duration-200 hover:brightness-110 active:scale-[0.96] cursor-pointer"
                                    onClick={enterStoryMode}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    <span>{String(t('map.storyMode'))}</span>
                                </button>
                            </div>

                            {/* Conditional Controls */}
                            {isFogEnabled && (
                                <div className="col-span-2 space-y-2.5 mt-1 animate-in slide-in-from-top-2">
                                    {/* Segmented Control - Precision Selection */}
                                    <div className="flex p-1 bg-black/30 rounded-xl border border-white/[0.06]">
                                        {[
                                            { value: 'city', label: String(t('map.city')), icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                            )},
                                            { value: 'province', label: String(t('map.province')), icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            )},
                                            { value: 'country', label: String(t('map.country')), icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            )},
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => setFogPrecision(option.value as any)}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                                                    fogPrecision === option.value
                                                        ? 'bg-[#22C55E] text-white shadow-lg shadow-green-500/25'
                                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                                                }`}
                                            >
                                                {option.icon}
                                                <span>{option.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    
                                    {/* Generate Report Button */}
                                    <button
                                        className="w-full rounded-xl bg-[#22C55E]/10 hover:bg-[#22C55E]/15 border border-[#22C55E]/25 text-[#22C55E] text-xs font-semibold transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 py-2.5"
                                        onClick={() => setIsReportOpen(true)}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                        {String(t('map.generateReport'))}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 3. Photo List */}
                        <div className="px-4 py-3 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{String(t('map.timeline'))}</span>
                                <div className="flex items-center gap-2">
                                    {/* View Toggle */}
                                    <div className="flex bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.06]">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`p-1 rounded ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                            title="List View"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                        </button>
                                        <button
                                            onClick={() => setViewMode('grid')}
                                            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                            title="Grid View"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                                        </button>
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium bg-white/5 px-2 py-0.5 rounded-full">
                                        {filteredPhotos.length} / {photos.length}
                                    </span>
                                </div>
                            </div>

                            {/* Search Input */}
                            <div className="relative group">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">🔍</span>
                                <input
                                    type="text"
                                    placeholder={String(t('map.search'))}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all"
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Time Range Filter - Preset Buttons */}
                            {photos.length > 0 && minTime > 0 && maxTime > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{String(t('map.timeFilter'))}</span>
                                        {(dateRange[0] !== null || dateRange[1] !== null) && (
                                            <button
                                                onClick={() => setDateRange([null, null])}
                                                className="text-[10px] text-[#22C55E] hover:text-green-400 transition-colors cursor-pointer flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                {String(t('common.reset'))}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Quick Filter Buttons */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {/* Calculate available years from photos */}
                                        {(() => {
                                            const years = new Set<number>();
                                            photos.forEach(p => {
                                                if (p.dateTime) {
                                                    const year = new Date(p.dateTime).getFullYear();
                                                    if (!isNaN(year)) years.add(year);
                                                }
                                            });
                                            const sortedYears = Array.from(years).sort((a, b) => b - a);
                                            const currentYear = new Date().getFullYear();
                                            
                                            // Check if filters are active
                                            const isAllActive = dateRange[0] === null && dateRange[1] === null;
                                            const isRecentYear = dateRange[0] !== null && 
                                                new Date(dateRange[0]).getFullYear() === currentYear - 1 &&
                                                dateRange[1] !== null &&
                                                new Date(dateRange[1]).getFullYear() === currentYear;
                                            
                                            return (
                                                <>
                                                    <button
                                                        onClick={() => setDateRange([null, null])}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                                                            isAllActive
                                                                ? 'bg-[#22C55E] text-white shadow-lg shadow-green-500/20'
                                                                : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 border border-white/[0.06]'
                                                        }`}
                                                    >
                                                        {String(t('map.all'))}
                                                    </button>
                                                    
                                                    {/* Recent Year Button */}
                                                    <button
                                                        onClick={() => {
                                                            const now = new Date();
                                                            const oneYearAgo = new Date();
                                                            oneYearAgo.setFullYear(now.getFullYear() - 1);
                                                            setDateRange([oneYearAgo.getTime(), now.getTime()]);
                                                        }}
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                                                            isRecentYear
                                                                ? 'bg-[#22C55E] text-white shadow-lg shadow-green-500/20'
                                                                : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 border border-white/[0.06]'
                                                        }`}
                                                    >
                                                        {String(t('map.recentYear'))}
                                                    </button>
                                                    
                                                    {/* Year Buttons */}
                                                    {sortedYears.slice(0, 4).map(year => {
                                                        const isActive = dateRange[0] !== null && 
                                                            new Date(dateRange[0]).getFullYear() === year &&
                                                            dateRange[1] !== null &&
                                                            new Date(dateRange[1]).getFullYear() === year;
                                                        
                                                        return (
                                                            <button
                                                                key={year}
                                                                onClick={() => {
                                                                    const start = new Date(year, 0, 1).getTime();
                                                                    const end = new Date(year, 11, 31, 23, 59, 59).getTime();
                                                                    setDateRange([start, end]);
                                                                }}
                                                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                                                                    isActive
                                                                        ? 'bg-[#22C55E] text-white shadow-lg shadow-green-500/20'
                                                                        : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200 border border-white/[0.06]'
                                                                }`}
                                                            >
                                                                {year}{locale === 'zh' ? '年' : ''}
                                                            </button>
                                                        );
                                                    })}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    
                                    {/* Current Selection Display */}
                                    {(dateRange[0] !== null || dateRange[1] !== null) && (
                                        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white/[0.03] rounded-lg px-3 py-2 border border-white/[0.06]">
                                            <svg className="w-3.5 h-3.5 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span>
                                                {dateRange[0] && new Date(dateRange[0]).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })} 
                                                <span className="mx-1 text-slate-600">→</span> 
                                                {dateRange[1] && new Date(dateRange[1]).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Zoom Slider (Only in Grid Mode) */}
                            {viewMode === 'grid' && (
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                                    <span className="text-[10px] text-gray-500">Zoom</span>
                                    <input
                                        type="range"
                                        min="2"
                                        max="5"
                                        step="1"
                                        value={7 - gridCols} // Invert: Slider Right (Max) = Bigger Imgs (Lower Cols)
                                        onChange={(e) => setGridCols(7 - parseInt(e.target.value))}
                                        className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-400"
                                    />
                                </div>
                            )}
                        </div>

                        <div id="photo-list" className="flex-1 overflow-y-auto px-5 pb-5 no-scrollbar mask-image-b">
                            {photos.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-gray-600 space-y-4 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-3xl opacity-50">
                                        🖼️
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-gray-400">{String(t('map.noPhotos'))}</p>
                                        <p className="text-xs mt-1">{String(t('map.uploadPrompt'))}</p>
                                    </div>
                                </div>
                            ) : filteredPhotos.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                                    <span className="text-2xl mb-2">🔍</span>
                                    <p className="text-sm">{String(t('map.noResults'))}</p>
                                </div>
                            ) : (
                                viewMode === 'list' ? (
                                    // === List View ===
                                    Object.entries(groupedPhotos).map(([month, monthPhotos]) => (
                                        <div key={month} className="mb-6 last:mb-0">
                                            <div className="sticky top-0 z-[5] bg-[#0a0a0a]/90 backdrop-blur-sm py-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-[1px] flex-1 bg-white/5"></div>
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
                                                        {month}
                                                    </span>
                                                    <div className="h-[1px] flex-1 bg-white/5"></div>
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                {monthPhotos.map(p => {
                                                    const dateObj = p.dateTime ? new Date(p.dateTime) : null;
                                                    const dateStr = dateObj && !isNaN(dateObj.getTime())
                                                        ? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日 ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`
                                                        : String(t('common.unknown'));

                                                    return (
                                                        <div
                                                            key={p.id}
                                                            onClick={() => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 16, pitch: 45 })}
                                                            className="group relative flex items-center p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] hover:shadow-lg transition-all duration-200 cursor-pointer border border-transparent hover:border-white/10"
                                                        >
                                                            <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-gray-800 ring-1 ring-white/10 group-hover:ring-white/30 transition-all">
                                                                <img src={p.img} className="w-full h-full object-cover" loading="lazy" />
                                                            </div>
                                                            <div className="ml-3 flex-1 min-w-0">
                                                                <div className="flex justify-between items-start">
                                                                    <h4 className="text-sm font-medium text-gray-200 truncate pr-2 group-hover:text-blue-400 transition-colors">
                                                                        {p.name || String(t('common.unnamed'))}
                                                                    </h4>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded text-gray-400 font-mono">
                                                                        {dateStr}
                                                                    </span>
                                                                </div>
                                                                {p.locationName && (
                                                                    <div className="text-[10px] text-gray-500 truncate mt-1 flex items-center gap-1 opacity-60">
                                                                        <span>📍</span> {p.locationName}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // === Grid View ===
                                    <div className="animate-in fade-in zoom-in-95 duration-300">
                                        {Object.entries(groupedPhotos).map(([month, monthPhotos]) => (
                                            <div key={month} className="mb-4">
                                                <div className="sticky top-0 z-[5] bg-[#0a0a0a]/90 backdrop-blur-sm py-2 mb-2">
                                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                        {month}
                                                    </span>
                                                </div>
                                                <div
                                                    className="grid gap-2"
                                                    style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
                                                >
                                                    {monthPhotos.map(p => (
                                                        <div
                                                            key={p.id}
                                                            onClick={() => map.current?.flyTo({ center: [p.lng, p.lat], zoom: 16, pitch: 45 })}
                                                            className="aspect-square relative rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-white/50 transition-all"
                                                        >
                                                            <img src={p.img} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" loading="lazy" />
                                                            {/* Overlay Icon on Hover */}
                                                            <div className="absolute inset-0 bg-black/20 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <span className="text-white text-xs drop-shadow-md">✈️</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </div>

                        <div className="h-6 bg-gradient-to-t from-black/40 to-transparent pointer-events-none absolute bottom-0 w-full"></div>
                    </div>
                </div>
            )}

            {/* Floating Buttons - Language & Geolocation */}
            <FloatingButtons 
                onLocate={() => {
                    if (!map.current) return;
                    setIsLocating(true);
                    setLocateError(null);

                    if (!navigator.geolocation) {
                        setLocateError(String(t('map.locationError')));
                        setIsLocating(false);
                        return;
                    }

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            map.current?.flyTo({
                                center: [longitude, latitude],
                                zoom: 14,
                                pitch: 45,
                                speed: 1.2,
                                curve: 1.42,
                                essential: true
                            });
                            setIsLocating(false);
                        },
                        (error) => {
                            let msg = String(t('map.locationError'));
                            switch (error.code) {
                                case error.PERMISSION_DENIED:
                                    msg = String(t('map.permissionDenied'));
                                    break;
                                case error.POSITION_UNAVAILABLE:
                                    msg = String(t('map.positionUnavailable'));
                                    break;
                                case error.TIMEOUT:
                                    msg = String(t('map.timeout'));
                                    break;
                            }
                            setLocateError(msg);
                            setIsLocating(false);
                            setTimeout(() => setLocateError(null), 3000);
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 60000
                        }
                    );
                }}
                isLocating={isLocating}
            />

            {/* Geolocation Error Toast */}
            {locateError && (
                <div className="fixed bottom-24 right-6 z-40 px-4 py-2 bg-red-500/90 backdrop-blur-sm text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
                    {locateError}
                </div>
            )}

            {/* Story Mode Component */}
            {isStoryMode && (
                <StoryMode
                    photos={photos}
                    onExit={exitStoryMode}
                    onFlyTo={handleFlyTo}
                    onUpdatePhotoText={updatePhotoText}
                />
            )}

            {/* Footprint Report */}
            {isReportOpen && (
                <FootprintReport
                    isOpen={isReportOpen}
                    onClose={() => setIsReportOpen(false)}
                    photos={photos}
                    visitedAreasCount={visitedAdcodes.current.size}
                    getMapSnapshot={() => map.current?.getCanvas().toDataURL() || ""}
                />
            )}
        </div>
    );
};

export default MapboxView;