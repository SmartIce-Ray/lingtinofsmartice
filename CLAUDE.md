# Lingtin - 语音智能管理平台

## 产品定位

餐饮行业语音智能管理平台，以消费者反馈驱动管理闭环：**说了 → 记了 → 做了 → 验了**。当前阶段聚焦**店长单店闭环**（桌访录音 + AI 分析 + 行动建议）。

> 完整产品定义见 [docs/PRD.md](docs/PRD.md)，开发规范见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 技术栈

- **前端**: Next.js 14 + PWA + Tailwind CSS + SWR
- **后端**: NestJS (Node.js)
- **数据库**: Supabase (PostgreSQL)
- **AI**: 讯飞 STT (方言大模型) + Gemini / Claude SDK
- **存储**: Supabase Storage
- **认证**: Supabase Auth + JWT

## 项目结构

```
lingtin/
├── apps/
│   ├── web/                          # Next.js 前端 (@lingtin/web)
│   │   ├── app/
│   │   │   ├── (main)/              # 店长端 (recorder/, dashboard/, chat/)
│   │   │   ├── admin/               # 管理端
│   │   │   └── login/
│   │   ├── components/              # UI 组件 (recorder/, chat/, layout/)
│   │   ├── hooks/                   # useAudioRecorder, useRecordingStore, useMeetingStore, useChatStream
│   │   ├── contexts/                # AuthContext, SWRProvider
│   │   └── lib/                     # api.ts, backgroundProcessor.ts, supabase/
│   └── api/                          # NestJS 后端 (@lingtin/api)
│       └── src/
│           ├── modules/             # audio/, auth/, chat/, dashboard/, staff/
│           └── common/              # Supabase 客户端, 工具函数
├── packages/                         # 共享包
├── docs/                             # 产品 & 开发文档
└── pnpm-workspace.yaml               # Monorepo 配置
```

## 常用命令

```bash
pnpm dev              # 同时启动前端 + 后端
pnpm dev:web          # 仅前端 (localhost:3000)
pnpm dev:api          # 仅后端 (localhost:3001)
pnpm build:web        # 构建前端
pnpm build:api        # 构建后端
supabase start        # 启动本地 Supabase (localhost:54321)
# 注意: zsh 下路径含 (main) 等括号时必须加引号，否则 glob 报错
# 注意: sw.js 是 PWA build 产物（pnpm build:web 生成），改动前端后需一起提交
```

## 开发规范摘要

- **迭代开发，不是重构** — 在现有代码基础上渐进增强，不做大规模重写
- **TypeScript strict mode**，避免 `any`
- **文件名** kebab-case，**组件名** PascalCase
- **NestJS 模块**：module + controller + service 三件套
- **数据库表** `lingtin_` 前缀，UUID 主键，TIMESTAMPTZ 时间，启用 RLS
- **Git commit**：`feat|fix|docs|refactor(scope): description`
- **API 响应**：统一 `{ data, message }` 格式
- **认证 header**: 使用 `@/contexts/AuthContext` 导出的 `getAuthHeaders()`，不要在页面中重复定义
- **Supabase UUID 查询**：所有 service 方法中 `restaurant_id` 参数必须做 UUID 校验，非法值回退 `DEFAULT_RESTAURANT_ID`
- **产品使用指南同步更新** — 每次功能迭代后，同步更新 `docs/user-guides/` 对应角色的手册（店长/管理层/店员），记录功能变更与最佳实践

> 详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## 上下文管理

IMPORTANT: 遵守以下规则防止上下文过长导致指令丢失：

- **读文件前先想清楚** — 只读与当前任务相关的文件，不要一次性读取整个目录
- **优先用 Grep/Glob** — 搜索定位后再精确读取，避免大面积扫描
- **大文件用 offset/limit** — 读取超过 300 行的文件时，使用分段读取
- **长任务用 Task 子代理** — 探索、搜索、代码审查等操作委托给子代理，防止主对话膨胀
- **每次只改一个功能** — 不要在一轮对话中同时处理多个不相关的功能
- **回复保持简洁** — 给出关键信息即可，不要重复粘贴大段代码
- **用 /compact 保留重点** — 上下文接近上限时，使用 `/compact` 并指定保留重点

## 协作工作流

- **本地开发**: `supabase start` + `pnpm dev` → 本地测试
- **数据库变更**: SQL 迁移文件放 `supabase/migrations/`，由 Jeremy 在线上 Supabase 执行
- **发布流程**: 本地测试通过 → push/PR 给 Jeremy → Jeremy 负责线上部署
- **不要直接操作线上 Supabase 数据库**
- **Git remotes**: `origin` = 上游 (jeremydong22)，`fork` = 贡献者 (SmartIce-Ray)。push 用 `fork`，PR 目标 `origin/main`

## 外部服务文档

| 服务 | 文档链接 | 说明 |
|------|----------|------|
| 讯飞方言大模型 | https://www.xfyun.cn/doc/spark/spark_slm_iat.html | STT语音识别，支持202种方言自动识别 |
| 讯飞开放平台控制台 | https://console.xfyun.cn/ | API密钥管理、服务开通 |

## 核心信息流

```
1. 预置: mt_dish_sales → lingtin_dishname_view (菜品字典)
2. 采集: 店长录音 + 桌号 → Supabase Storage → lingtin_visit_records
3. 处理: 讯飞STT → 纠偏(dishname_view) → 自动打标 → visit_records + dish_mentions
4. 展示: 看板(visit_records + table_sessions) / 问答(Text-to-SQL)
5. 行动: AI 负面反馈 → 改善建议(action_items) → 店长处理
```

## 数据库概览

核心表：`lingtin_visit_records`、`lingtin_dish_mentions`、`lingtin_table_sessions`、`lingtin_action_items`
只读引用：`master_restaurant`、`master_employee`、`mt_dish_sales`
视图：`lingtin_dishname_view`

```
master_restaurant (1) ──< visit_records (N) ──< dish_mentions (N)
                      ──< action_items (N)
                      ──< table_sessions (N)
master_employee (1)   ──< visit_records (N)
```

> 完整 schema 详见 @docs/DATABASE.md

## 部署概览

| 环境 | 平台 | 域名 |
|------|------|------|
| 前端 | Cloudflare Pages | https://lt.smartice.ai |
| 后端 | Zeabur | https://lingtinapi.preview.aliyun-zeabur.cn |

> 部署配置、环境变量、检查命令详见 @docs/DEPLOYMENT.md

## 产品使用

三个核心页面：录音(`/recorder`) → 看板(`/dashboard`) → AI智库(`/chat`)

> 按角色组织的完整使用手册详见 @docs/user-guides/README.md
