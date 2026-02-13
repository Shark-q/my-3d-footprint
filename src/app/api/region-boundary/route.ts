import { NextRequest, NextResponse } from "next/server";
import * as turf from "@turf/turf";
import { promises as fs } from "fs";
import path from "path";
import {
    SUPPORTED_COUNTRIES,
    convertAlpha2ToAlpha3,
    getAvailablePrecision,
    isCountrySupported
} from "@/lib/supported-countries";

// GeoJSON 缓存，避免重复读取大文件
const geoJsonCache = new Map<string, any>();

/**
 * 读取 GeoJSON 文件（带缓存）
 */
async function loadGeoJson(countryCode: string, admLevel: string): Promise<any | null> {
    const cacheKey = `${countryCode}_${admLevel}`;

    if (geoJsonCache.has(cacheKey)) {
        return geoJsonCache.get(cacheKey);
    }

    try {
        const filePath = path.join(
            process.cwd(),
            "public",
            "geojson",
            "geoBoundaries_simplified",
            countryCode,
            admLevel,
            `${countryCode}_${admLevel}_simplified.geojson`
        );

        const fileContent = await fs.readFile(filePath, "utf-8");
        const geoJson = JSON.parse(fileContent);

        // 缓存 GeoJSON
        geoJsonCache.set(cacheKey, geoJson);

        return geoJson;
    } catch (error) {
        console.error(`Failed to load GeoJSON: ${countryCode}/${admLevel}`, error);
        return null;
    }
}

/**
 * 使用 turf.js 查找坐标点所在的行政区
 */
function findRegionContainingPoint(
    geoJson: any,
    lat: number,
    lng: number
): { feature: any; regionName: string } | null {
    const point = turf.point([lng, lat]);

    if (geoJson.type === "FeatureCollection") {
        for (const feature of geoJson.features) {
            try {
                if (turf.booleanPointInPolygon(point, feature)) {
                    const regionName = feature.properties?.shapeName
                        || feature.properties?.name
                        || feature.properties?.NAME
                        || "Unknown";
                    return { feature, regionName };
                }
            } catch (e) {
                // 某些复杂多边形可能导致错误，跳过
                continue;
            }
        }
    } else if (geoJson.type === "Feature") {
        try {
            if (turf.booleanPointInPolygon(point, geoJson)) {
                const regionName = geoJson.properties?.shapeName
                    || geoJson.properties?.name
                    || geoJson.properties?.NAME
                    || "Unknown";
                return { feature: geoJson, regionName };
            }
        } catch (e) {
            // 忽略错误
        }
    }

    return null;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const precision = searchParams.get("precision") as "country" | "province" | "city" || "country";

    if (!lat || !lng) {
        return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    try {
        // 1. 使用 Mapbox 获取国家代码
        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!mapboxToken) {
            return NextResponse.json({ error: "Missing MAPBOX_TOKEN" }, { status: 500 });
        }

        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngNum},${latNum}.json?access_token=${mapboxToken}&types=country`;
        const mbRes = await fetch(mapboxUrl);
        const mbData = await mbRes.json();

        if (!mbData.features || mbData.features.length === 0) {
            return NextResponse.json({
                success: false,
                error: "Could not determine country"
            }, { status: 400 });
        }

        const countryFeature = mbData.features[0];
        const alpha2Code = countryFeature.properties?.short_code;
        const countryName = countryFeature.text || countryFeature.place_name;

        if (!alpha2Code) {
            return NextResponse.json({
                success: false,
                error: "Could not get country code"
            }, { status: 400 });
        }

        // 2. 转换为 alpha-3 代码
        const alpha3Code = convertAlpha2ToAlpha3(alpha2Code);

        if (!alpha3Code || !isCountrySupported(alpha3Code)) {
            // 国家不在支持列表中，返回空结果（前端将使用远程 GitHub 数据）
            return NextResponse.json({
                success: true,
                supported: false,
                countryCode: alpha3Code || alpha2Code.toUpperCase(),
                countryName,
                message: "Country not in supported list, use remote fallback"
            });
        }

        // 3. 确定可用的精度级别（可能降级）
        const availablePrecision = getAvailablePrecision(alpha3Code, precision);

        if (!availablePrecision) {
            return NextResponse.json({
                success: true,
                supported: false,
                countryCode: alpha3Code,
                countryName,
                message: "No boundary data available for this country"
            });
        }

        // 4. 加载 GeoJSON 文件
        const geoJson = await loadGeoJson(alpha3Code, availablePrecision);

        if (!geoJson) {
            return NextResponse.json({
                success: false,
                error: `Failed to load GeoJSON for ${alpha3Code}/${availablePrecision}`
            }, { status: 500 });
        }

        // 5. 使用 turf.js 查找坐标所在的行政区
        const result = findRegionContainingPoint(geoJson, latNum, lngNum);

        if (!result) {
            // 点不在任何多边形内（可能在边界外或海上）
            // 返回整个国家级别
            if (availablePrecision !== "ADM0") {
                const adm0GeoJson = await loadGeoJson(alpha3Code, "ADM0");
                if (adm0GeoJson) {
                    const adm0Result = findRegionContainingPoint(adm0GeoJson, latNum, lngNum);
                    if (adm0Result) {
                        return NextResponse.json({
                            success: true,
                            supported: true,
                            countryCode: alpha3Code,
                            countryName,
                            precision: "ADM0",
                            requestedPrecision: precision,
                            regionName: adm0Result.regionName,
                            geojson: adm0Result.feature
                        });
                    }
                }
            }

            return NextResponse.json({
                success: true,
                supported: false,
                countryCode: alpha3Code,
                countryName,
                message: "Point not found in any region polygon"
            });
        }

        // 6. 返回匹配的行政区边界
        return NextResponse.json({
            success: true,
            supported: true,
            countryCode: alpha3Code,
            countryName,
            precision: availablePrecision,
            requestedPrecision: precision,
            regionName: result.regionName,
            geojson: result.feature
        });

    } catch (error) {
        console.error("Region boundary error:", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
