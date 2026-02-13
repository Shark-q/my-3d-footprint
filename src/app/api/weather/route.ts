import { NextRequest, NextResponse } from "next/server";

/**
 * 历史天气查询 API
 * 使用 Visual Crossing API 获取指定日期的历史天气数据
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const date = searchParams.get("date"); // 格式: YYYY-MM-DD

    if (!lat || !lng) {
        return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
    }

    if (!date) {
        return NextResponse.json({ error: "Missing date parameter" }, { status: 400 });
    }

    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "Server missing WEATHER_API_KEY" }, { status: 500 });
    }

    try {
        const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lng}/${date}?unitGroup=metric&key=${apiKey}&include=days&lang=zh`;

        const res = await fetch(url);

        if (!res.ok) {
            console.error("Weather API error:", res.status);
            return NextResponse.json({
                success: false,
                weather: "暂无数据"
            });
        }

        const data = await res.json();

        if (data.days && data.days.length > 0) {
            const day = data.days[0];
            return NextResponse.json({
                success: true,
                weather: `${day.conditions} ${Math.round(day.temp)}°C`,
                details: {
                    conditions: day.conditions,
                    temp: day.temp,
                    tempmax: day.tempmax,
                    tempmin: day.tempmin,
                    humidity: day.humidity,
                    windspeed: day.windspeed,
                    icon: day.icon
                }
            });
        }

        return NextResponse.json({
            success: false,
            weather: "数据缺失"
        });

    } catch (error) {
        console.error("Weather API error:", error);
        return NextResponse.json({
            success: false,
            weather: "查询失败"
        });
    }
}
