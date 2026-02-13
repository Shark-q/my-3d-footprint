# 阿里云服务器部署指南

**服务器配置**: 2核2G 香港服务器  
**部署方式**: 自托管 (Node.js + PM2 + Nginx)

---

## 📋 服务器环境准备

### 1. 连接服务器

```bash
# Windows PowerShell 或 Git Bash
ssh root@你的服务器IP

# 或使用密钥
ssh -i ~/.ssh/aliyun.pem root@你的服务器IP
```

### 2. 安装必要软件

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 20
 curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 验证安装
node -v  # v20.x.x
npm -v   # 10.x.x

# 安装 PM2（进程管理器）
npm install -g pm2

# 安装 Nginx
apt install -y nginx

# 安装 Git
apt install -y git

# 安装 Docker（可选，用于数据库）
curl -fsSL https://get.docker.com | sh
```

---

## 🚀 部署步骤

### 步骤 1: 上传代码到服务器

**方式 A - Git 克隆（推荐）**:
```bash
# 在服务器上
cd /var/www
git clone https://github.com/你的用户名/my-3d-footprint.git
cd my-3d-footprint
```

**方式 B - 本地打包上传**:
```bash
# 在本地（PowerShell）
# 1. 先提交到 GitHub
# 2. 然后在服务器上克隆

# 或者使用 scp 上传
scp -r C:\Users\view\my_app\html_2\BACK\my-3d-footprint root@服务器IP:/var/www/
```

### 步骤 2: 安装依赖

```bash
cd /var/www/my-3d-footprint
npm ci --only=production
```

### 步骤 3: 配置环境变量

```bash
# 创建环境变量文件
nano .env
```

填入生产环境的密钥（⚠️ 必须是新的生产密钥）：
```env
# 1. Clerk 生产环境密钥
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# 2. Supabase 生产环境
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# 3. 其他 API 密钥（全部用新的）
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...
AMAP_KEY=...
DASHSCOPE_API_KEY=sk-...
WEATHER_API_KEY=...
```

保存：`Ctrl+O`，回车，`Ctrl+X`

### 步骤 4: 数据库迁移

```bash
# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy
```

### 步骤 5: 构建项目

```bash
npm run build
```

### 步骤 6: 使用 PM2 启动

```bash
# 创建 PM2 配置文件
nano ecosystem.config.js
```

内容：
```javascript
module.exports = {
  apps: [{
    name: 'my-3d-footprint',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/my-3d-footprint',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/my-3d-footprint/err.log',
    out_file: '/var/log/my-3d-footprint/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_memory_restart: '1G'
  }]
};
```

创建日志目录：
```bash
mkdir -p /var/log/my-3d-footprint
```

启动：
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 🌐 Nginx 配置（反向代理 + HTTPS）

### 步骤 1: 配置 Nginx

```bash
nano /etc/nginx/sites-available/my-3d-footprint
```

内容：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 你的域名或服务器IP

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：
```bash
ln -s /etc/nginx/sites-available/my-3d-footprint /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 步骤 2: 配置 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
apt install -y certbot python3-certbot-nginx

# 申请证书
certbot --nginx -d your-domain.com

# 自动续期测试
certbot renew --dry-run
```

---

## 🔥 防火墙配置

```bash
# 开放必要端口
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# 检查状态
ufw status
```

---

## 📊 监控和维护

### PM2 管理命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs my-3d-footprint

# 重启
pm2 restart my-3d-footprint

# 停止
pm2 stop my-3d-footprint

# 删除
pm2 delete my-3d-footprint
```

### 更新部署

```bash
cd /var/www/my-3d-footprint

# 拉取最新代码
git pull origin main

# 安装新依赖
npm ci --only=production

# 数据库迁移
npx prisma migrate deploy

# 重新构建
npm run build

# 重启 PM2
pm2 restart my-3d-footprint
```

---

## ⚠️ 重要提醒

### 1. 部署前必做
- [ ] 生成新的生产环境 API 密钥
- [ ] 更新 `.env` 文件
- [ ] 确认 `.env` 不在 Git 中
- [ ] 测试构建通过

### 2. 安全设置
- [ ] 修改 SSH 默认端口（22 → 其他）
- [ ] 禁用 root 登录
- [ ] 设置防火墙规则
- [ ] 定期更新系统

### 3. 备份
```bash
# 备份数据库
# 在 Supabase 控制台导出
# 或使用 pg_dump
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## 🆘 故障排除

### 1. 网站无法访问
```bash
# 检查 PM2 状态
pm2 status

# 检查端口占用
netstat -tlnp | grep 3000

# 检查 Nginx 错误
journalctl -u nginx -n 50
```

### 2. 内存不足（2G 服务器）
```bash
# 添加 Swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3. 502 Bad Gateway
```bash
# 检查 Next.js 是否运行
curl http://localhost:3000

# 检查 PM2 日志
pm2 logs
```

---

## 💡 优化建议（2G 服务器）

1. **启用 Swap** - 防止内存不足
2. **限制 PM2 内存** - 配置 `max_memory_restart: '1G'`
3. **定期重启** - 添加定时任务 `0 4 * * * pm2 restart my-3d-footprint`
4. **监控内存** - 安装 `htop` 查看资源使用

---

## 🎯 部署流程总结

```
1. 连接服务器
2. 安装 Node.js + PM2 + Nginx
3. 上传代码（Git 克隆）
4. 配置 .env（生产密钥）
5. 安装依赖 + 构建
6. 数据库迁移
7. PM2 启动
8. Nginx 配置
9. HTTPS 证书
10. 防火墙设置
```

**预计时间**: 30-60 分钟

---

准备好开始部署了吗？需要我详细解释哪一步？
