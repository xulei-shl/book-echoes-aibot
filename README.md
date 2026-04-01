This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.



1. 构建内容数据:
   - `sources_data` 目录与 `public/content` 结构保持一致，例如:
     ```
     sources_data/
       2025/
         2025-09/
         new/          # 睡美人
           新书推荐/
         subject/      # 主题卡
           科幻/
     ```
   - 常用脚本命令:
     ```
     node scripts/build-content.mjs 2025-08
     node scripts/build-content.mjs month 2025-09
     node scripts/build-content.mjs sleeping 2025 "2025-06"
     node scripts/build-content.mjs subject 2025 middle-class-status
     node scripts/build-content.mjs literature 2025 Survival-Literature-for-Metro
     ```

2. # 运行字体初始化脚本
npm run init-fonts

运行脚本后，按照输出的 CSS 示例更新 app/globals.css，将字体 URL 替换为 R2 地址即可完成字体 Web 化！

---

类似网站

https://goodbooks.io/

---

## 生产环境部署最佳实践

### 1. 环境配置

复制配置文件并按需修改：
```bash
cp .env.example .env
cp .env.local.example .env.local
```

### 2. 安装依赖与构建

```bash
npm install
npm run build
```

### 3. systemd 服务部署

创建服务文件 `/etc/systemd/system/book-echoes.service`：

```ini
[Unit]
Description=Book Echoes Aibot Next.js App
After=network.target

[Service]
User=xulei
Group=xulei
WorkingDirectory=/opt/book-echoes-aibot
ExecStart=/usr/local/bin/node node_modules/next/dist/bin/next start
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

启动服务：
```bash
systemctl daemon-reload
systemctl enable book-echoes.service
systemctl start book-echoes.service
```

### 4. 常用命令

```bash
systemctl status book-echoes.service    # 查看状态
systemctl restart book-echoes.service   # 重启
journalctl -u book-echoes -n 50         # 查看日志
```

### 5. 注意事项

- `.env` 和 `.env.local` 包含敏感密钥，已加入 `.gitignore`，勿提交到 Git
- 仅提交 `.env.example` 和 `.env.local.example` 作为配置模板
