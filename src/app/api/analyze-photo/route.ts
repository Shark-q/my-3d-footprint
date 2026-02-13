import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { image, exif, locationName, weather } = body;

        const locationInfo = locationName || `${exif.lat}, ${exif.lon}`;
        const weatherInfo = weather || "未知天气";

        const exifInfo = `
        【元数据参考】
        - 拍摄时间: ${exif.dateTime || '未知'}
        - 拍摄地点: ${locationInfo}
        - 当时天气: ${weatherInfo}
        `;

        // [Fix] Dashscope fails to download Supabase URLs (timeout/inspection error).
        // Solution: Download image on our server and send as Base64.
        let imageToSend = image;
        if (image && image.startsWith('http')) {
            try {
                console.log("Fetching image to convert to base64...");
                const imgRes = await fetch(image);
                if (imgRes.ok) {
                    const arrayBuffer = await imgRes.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                    imageToSend = `data:${contentType};base64,${base64}`;
                    console.log("Image converted to Base64 successfully.");
                } else {
                    console.warn(`Failed to fetch image: ${imgRes.status}`);
                }
            } catch (fetchErr) {
                console.error("Error fetching image for Base64 conversion:", fetchErr);
                // Fallback to sending original URL if fetch fails
            }
        }

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
                            {
                                type: "text",
                                text: `${exifInfo}\n请根据画面内容、地点以及天气氛围写出文案。`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageToSend
                                }
                            }
                        ]
                    }
                ]
            })
        });

        if (aiRes.ok) {
            const aiData = await aiRes.json();
            const text = aiData.choices?.[0]?.message?.content || "";
            return NextResponse.json({ text });
        } else {
            const errText = await aiRes.text();
            console.error("Qwen API Error:", errText);
            return NextResponse.json({ error: "AI Analysis Failed: " + errText }, { status: 500 });
        }

    } catch (error) {
        console.error("AI Analysis Error:", error);
        return NextResponse.json({ error: "AI Analysis Failed" }, { status: 500 });
    }
}
