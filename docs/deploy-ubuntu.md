# 书海回响 — Ubuntu 部署与维护指南

## 目录

1. [环境要求](#1-环境要求)
2. [首次部署](#2-首次部署)
3. [日常维护](#3-日常维护)
4. [更新代码与重启](#4-更新代码与重启)
5. [日志查看](#5-日志查看)
6. [故障排查](#6-故障排查)

---

## 1. 环境要求

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18.18 (推荐 v22 LTS) | `/usr/local/bin/node` |
| npm | 随 Node.js 自带 | 使用 `package-lock.json` 锁定版本 |
| 系统 | Ubuntu 20.04+ | systemd 管理服务 |

确认当前版本：

```bash
node -v    # 应 >= v18.18
npm -v
```

---

## 2. 首次部署

### 2.1 克隆项目

```bash
git clone <仓库地址> /opt/book-echoes-aibot
cd /opt/book-echoes-aibot
```

### 2.2 配置环境变量

```bash
cp .env.example .env
cp .env.local.example .env.local
```

编辑 `.env` 和 `.env.local`，填入实际值：

**`.env` — R2 存储配置**

| 变量 | 说明 |
|------|------|
| `R2_ENDPOINT` | Cloudflare R2 存储端点 |
| `R2_BUCKET_NAME` | 存储桶名称 |
| `R2_ACCESS_KEY_ID` | 访问密钥 ID |
| `R2_SECRET_ACCESS_KEY` | 访问密钥 |
| `R2_PUBLIC_URL` | 公开访问域名 |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | 前端直连地址 |

**`.env.local` — LLM / AI 配置**

| 变量 | 说明 |
|------|------|
| `AIBOT_LLM_PRIMARY_BASE_URL` | 主模型 API 地址 |
| `AIBOT_LLM_PRIMARY_API_KEY` | 主模型 API 密钥 |
| `AIBOT_LLM_PRIMARY_MODEL` | 主模型名称 |
| `AIBOT_LLM_SECONDARY_*` | (可选) 备用模型 |
| `JINA_API_KEY` | (可选) 深度搜索 |
| `TAVILY_API_KEY` | (可选) 网络搜索 |
| `BOOK_API_BASE_URL` | 图书检索 API 地址 |

### 2.3 安装依赖并构建

```bash
npm install
npm run build
```

首次构建会生成 `.next/` 目录，包含生产环境所需的静态文件与服务端代码。

### 2.4 配置 systemd 服务

创建服务文件 `/etc/systemd/system/book-echoes.service`：

```ini
[Unit]
Description=Book Echoes Aibot Next.js App
After=network.target

[Service]
User=xulei
Group=xulei
WorkingDirectory=/opt/book-echoes-aibot
ExecStart=/usr/local/bin/node /opt/book-echoes-aibot/node_modules/next/dist/bin/next start
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=book-echoes

[Install]
WantedBy=multi-user.target
```

> **注意：** `User`/`Group` 需改为实际运行用户。如果以 root 运行，删除这两行或改为 `User=root`。

### 2.5 启动服务

```bash
systemctl daemon-reload
systemctl enable --now book-echoes.service
systemctl status book-echoes.service
```

验证服务运行正常后，访问 `http://<服务器IP>:3000`。

---

## 3. 日常维护

### 3.1 服务启停

```bash
sudo systemctl start book-echoes    # 启动
sudo systemctl stop book-echoes     # 停止
sudo systemctl restart book-echoes  # 重启
sudo systemctl status book-echoes   # 查看状态
```

### 3.2 查看运行状态

```bash
systemctl status book-echoes.service
```

输出示例：

```
● book-echoes.service - Book Echoes Aibot Next.js App
     Loaded: loaded (/etc/systemd/system/book-echoes.service; enabled; preset: enabled)
     Active: active (running) since Sun 2026-07-26 09:23:34 CST; 3s ago
   Main PID: 999553 (next-server)
     Tasks: 15 (limit: 14080)
     Memory: 112.6M (peak: 112.9M)
```

---

## 4. 更新代码与重启

代码更新后需要重新构建并重启服务，使新代码生效。

### 4.1 标准流程

```bash
# 1. 拉取最新代码（如果使用 git）
cd /opt/book-echoes-aibot
git pull

# 2. 安装新依赖（如有变更）
npm install

# 3. 重新构建
npm run build

# 4. 设置 .next 目录权限（如果运行用户非 root）
chown -R xulei:xulei .next

# 5. 重启服务
sudo systemctl restart book-echoes.service

# 6. 验证
sudo systemctl status book-echoes.service
```

### 4.2 快速重启（仅重启，不更新代码）

```bash
sudo systemctl restart book-echoes.service
```

### 4.3 完整重建（清理后重装）

```bash
cd /opt/book-echoes-aibot
rm -rf .next node_modules
npm install
npm run build
chown -R xulei:xulei .next
sudo systemctl restart book-echoes.service
```

---

## 5. 日志查看

```bash
# 查看最近 50 条日志
journalctl -u book-echoes -n 50

# 实时跟踪日志
journalctl -u book-echoes -f

# 查看某段时间的日志
journalctl -u book-echoes --since "5 min ago"

# 仅查看错误级别日志
journalctl -u book-echoes -p err

# 清空日志
sudo journalctl --rotate
sudo journalctl --vacuum-time=1s
```

---

## 6. 故障排查

### 6.1 服务启动失败

```bash
systemctl status book-echoes.service
journalctl -u book-echoes -n 50 --no-pager
```

常见原因：

- **端口被占用：** `lsof -i :3000` 检查，`kill` 旧进程后重试
- **权限问题：** `.next/` 目录属主与服务运行用户不一致 → `chown -R <user>:<group> .next`
- **构建失败：** 单独运行 `npm run build` 查看详细错误
- **环境变量缺失：** 检查 `.env` 和 `.env.local` 是否已正确配置

### 6.2 端口冲突

```bash
# 查看 3000 端口占用情况
ss -tlnp | grep :3000
# 或
lsof -i :3000
```

### 6.3 构建错误

```bash
cd /opt/book-echoes-aibot
npm run build 2>&1
```

检查 TypeScript 错误、ESLint 错误或依赖缺失。

### 6.4 磁盘空间不足

```bash
df -h
du -sh /opt/book-echoes-aibot/.next
du -sh /opt/book-echoes-aibot/node_modules
```

可清理 `node_modules` 后重装：`rm -rf node_modules && npm install`。

---

## 附录

### 项目目录结构

```
/opt/book-echoes-aibot/
├── .env              # R2 存储配置（不提交 git）
├── .env.local        # LLM/AI 配置（不提交 git）
├── .next/            # 构建产物（自动生成）
├── app/              # Next.js App Router 页面
├── components/       # React 组件
├── lib/              # 工具库
├── store/            # Zustand 状态管理
├── types/            # TypeScript 类型定义
├── scripts/          # 构建脚本
├── public/           # 静态资源
├── tests/            # 测试
├── package.json
├── next.config.ts
└── tsconfig.json
```

### 常用命令速查

```bash
npm run dev          # 开发模式（port 3000）
npm run build        # 生产构建
npm run start        # 启动生产服务
npm run lint         # 代码检查
npm run test         # 运行测试
npm run init-fonts   # 初始化字体
```

### 系统服务管理

```bash
sudo systemctl daemon-reload                    # 重载服务配置
sudo systemctl enable book-echoes.service       # 设置开机自启
sudo systemctl disable book-echoes.service      # 取消开机自启
sudo systemctl restart book-echoes.service      # 重启
sudo systemctl stop book-echoes.service         # 停止
sudo systemctl start book-echoes.service        # 启动
```