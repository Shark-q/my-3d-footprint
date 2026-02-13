# 使用 Gemini 运行 Shannon 渗透测试

Shannon 官方推荐 Anthropic，但你也可以通过 **OpenRouter** 使用 **Google Gemini**。

---

## 📝 步骤 1: 获取 OpenRouter API Key

1. 访问 https://openrouter.ai/
2. 注册账号（可用 Google 账号登录）
3. 进入 Settings → API Keys
4. 创建新的 API Key

---

## 🔧 步骤 2: 配置 Router 模式

### 方法 A: 使用 Gemini（通过 OpenRouter）

```powershell
# 进入 Shannon 目录
cd C:\Users\view\my_app\html_2\BACK\shannon-test

# 设置环境变量
$env:OPENROUTER_API_KEY="sk-or-v1-your-openrouter-api-key"
$env:ROUTER_DEFAULT="openrouter,google/gemini-2.5-pro"

# 复制你的项目到 repos 目录
xcopy /E /I C:\Users\view\my_app\html_2\BACK\my-3d-footprint repos\my-3d-footprint

# 运行测试（使用 ROUTER=true 启动 router 服务）
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

### 方法 B: 直接使用 Google Gemini API

如果你有 Google AI Studio 的 API Key：

```powershell
$env:GOOGLE_API_KEY="your-google-ai-studio-key"
$env:ROUTER_DEFAULT="google,gemini-2.5-pro"

./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

---

## ⚙️ 步骤 3: 自定义 Router 配置（可选）

创建自定义配置文件 `configs/my-gemini-config.json`：

```json
{
  "HOST": "0.0.0.0",
  "APIKEY": "shannon-router-key",
  "LOG": true,
  "LOG_LEVEL": "info",
  "NON_INTERACTIVE_MODE": true,
  "API_TIMEOUT_MS": 600000,
  "Providers": [
    {
      "name": "openrouter",
      "api_base_url": "https://openrouter.ai/api/v1/chat/completions",
      "api_key": "$OPENROUTER_API_KEY",
      "models": [
        "google/gemini-2.5-pro",
        "google/gemini-2.5-flash",
        "google/gemini-2.0-pro"
      ],
      "transformer": {
        "use": ["openrouter"]
      }
    }
  ],
  "Router": {
    "default": "openrouter,google/gemini-2.5-pro"
  }
}
```

使用时指定配置：
```powershell
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint CONFIG=./configs/my-gemini-config.json ROUTER=true
```

---

## 💰 费用对比

| 模型 | 输入价格 (每1M tokens) | 输出价格 (每1M tokens) | 适合场景 |
|------|----------------------|----------------------|---------|
| **Claude 3.5 Sonnet** | $3 | $15 | 最佳推理能力，官方推荐 |
| **Gemini 2.5 Pro** | $1.25 | $10 | 性价比高，代码分析强 |
| **Gemini 2.5 Flash** | $0.15 | $0.60 | 最快最便宜，快速扫描 |
| **GPT-4o** | $2.50 | $10 | 备选方案 |

> 渗透测试通常消耗 **500K-2M tokens**，Gemini 可节省 **50-70%** 费用。

---

## 🚀 推荐配置

### 快速测试（低成本）
```powershell
$env:OPENROUTER_API_KEY="your-key"
$env:ROUTER_DEFAULT="openrouter,google/gemini-2.5-flash"
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

### 全面测试（高质量）
```powershell
$env:OPENROUTER_API_KEY="your-key"
$env:ROUTER_DEFAULT="openrouter,google/gemini-2.5-pro"
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

### 混合模式（平衡）
使用 Claude 做复杂分析，Gemini 做快速验证：
```powershell
$env:ANTHROPIC_API_KEY="anthropic-key"
$env:OPENROUTER_API_KEY="openrouter-key"
$env:ROUTER_DEFAULT="anthropic,claude-3-5-sonnet"
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

---

## 🐛 故障排除

### 1. Router 无法启动
```bash
# 检查环境变量是否正确设置
echo $env:OPENROUTER_API_KEY

# 手动启动 router 查看日志
docker-compose --profile router up router
```

### 2. API 调用失败
```bash
# 测试 OpenRouter API
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "google/gemini-2.5-pro", "messages": [{"role": "user", "content": "Hello"}]}'
```

### 3. 模型不可用
检查 OpenRouter 支持的模型列表：https://openrouter.ai/models

---

## 📊 性能对比

| 指标 | Claude 3.5 Sonnet | Gemini 2.5 Pro | Gemini 2.5 Flash |
|------|-------------------|----------------|------------------|
| **测试深度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **漏洞发现率** | 95% | 90% | 80% |
| **速度** | 中等 | 快 | 很快 |
| **成本** | 高 | 中 | 低 |
| **代码分析** | 优秀 | 优秀 | 良好 |

**建议**:
- **首次测试**: 使用 Claude 3.5 Sonnet 获得最佳结果
- **日常扫描**: 使用 Gemini 2.5 Pro 平衡成本和质量
- **快速验证**: 使用 Gemini 2.5 Flash 快速检查

---

## ✅ 验证配置

运行前检查：
```powershell
# 1. 检查环境变量
$env:OPENROUTER_API_KEY

# 2. 检查项目是否在 repos 目录
ls repos\my-3d-footprint

# 3. 确保项目正在运行
# 在另一个终端: npm run dev

# 4. 启动测试
./shannon start URL=http://host.docker.internal:3000 REPO=my-3d-footprint ROUTER=true
```

---

准备好使用 Gemini 测试了吗？首先去 https://openrouter.ai/ 获取 API Key！
