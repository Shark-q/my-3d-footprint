# Shannon AI 渗透测试使用指南

## 🔍 什么是 Shannon？

Shannon 是一个**完全自主的 AI 渗透测试工具**，它可以：
- 自动分析你的源代码寻找漏洞
- 在真实浏览器中执行攻击验证漏洞
- 生成包含复现步骤的渗透测试报告

**支持检测的漏洞类型**：
- SQL 注入
- XSS (跨站脚本)
- SSRF (服务器端请求伪造)
- 身份验证/授权绕过
- 更多 OWASP Top 10 漏洞

---

## 📋 前置要求

### 1. 安装 Docker
确保已安装 Docker Desktop：
```bash
docker --version
```

### 2. 获取 API Key

需要 Anthropic API Key（推荐）：
1. 访问 https://console.anthropic.com/
2. 注册账号
3. 创建 API Key

或者使用 Claude Code OAuth Token

---

## 🚀 测试你的项目

### 步骤 1: 准备环境

```bash
# 进入 Shannon 目录
cd C:\Users\view\my_app\html_2\BACK\shannon-test

# 复制项目代码到 repos 目录
xcopy /E /I C:\Users\view\my_app\html_2\BACK\my-3d-footprint repos\my-3d-footprint
```

### 步骤 2: 配置 API Key

**方式 A - 环境变量（推荐）:**
```powershell
$env:ANTHROPIC_API_KEY="your-api-key-here"
```

**方式 B - .env 文件:**
```bash
cat > .env << 'EOF'
ANTHROPIC_API_KEY=your-api-key-here
EOF
```

### 步骤 3: 运行渗透测试

**测试本地开发服务器:**
```bash
# 先启动你的项目
npm run dev

# 然后运行 Shannon（使用 host.docker.internal 访问本地服务）
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint
```

**测试生产环境:**
```bash
./shannon start URL=https://your-domain.com REPO=my-3d-footprint
```

### 步骤 4: 监控进度

```bash
# 查看实时日志
./shannon logs

# 查询特定工作流进度
./shannon query ID=shannon-xxxxxxxxxx

# 打开 Web UI 查看详细进度
start http://localhost:8233
```

### 步骤 5: 查看报告

测试完成后，报告会保存在 `./audit-logs/` 目录下。

---

## ⚙️ 高级配置（可选）

### 使用配置文件

创建 `configs/my-config.yaml`:

```yaml
# 扫描深度
depth: comprehensive  # 或 quick, standard

# 指定要测试的漏洞类型
vulnerabilities:
  - injection
  - xss
  - ssrf
  - auth_bypass

# 排除路径
exclude:
  - node_modules
  - .next
  - public/geojson

# 认证配置（如果需要测试登录后的功能）
authentication:
  type: clerk
  email: test@example.com
  password: your-password
```

运行时使用配置:
```bash
./shannon start URL=https://your-app.com REPO=my-3d-footprint CONFIG=./configs/my-config.yaml
```

### 自定义输出目录

```bash
./shannon start URL=https://your-app.com REPO=my-3d-footprint OUTPUT=./my-security-reports
```

---

## 🛡️ 针对你的项目的测试建议

### 重点测试区域

基于你的项目结构，建议重点关注：

| 组件 | 测试重点 |
|------|---------|
| **文件上传** (`/api/upload/*`) | 文件类型绕过、恶意文件上传 |
| **照片 API** (`/api/photos/*`) | IDOR (不安全的直接对象引用)、权限绕过 |
| **地理编码** (`/api/geocode`) | SSRF、注入攻击 |
| **AI 分析** (`/api/analyze-photo`) | 提示注入、API 密钥泄露 |
| **数据库操作** | SQL 注入 (虽然使用 Prisma，但仍需验证) |
| **认证流程** | JWT 绕过、会话固定攻击 |

### 白盒测试优势

Shannon 会分析你的源代码，特别关注：
- 我们刚才修复的权限验证逻辑
- 文件上传处理
- 数据库查询构造
- 外部 API 调用

---

## 📊 理解报告

### 漏洞等级

- 🔴 **Critical** - 立即修复（如：数据库泄露、完全身份绕过）
- 🟠 **High** - 24小时内修复（如：敏感数据泄露）
- 🟡 **Medium** - 一周内修复（如：信息泄露）
- 🟢 **Low** - 计划修复（如：安全头缺失）

### 报告包含

每个漏洞都会提供：
1. **漏洞描述** - 是什么问题
2. **影响范围** - 危害程度
3. **复现步骤** - 一步步如何触发
4. **修复建议** - 如何修复
5. **代码位置** - 具体文件和行号

---

## ⚠️ 重要提示

1. **仅在授权环境下测试** - 不要测试不属于你的网站
2. **测试前备份数据** - 渗透测试可能修改数据
3. **使用测试账号** - 不要用真实用户数据测试
4. **网络隔离** - 建议在隔离环境运行

---

## 🔗 相关链接

- Shannon 文档: https://github.com/KeygraphHQ/shannon
- 示例报告: ./sample-reports/
- 覆盖率说明: ./COVERAGE.md

---

## 🆘 故障排除

### Docker 权限问题
```bash
# Linux/Mac 可能需要 sudo
sudo ./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint
```

### 连接不到本地服务
确保使用 `host.docker.internal` 而不是 `localhost`:
```bash
# ❌ 错误
./shannon start URL=http://localhost:3000 REPO=my-3d-footprint

# ✅ 正确
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint
```

### API Key 无效
检查环境变量是否正确设置:
```bash
echo $ANTHROPIC_API_KEY  # Linux/Mac
$env:ANTHROPIC_API_KEY    # PowerShell
```

---

准备好开始测试了吗？首先确保你有 Anthropic API Key！
