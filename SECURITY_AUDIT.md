# 安全审计报告

**审计日期**: 2026-02-13  
**项目**: My 3D Footprint

---

## 🚨 严重风险

### 1. 敏感信息泄露 (.env 文件)

**风险等级**: 🔴 **严重**

你的 `.env` 文件包含以下真实密钥：

| 服务 | 泄露内容 |
|------|---------|
| **Clerk** | Publishable Key + Secret Key (测试环境) |
| **Supabase** | 数据库连接字符串 (含密码) + Service Role Key |
| **Mapbox** | Public Token |
| **天气 API** | Visual Crossing API Key |
| **高德地图** | AMap Key |
| **阿里云** | Dashscope API Key |

**潜在风险**:
- 数据库被攻击者完全控制
- 用户数据泄露
- API 配额被盗用
- 产生意外费用

**修复措施**:
```bash
# 1. 立即轮换所有密钥
# 2. 检查 Git 历史是否泄露
# 3. 在 .env.example 中保留空模板，不要放真实值
```

---

## 🟡 中等问题

### 2. 调试日志泄露敏感信息

**位置**: `src/app/api/upload/presign/route.ts:14-15`

```typescript
console.log("🔍 [Debug] 收到请求，当前 UserID:", userId);
console.log("🔍 [Debug] 身份验证状态:", userId ? "✅ 已登录" : "❌ 未登录");
```

**风险**: 生产环境日志可能包含用户身份信息

**修复**:
```typescript
// 移除或改为条件编译
if (process.env.NODE_ENV === 'development') {
  console.log("Debug:", userId);
}
```

### 3. 缺少用户权限验证（IDOR 风险）

**位置**: `src/app/api/photos/route.ts:251-255`

```typescript
await prisma.$executeRaw`
    UPDATE photo_nodes
    SET location = ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography
    WHERE id = ${id}
`;
```

**风险**: 用户 A 可以修改用户 B 的照片位置（只要知道 ID）

**修复**:
```typescript
// 添加用户 ID 验证
await prisma.$executeRaw`
    UPDATE photo_nodes
    SET location = ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography
    WHERE id = ${id} AND "userId" = ${userId}
`;
```

### 4. 类似问题在其他 API 中

- `DELETE /api/photos` - 未验证照片所有权
- `PUT /api/photos` - 未验证照片所有权

---

## 🟢 低危问题

### 5. Console.log 过多

**影响**: 生产环境性能、日志存储成本

**建议**: 使用专业的日志库如 `pino` 或 `winston`

### 6. 缺少 CORS 配置

**文件**: 未发现全局 CORS 配置

**建议**: 
```typescript
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: 'your-domain.com' },
        ],
      },
    ];
  },
};
```

### 7. 缺少 Rate Limiting

**风险**: API 被滥用

**建议**: 使用 `rate-limiter-flexible` 或 Vercel 的 Edge Config

---

## ✅ 做得好

| 项目 | 状态 |
|------|------|
| 环境变量使用 | ✅ 使用 `process.env`，无硬编码 |
| SQL 注入防护 | ✅ 使用 Prisma 参数化查询 |
| XSS 防护 | ✅ 无 `dangerouslySetInnerHTML` |
| 认证 | ✅ 使用 Clerk，API 都验证 auth() |
| .gitignore | ✅ 正确排除了 .env 文件 |

---

## 📋 修复清单

### 立即执行
- [ ] 轮换所有 API 密钥
- [ ] 检查 Git 提交历史是否泄露密钥
- [ ] 为所有更新/删除操作添加用户权限验证

### 本周内
- [ ] 移除生产环境的 console.log
- [ ] 添加 CORS 配置
- [ ] 添加 API 速率限制

### 长期
- [ ] 启用 Supabase RLS (Row Level Security)
- [ ] 添加安全响应头 (CSP, HSTS)
- [ ] 配置 Sentry 错误监控

---

## 🔍 如何检查 Git 历史

```bash
# 检查 .env 是否曾被提交
git log --all --full-history --source --name-only -- .env

# 搜索历史中的密钥模式
git log -p --all | grep -i "sk_test\|eyJhbG\|postgresql://"

# 如果泄露，使用 BFG Repo-Cleaner 清理
git clone --mirror https://github.com/user/repo.git
cd repo.git
bfg --delete-files .env
bfg --replace-text passwords.txt
```

---

## 📚 安全建议

1. **使用 Vault**: 考虑使用 AWS Secrets Manager 或 HashiCorp Vault
2. **密钥轮换**: 每 90 天轮换一次密钥
3. **监控**: 启用异常登录/访问警报
4. **审计**: 定期（每季度）进行安全审计

---

*报告生成时间: 2026-02-13*  
*审计工具: 手动代码审查 + Grep 扫描*
