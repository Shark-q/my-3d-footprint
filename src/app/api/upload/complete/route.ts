// src/app/api/upload/complete/route.ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🌤️ 辅助函数：获取历史天气 (保持不变)
async function fetchHistoricalWeather(lat: number, lng: number, dateIso: string) {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) return null;
    const dateStr = dateIso.split('T')[0];
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lat},${lng}/${dateStr}?unitGroup=metric&key=${apiKey}&include=days&lang=zh`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.days && data.days.length > 0) {
      const day = data.days[0];
      return {
        temp: day.temp,
        conditions: day.conditions,
        icon: day.icon,
        description: day.description
      };
    }
    return null;
  } catch (error) {
    console.error("Weather Fetch Error:", error);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // 1. 验证身份
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 2. 确保用户在数据库存在 (User Upsert 修复逻辑)
    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress || "";

    const dbUser = await prisma.user.upsert({
      where: { clerkId: clerkId },
      update: {},
      create: { clerkId: clerkId, email: email, tier: "FREE" }
    });

    // 3. 获取数据 (=== 👇 修改点 A: 增加 locationName 👇 ===)
    const body = await req.json();
    const { filePath, lat, lng, takenAt, size, caption, locationName, heading } = body;
    if (process.env.NODE_ENV === 'development') {
      console.log("🔍 [Debug] Received heading from frontend:", heading);
    }
    // ==========================================================

    // 4. 查找或创建旅程
    let journey = await prisma.journey.findFirst({
      where: { userId: dbUser.id },
      orderBy: { updatedAt: 'desc' }
    });

    if (!journey) {
      journey = await prisma.journey.create({
        data: { title: "我的默认足迹", userId: dbUser.id, isPublic: false }
      });
    }

    // 5. 获取天气
    const takenTime = new Date(takenAt || Date.now()).toISOString();
    const weatherData = await fetchHistoricalWeather(lat, lng, takenTime);

    // 6. 执行 SQL 插入 (=== 👇 修改点 B: 写入 locationName 👇 ===)
    const photoId = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "photo_nodes" (
        "id", 
        "journeyId", 
        "s3Key", 
        "takenAt", 
        "location", 
        "caption", 
        "locationName",    -- 新增列名
        "heading",         -- 新增列名
        "weatherInfo", 
        "createdAt"
      ) VALUES (
        ${photoId}, 
        ${journey.id}, 
        ${filePath}, 
        ${takenAt ? new Date(takenAt).toISOString() : new Date().toISOString()}::timestamp, 
        ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography,
        ${caption || null},
        ${locationName || null},
        ${heading !== undefined ? parseFloat(heading) : null}, -- 新增值
        ${weatherData ? JSON.stringify(weatherData) : null}::jsonb,
        NOW()
      );
    `;
    // ==========================================================

    // 7. 更新容量
    await prisma.user.update({
      where: { clerkId: clerkId },
      data: { storageUsed: { increment: size } }
    });

    return NextResponse.json({ success: true, photoId, weather: weatherData, locationName });

  } catch (error: any) {
    console.error("Save Meta Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}