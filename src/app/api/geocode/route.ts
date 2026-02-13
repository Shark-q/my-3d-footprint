import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (!lat || !lng) {
        return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    // 判断是否在中国范围内
    const isRoughlyInChina = lngNum > 73 && lngNum < 135 && latNum > 3 && latNum < 54;

    try {
        if (isRoughlyInChina) {
            // 使用高德 API (中国)
            const apiKey = process.env.AMAP_KEY;
            if (!apiKey) {
                return NextResponse.json({ error: "Server missing AMAP_KEY" }, { status: 500 });
            }

            const url = `https://restapi.amap.com/v3/geocode/regeo?output=json&location=${lng},${lat}&key=${apiKey}&radius=1000&extensions=all`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === "1" && data.regeocode) {
                const addr = data.regeocode.formatted_address;
                const adcode = data.regeocode.addressComponent.adcode;
                const district = data.regeocode.addressComponent.district;
                const city = data.regeocode.addressComponent.city;
                const province = data.regeocode.addressComponent.province;
                const country = data.regeocode.addressComponent.country;

                // 处理高德返回空数组的情况
                const formattedAddress = (Array.isArray(addr) || !addr)
                    ? [province, city, district].filter(Boolean).join("") || "未知地点"
                    : addr;

                return NextResponse.json({
                    success: true,
                    provider: "amap",
                    formattedAddress,
                    adcode,
                    province,
                    city,
                    district,
                    country: country || "中国"
                });
            } else {
                console.error("AMap API Error Response:", JSON.stringify(data, null, 2));
                return NextResponse.json({ error: "AMap API failed", details: data }, { status: 400 });
            }
        } else {
            // 使用 Mapbox API (国际)
            const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
            if (!mapboxToken) {
                return NextResponse.json({ error: "Server missing MAPBOX_TOKEN" }, { status: 500 });
            }

            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&types=place,region,locality,neighborhood,address&language=zh-CN`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.features && data.features.length > 0) {
                const feature = data.features[0];
                return NextResponse.json({
                    success: true,
                    provider: "mapbox",
                    formattedAddress: feature.place_name || "未知地点",
                    country: feature.context?.find((c: any) => c.id.startsWith("country"))?.text || null
                });
            } else {
                return NextResponse.json({
                    success: true,
                    provider: "mapbox",
                    formattedAddress: "未知荒野"
                });
            }
        }
    } catch (error) {
        console.error("Geocoding error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

