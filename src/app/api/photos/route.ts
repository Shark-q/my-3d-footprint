import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";
import { supabaseAdmin } from "@/lib/supabase"; // 🟢 [新增] 引入 Supabase 管理工具

// 建议使用全局单例 Prisma 客户端，防止连接数过多 (可选优化)
const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 1. Find the internal User ID from the Clerk ID
        const user = await prisma.user.findUnique({
            where: { clerkId: userId }
        });

        if (!user) {
            return NextResponse.json({ photos: [] });
        }

        // 2. Find the journey using the internal User ID
        // 逻辑优化：优先找 "My Timeline"，找不到找最近的，再找不到就空
        let defaultJourney = await prisma.journey.findFirst({
            where: { userId: user.id, title: "My Timeline" }
        });

        if (!defaultJourney) {
            defaultJourney = await prisma.journey.findFirst({
                where: { userId: user.id },
                orderBy: { updatedAt: 'desc' }
            });
        }

        if (!defaultJourney) {
            return NextResponse.json({ photos: [] });
        }

        // 3. Get raw data from PostGIS
        // 注意：这里我们获取了原始数据，但还没有生成前端可用的图片链接
        const rawPhotos = await prisma.$queryRaw<any[]>`
            SELECT 
                id, 
                ST_X(location::geometry) as lng, 
                ST_Y(location::geometry) as lat, 
                "takenAt", 
                "s3Key", 
                "locationName", 
                "caption", 
                "aiDiaryText",
                "heading"
            FROM photo_nodes
            WHERE "journeyId" = ${defaultJourney.id}
            ORDER BY "takenAt" ASC
        `;

        // 🟢 [新增] 4. 为每张照片生成临时访问链接 (Signed URL)
        // 这一步至关重要，否则前端显示的图片会是 403 Forbidden
        const photos = await Promise.all(rawPhotos.map(async (p) => {
            let imgUrl = null;
            if (p.s3Key) {
                const { data } = await supabaseAdmin
                    .storage
                    .from('photos')
                    .createSignedUrl(p.s3Key, 3600); // 1小时有效期
                imgUrl = data?.signedUrl;
            }

            return {
                id: p.id,
                // 前端组件 MapboxView 需要 img, name, dateTime 等字段，这里做个映射
                img: imgUrl,
                name: p.caption || "未命名回忆", // 优先显示用户日记，没有则显示默认
                lat: p.lat,
                lng: p.lng,
                dateTime: p.takenAt,
                locationName: p.locationName,
                aiText: p.aiDiaryText, // 将 AI 生成的文字也返回给前端
                heading: p.heading
            };
        }));

        return NextResponse.json({
            journeyTitle: defaultJourney.title,
            photos: photos
        });

    } catch (error) {
        console.error("Error fetching photos:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { lat, lng, takenAt, s3Key, locationName, caption, heading } = body;

        let user = await prisma.user.findUnique({ where: { clerkId: userId } });

        // If user doesn't exist, create them
        if (!user) {
            const clerkUser = await currentUser();
            if (!clerkUser) {
                return NextResponse.json({ error: "Clerk user not found" }, { status: 404 });
            }
            const email = clerkUser.emailAddresses[0]?.emailAddress || `${userId}@no-email.com`;

            user = await prisma.user.create({
                data: { clerkId: userId, email: email, tier: "FREE" }
            });
        }

        let journey = await prisma.journey.findFirst({
            where: { userId: user.id, title: "My Timeline" }
        });

        if (!journey) {
            journey = await prisma.journey.create({
                data: { title: "My Timeline", userId: user.id, isPublic: false }
            });
        }

        // --- AI Analysis (Qwen) Logic ---
        let aiDiaryText = "";
        try {
            // 🟢 [新增] 关键步骤：生成一个临时链接给 AI 读取
            // AI 无法直接读取私有的 s3Key 路径，必须给它一个 HTTP URL
            let aiImageUrl = s3Key;
            if (!s3Key.startsWith("http")) {
                const { data } = await supabaseAdmin
                    .storage
                    .from('photos')
                    .createSignedUrl(s3Key, 300); // 5分钟有效，足够AI读取
                if (data?.signedUrl) {
                    aiImageUrl = data.signedUrl;
                }
            }

            // [保持不变] 你的 AI 提示词逻辑完全保留
            const SYSTEM_PROMPT = `
角色: 你是一位擅长捕捉时间与光影的散文家。
任务: 根据照片和提供的元数据，写一段极简的、充满回忆感的文案。

【严格遵守的格式标准】
1. 字数: 100字以内。
2. 结构: 
   - 第一行: 时间点(具体到分) + 地点 + 天气/光线。 (例如: "早晨八点十分，湘中，晴。")
   - 第二行: 描述画面中能印证这个时间的视觉细节(影子长短、晨雾、灯光色温等)。
   - 第三行: 一句关于时光、归途或传承的简短感悟。
3. 风格: 克制、真实、深情。
`;
            const locationInfo = locationName || `${lat}, ${lng}`;
            const weatherInfo = "未知天气"; // 后续可以接入天气 API
            const exifInfo = `
            【元数据参考】
            - 拍摄时间: ${takenAt}
            - 拍摄地点: ${locationInfo}
            - 当时天气: ${weatherInfo}
            `;

            const aiRes = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "qwen-vl-max",
                    messages: [
                        {
                            role: "system",
                            content: SYSTEM_PROMPT + "\n特别提示：请结合提供的【当时天气】信息，描述环境氛围（如空气的湿度、阳光的质感、风的触感）。"
                        },
                        {
                            role: "user",
                            content: [
                                { type: "text", text: `${exifInfo}\n请根据画面内容、地点以及天气氛围写出文案。` },
                                // 🟢 [修改] 这里传入生成的 URL，而不是原始 s3Key
                                { type: "image_url", image_url: { url: aiImageUrl } }
                            ]
                        }
                    ]
                })
            });

            if (aiRes.ok) {
                const aiData = await aiRes.json();
                aiDiaryText = aiData.choices?.[0]?.message?.content || "";
            } else {
                console.error("Qwen API Error:", await aiRes.text());
            }
        } catch (e) {
            console.error("AI Generation Failed:", e);
        }

        // --- Save to DB ---
        const id = crypto.randomUUID();
        const takenTime = new Date(takenAt).toISOString(); // 确保时间格式正确

        // 🟢 [优化] 使用更安全的变量插入方式（虽然 Prisma executeRaw 是安全的，但确保类型正确）
        await prisma.$executeRaw`
            INSERT INTO photo_nodes (
                "id", "location", "takenAt", "s3Key", "locationName", "caption", "aiDiaryText", "journeyId", "heading", "createdAt"
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
                ${heading !== undefined ? parseFloat(heading) : null},
                NOW()
            )
        `;

        return NextResponse.json({ success: true, id, aiDiaryText });

    } catch (error) {
        console.error("Error saving photo:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id, lat, lng } = body;

        if (!id || !lat || !lng) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 获取当前用户
        const user = await prisma.user.findUnique({
            where: { clerkId }
        });
        
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 验证照片所有权
        const photo = await prisma.photoNode.findFirst({
            where: { id }
        });

        if (!photo) {
            return NextResponse.json({ error: "Photo not found" }, { status: 404 });
        }

        // 通过 journey 验证所有权
        const journey = await prisma.journey.findFirst({
            where: { id: photo.journeyId, userId: user.id }
        });

        if (!journey) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Update using raw query for PostGIS
        await prisma.$executeRaw`
            UPDATE photo_nodes
            SET location = ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography
            WHERE id = ${id}
        `;

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error updating photo location:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing photo ID" }, { status: 400 });
        }

        // 获取当前用户
        const user = await prisma.user.findUnique({
            where: { clerkId }
        });
        
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 验证照片所有权
        const photo = await prisma.photoNode.findFirst({
            where: { id }
        });

        if (!photo) {
            return NextResponse.json({ error: "Photo not found" }, { status: 404 });
        }

        // 通过 journey 验证所有权
        const journey = await prisma.journey.findFirst({
            where: { id: photo.journeyId, userId: user.id }
        });

        if (!journey) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 删除记录
        await prisma.photoNode.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Error deleting photo:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}