import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuidv4 } from 'uuid';

// ==============================================================================
// 1. GET: 获取足迹数据 (用于前端地图展示)
// ==============================================================================
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true }
    });

    if (!user) return NextResponse.json({ photos: [] });

    // 查找最近的一个旅程
    const journey = await prisma.journey.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' }
    });

    if (!journey) return NextResponse.json({ photos: [] });

    // 查询照片并转换 PostGIS 坐标
    const photosRaw = await prisma.$queryRaw<any[]>`
      SELECT 
        id, 
        "s3Key", 
        "takenAt", 
        "caption", 
        "locationName", 
        "weatherInfo",
        "aiDiaryText", 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng
      FROM "photo_nodes"
      WHERE "journeyId" = ${journey.id}
      ORDER BY "takenAt" ASC
    `;

    // 生成签名 URL
    const photos = await Promise.all(photosRaw.map(async (p) => {
      let imgUrl = "";
      if (p.s3Key) {
        const { data } = await supabaseAdmin
          .storage
          .from('photos')
          .createSignedUrl(p.s3Key, 3600);
        imgUrl = data?.signedUrl || "";
      }

      return {
        id: p.id,
        // [Modified] Option A: Title is strictly Location Name to avoid long captions as titles
        name: p.locationName || "未命名回忆",
        img: imgUrl,
        lat: p.lat,
        lng: p.lng,
        dateTime: p.takenAt,
        weather: p.weatherInfo,
        locationName: p.locationName,
        aiText: p.aiDiaryText, // 返回 AI 生成的文字
        userText: p.caption || "" // 返回用户编辑的文字 (story mode)
      };
    }));

    return NextResponse.json({
      journeyTitle: journey.title,
      photos
    });

  } catch (error: any) {
    console.error("Fetch Footprint Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==============================================================================
// 1.5. PATCH: 更新用户编辑的文字 (Story Mode 保存)
// ==============================================================================
export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, caption } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing photo id" }, { status: 400 });
    }

    // Verify ownership
    const photo = await prisma.photoNode.findFirst({
      where: {
        id: id,
        journey: { user: { clerkId: clerkId } }
      }
    });

    if (!photo) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Update caption
    await prisma.photoNode.update({
      where: { id: id },
      data: { caption: caption || "" }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Update Caption Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ==============================================================================
// 2. PUT: 修改定位 (前端修正定位时调用)
// ==============================================================================
// src/app/api/my-footprint/route.ts 中的 PUT 部分

// src/app/api/my-footprint/route.ts

export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, lat, lng, locationName } = body;

    // 1. 基础校验
    if (!id || lat === undefined || lng === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. 验证权限
    const photo = await prisma.photoNode.findFirst({
      where: {
        id: id,
        journey: { user: { clerkId: clerkId } }
      }
    });

    if (!photo) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // 3. 🛡️ [核心修复] 强制类型清洗 (Sanitization)
    // 确保 finalName 绝对是一个 String，防止 Prisma 收到 Array 报错
    let finalName = "未知地点";

    if (typeof locationName === 'string' && locationName.trim().length > 0) {
      finalName = locationName;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log("⚠️ 收到无效的地名格式 (可能是数组或空值):", locationName);
      }
      // 可以在这里选择保留原值，或者设为“未知地点”
      // 如果 locationName 是 []，这里会自动 fallback 到 "未知地点"
    }

    // 4. 执行更新
    // 使用清洗后的 finalName
    await prisma.photoNode.update({
      where: { id: id },
      data: {
        locationName: finalName
      }
    });

    // 更新地理坐标
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      await prisma.$executeRaw`
                UPDATE "photo_nodes"
                SET "location" = ST_SetSRID(ST_MakePoint(${lngNum}, ${latNum}), 4326)::geography
                WHERE "id" = ${id}
            `;
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("❌ Update Location Error:", error);
    return NextResponse.json({ error: "Internal Server Error: " + error.message }, { status: 500 });
  }
}

// ==============================================================================
// 3. POST: 上传处理与 AI 分析 (保留你原有的 AI 功能)
// ==============================================================================
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { lat, lng, takenAt, s3Key, locationName, caption } = body;

    // 1. 确保用户存在
    let user = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!user) {
      const clerkUser = await currentUser();
      const email = clerkUser?.emailAddresses[0]?.emailAddress || `${userId}@no-email.com`;
      user = await prisma.user.create({
        data: { clerkId: userId, email, tier: "FREE" }
      });
    }

    // 2. 确保旅程存在
    let journey = await prisma.journey.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' }
    });
    if (!journey) {
      journey = await prisma.journey.create({
        data: { title: "My Timeline", userId: user.id, isPublic: false }
      });
    }

    // 3. AI 分析逻辑 (Qwen-VL)
    let aiDiaryText = "";
    try {
      // 生成临时链接供 AI 读取
      let aiImageUrl = s3Key;
      if (s3Key && !s3Key.startsWith("http")) {
        const { data } = await supabaseAdmin.storage.from('photos').createSignedUrl(s3Key, 300);
        if (data?.signedUrl) aiImageUrl = data.signedUrl;
      }

      const SYSTEM_PROMPT = `
角色: 你是一位擅长捕捉时间与光影的散文家。
任务: 根据照片和提供的元数据，写一段极简的、充满回忆感的文案。
要求: 100字以内。第一行: 时间+地点+天气。第二行: 视觉细节。第三行: 简短感悟。风格克制深情。
`;
      if (process.env.DASHSCOPE_API_KEY) {
        const aiRes = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "qwen-vl-max",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: `时间:${takenAt}, 地点:${locationName}, 用户描述:${caption || '无'}。请写出文案。` },
                  { type: "image_url", image_url: { url: aiImageUrl } }
                ]
              }
            ]
          })
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiDiaryText = aiData.choices?.[0]?.message?.content || "";
        }
      }
    } catch (e) {
      console.error("AI Gen Failed:", e);
    }

    // 4. 保存到数据库
    const id = uuidv4();
    const takenTime = new Date(takenAt).toISOString();

    await prisma.$executeRaw`
            INSERT INTO "photo_nodes" (
                "id", "location", "takenAt", "s3Key", "locationName", "caption", "aiDiaryText", "journeyId", "createdAt"
            )
            VALUES (
                ${id}, 
                ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography, 
                ${takenTime}::timestamp, 
                ${s3Key}, 
                ${locationName}, 
                ${caption}, 
                ${aiDiaryText}, 
                ${journey.id},
                NOW()
            )
        `;

    return NextResponse.json({ success: true, id, aiDiaryText });

  } catch (error) {
    console.error("Save Photo Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}