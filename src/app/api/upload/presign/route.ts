// src/app/api/upload/presign/route.ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    // ✅ 修复点：Clerk 新版本必须加 await
    const { userId } = await auth();

    // === Debug 日志 (仅开发环境) ===
    if (process.env.NODE_ENV === 'development') {
      console.log("🔍 [Debug] 收到请求，当前 UserID:", userId);
    }
    // ==================

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. 获取请求体
    const { fileType } = await req.json();
    
    // 3. 确保用户在数据库中存在
    const user = await currentUser();
    const email = user?.emailAddresses[0]?.emailAddress || "";
    
    const dbUser = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email: email,
        tier: "FREE"
      }
    });

    // 4. 检查配额
    const MAX_FREE_BYTES = 500 * 1024 * 1024;
    if (dbUser.tier === 'FREE' && Number(dbUser.storageUsed) >= MAX_FREE_BYTES) {
      return NextResponse.json(
        { error: "存储空间已满" }, 
        { status: 403 }
      );
    }

    // 5. 生成文件名
    const fileExt = fileType.split('/')[1] || 'jpg';
    const fileName = `${userId}/${uuidv4()}.${fileExt}`;

    // 6. 申请 Supabase 签名 URL
    const { data, error } = await supabaseAdmin
      .storage
      .from('photos')
      .createSignedUploadUrl(fileName);

    if (error) throw error;

    // 7. 返回结果
    return NextResponse.json({ 
      url: data.signedUrl, 
      path: data.path,     
      token: data.token    
    });

  } catch (error) {
    console.error("Upload Presign Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}