# easy-web

石行的双语个人网站。网站已从 VitePress 迁移到 Next.js App Router，并采用：

- Vercel 托管与自动部署
- Cloudflare DNS、TLS 和边缘防护
- GitHub App 作为内容写入身份
- Git 仓库中的 Markdown 作为内容源

旧版 `docs/` 内容暂时保留，便于核对和回滚；运行时只读取 `content/`。

## 本地开发

需要 Node.js 20.9 或更高版本：

```bash
npm ci
cp .env.example .env.local
npm run dev
```

访问 `http://localhost:3000/zh-cn`。管理入口位于 `/admin`。

## 内容结构

```text
content/
├── posts/
│   ├── zh-cn/
│   └── en/
├── pages/
├── index.json
├── pages.json
└── redirects.json
```

重新从旧 VitePress 内容生成新内容：

```bash
npm run content:migrate
```

迁移脚本会保留旧链接映射。不要在生产内容已经通过管理台修改后再次无审查运行迁移，因为它会以旧 `docs/` 为输入重新生成索引。

## GitHub App

创建一个仅安装到 `uudon/easy-web` 的 GitHub App，并授予：

- Repository contents: Read and write
- Metadata: Read-only

不需要 Webhook。生成 Private Key 后，将 `.env.example` 中的服务端变量配置到 Vercel；Private Key 绝不能使用 `NEXT_PUBLIC_` 前缀，也不能提交到仓库。

生成后台密码哈希：

```bash
npm run admin:hash -- "your-long-password"
```

预览环境保持 `ENABLE_CONTENT_WRITES=false`。仅在生产域名、GitHub App 权限和回滚流程验证后，把生产环境设为 `true`。

## 验证

```bash
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

## 部署

Vercel 项目使用默认 Next.js 配置即可。将 GitHub 仓库连接到 Vercel，先部署迁移分支作为 Preview；验收完成后再合并到 `main` 并配置生产环境变量。

Cloudflare 中建议先使用 DNS-only：

1. 根域名使用 Vercel 提供的 A 记录。
2. `www` 使用 Vercel 提供的 CNAME。
3. 在 Vercel 确认证书和域名状态正常。
4. 验证 HTTP、HTTPS、旧链接跳转和 `/admin` 后，再按需打开 Cloudflare 代理。

DNS 切换前不要删除原腾讯云部署；它是迁移期间的回滚入口。

## 容器回退

Vercel 是主部署方式。仓库仍提供基于 Next.js standalone 输出的容器配置，供本地或故障回退使用：

```bash
docker compose up -d --build
```

容器监听 `http://localhost:3000`。
