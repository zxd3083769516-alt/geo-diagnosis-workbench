# GEO 诊断工作台

面向本地企业与 GEO 服务人员的运营工作台，覆盖品牌事实、问题库、独立 AI 可见度测试、原始回答与引用、人工审核、缺口诊断、优化行动、实验复测和月度跟踪。

此仓库保存 2026-10-21 已确认版本的源码快照，来源提交 `0ab40cf1c959f043bd82ace1a1113af1ebec2e87`。业务代码保持原样；没有复制原仓库历史、线上客户数据、测试回答、API 密钥或现有 Sites 项目标识。上传 GitHub 不会改变当前线上站点。

## 技术与目录

- React 19、TypeScript、Vinext/Vite、Tailwind CSS 4。
- `app/`：页面与服务端 API；`components/`：工作台界面。
- `lib/`：平台适配、联网证据、评分、人工版本与存储。
- `db/`、`drizzle/`：数据库结构与迁移；`scripts/`：检查和 Worker 包装。
- 开发工作区使用 SQLite；现有生产部署使用 Cloudflare Worker/D1 与 Sites 身份转发。

## 本地运行

需要 Node.js **22.13.0 或更高版本**及支持当前 `pnpm-lock.yaml` 的 pnpm。只使用这份锁文件安装依赖：

```sh
pnpm install --frozen-lockfile
```

生成本机独立的密钥保险箱密钥；以下命令仅创建不存在的文件，不覆盖已有配置。生成值不要提交到 Git：

```sh
node -e "require('node:fs').writeFileSync('.dev.vars', 'GEO_KEYRING_SECRET=' + require('node:crypto').randomBytes(32).toString('hex') + '\n', {flag:'wx'})"
```

Sites 插件构建时需要本地 `.openai/hosting.json`。先复制示例；其中的占位项目 ID 只用于准备构建，不可直接发布：

```sh
node -e "require('node:fs').copyFileSync('.openai/hosting.example.json', '.openai/hosting.json', require('node:fs').constants.COPYFILE_EXCL)"
pnpm dev
```

使用终端显示的本地地址。开发服务器绑定 `127.0.0.1`；本地数据保存在 `.local-data/geo.sqlite`，首次启动会按顺序应用 `drizzle/*.sql`。本地数据与线上数据库相互独立。

在“平台与连接”中配置各平台 API Key。密钥由服务端加密后保存在当前浏览器的 HttpOnly Cookie 中，有效期 30 天；清除 Cookie、更换浏览器、密钥过期或更换 `GEO_KEYRING_SECRET` 后需重新保存。密钥不随客户备份导出。

联网测试需要对应平台的 API、模型、搜索服务权限及余额。“测试连接”不代表联网验证通过；请使用“验证联网”，并检查实际搜索证据。普通回答链接不能单独证明搜索发生。API 输出不保证与消费端 App 完全一致。

## 验证与构建

```sh
pnpm test
node scripts/check-content-edits.mjs
node scripts/check-everyday-questions.mjs
pnpm build
node scripts/check-worker.mjs
```

`pnpm test` 使用模拟平台响应与隔离数据库，验证请求隔离、联网证据、原始回答、人工版本保护、评分、导出和持久化；**不代表真实外部平台已联网成功**。`check-worker` 在构建后验证本地 Worker/D1 的实际路由与身份隔离。

真实联网检查脚本 `scripts/live-native-search.mjs` 从当前进程的 `GEO_LIVE_TEST_KEY` 读取密钥，将诊断结果写入被忽略的 `verification/`。这些结果可能含业务内容，不应提交到仓库。

## 部署边界

本项目包含服务端 API、流式模型调用和数据库，**不能仅用 GitHub Pages 运行完整系统**。此仓库没有自动部署工作流，推送源码不会自动更新现有 Sites 站点。

沿用 Sites 部署时，需要由项目所有者重新配置 `.openai/hosting.json` 中的真实项目 ID，并绑定 D1 `DB`、应用全部 `drizzle/*.sql` 迁移、设置服务端 `GEO_KEYRING_SECRET`（至少 32 个字符）。旧式邮箱身份转发还需要 `GEO_OWNER_EMAIL` 与 `GEO_OWNER_ID`；可选的 `OPENAI_API_KEY`、`OPENAI_MODEL` 只供现有内容优化接口的服务端回退使用，不替代测试平台配置。

`lib/geo-identity.ts` 依赖 **可信 Sites 网关**注入的身份头。若迁移到普通 Cloudflare Worker 或其他主机，必须先接入可靠登录和身份验证，并拒绝客户端伪造这些身份头；不能直接将当前 Worker 暴露为无保护公共服务。`vite.config.ts` 内的 D1 UUID 是本地占位值，不能当作线上数据库 ID 使用。

生产环境需通过宿主的 Secret 管理设置密钥，不把 `.dev.vars` 上传为公开资源。`scripts/wrap-sites-worker.mjs` 保留现有 Worker 的绑定桥接逻辑。

## 当前限制与文档

- 批量执行由当前浏览器页面协调；保持页面打开。刷新或关闭页面可能中断队列，可继续待执行任务或建立新的重试 Run。
- 模型与工具权限会随平台变化。Kimi 旧 `$web_search` 适配保留在代码中，供应商已公告旧能力停用；不能据此保证当前账号可用。
- `GEO-OPERATIONS.md` 和 `docs/native-search-v2.md` 保留早期实现记录，其中部分模型、验证数量和部署描述具有历史时效性；当前行为以代码和本仓库说明为准。
- `.gitignore` 排除本地数据库、浏览器/连接凭据、客户导出、验证回答和构建产物。测试代码中的示例品牌与假密钥仅为隔离测试数据。
