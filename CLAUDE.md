# Lingtin - 语音智能管理平台

## 产品定位

餐饮行业语音智能管理平台，以消费者反馈驱动管理闭环：**说了 → 记了 → 做了 → 验了**。当前阶段聚焦**店长单店闭环**（桌访录音 + AI 分析 + 行动建议）。

> 完整产品定义见 [docs/PRD.md](docs/PRD.md)，开发规范见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，产品反馈与需求记录见 [docs/FEEDBACK-LOG.md](docs/FEEDBACK-LOG.md)。

## 技术栈

- **前端**: Next.js 14 + PWA + Tailwind CSS + SWR
- **后端**: NestJS (Node.js)
- **数据库**: Supabase (PostgreSQL)
- **AI**: DashScope Paraformer-v2 STT (讯飞回退) + DeepSeek Chat V3 (via OpenRouter)
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
│           ├── modules/             # audio/, auth/, chat/, dashboard/, daily-summary/, meeting/, question-templates/, staff/
│           └── common/              # Supabase 客户端, 工具函数
├── packages/                         # 共享包
├── docs/                             # 产品 & 开发文档 (含 FEEDBACK-LOG.md 产品反馈与需求记录)
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
# 注意: rebase 时 sw.js 冲突直接接受任一版本（git checkout --theirs 或 --ours），后续 pnpm build:web 会重新生成
# 注意: 提交 sw.js 前务必先 pnpm build:web，确保无合并冲突标记残留
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
- **角色路由模式** — `master_employee.role_code` 是自由文本字段，新增角色需改 3 处：`AuthContext.tsx` login 路由、`app/page.tsx` 首页重定向、新建 `app/<role>/layout.tsx` + `<Role>BottomNav`。当前角色：`administrator`→`/admin/`、`manager`→`/recorder`、`head_chef`→`/chef/`。API 端点无角色守卫，全靠 `restaurant_id` 隔离数据
- **产品使用指南同步更新** — 每次功能迭代后，同步更新 `docs/user-guides/` 对应角色的指南，记录功能变更与最佳实践。**按角色分文件**（`store-manager.md`、`management.md`、`staff.md`），**每个角色一份完整文件，不再拆分成子目录或多个小文件**
- **综合产品指南同步更新** — 每次功能迭代后，同步更新 `docs/PRODUCT-GUIDE.md`（综合使用指南 + 面向用户的版本更新记录）。新增角色时需在该文档中增加对应的使用指南章节
- **产品指南更新触发规则** — 当用户说"更新产品指南使用说明"时，对比 `docs/PRODUCT-GUIDE.md` 头部版本号与 `CHANGELOG.md` 最新版本号，从上次更新的版本开始，将所有后续迭代的功能变更同步到 PRODUCT-GUIDE.md + `docs/user-guides/` 对应角色文件 + README.md 版本号
- **DashScope API 注意** — 提交用 `/api/v1/services/audio/asr/transcription`，轮询用 `/api/v1/tasks/{id}`，两个路径不同；`transcription_url` 是预签名 OSS URL，不需要 Authorization header
- **STT 回退模式** — DashScope 优先，失败或未配置自动回退讯飞；`extractTranscript` 失败必须抛异常（不能返回空串），否则回退不触发；讯飞收到非零 code 时若已有部分结果则 resolve 而非 reject（防止 11203 等错误丢弃已转写内容）
- **AI 分析模型** — OpenRouter → DeepSeek Chat V3（`deepseek/deepseek-chat-v3-0324`），无 fallback；中国区部署不可用 Google Gemini / Anthropic Claude / OpenAI
- **AI JSON 解析** — OpenRouter 返回的 JSON 必须用 try-catch 包裹 `JSON.parse`，catch 中记录原始内容前 200 字用于调试
- **处理流水线** — STT(DashScope→讯飞) → 本地清洗(硬编码规则，去语气词) → AI 分析(DeepSeek) → 存库；三步独立，任一步失败不影响已完成步骤的 log，audio_url 始终保留可重跑
- **面向店长的内容** — 讲功能价值时站在店长角度（省时间、不遗漏、被认可），不要暗示"做给老板看"或"被老板监控"。强调"你的用心会被看见"，而非"老板能看到你的数据"
- **已知技术债（PR #5 审查）** — ① `saveResults` 方法 DB 写入失败未抛异常 ② ~~`QuestionTemplatesService`~~ / `DailySummaryController` 缺 UUID 校验 ③ API 响应未统一 `{data, message}` 格式 ④ 前端 `onError` 回调未通知用户。新增代码应避免重复这些模式
- **产品驱动设计原则** — 所有面向用户的页面遵循：问题优先呈现 → 自带关键证据（顾客原话）→ 可听原声 → 有行动出口。不做被动数据报表，系统替用户判断什么需要关注。好评差评分区展示不混排

## 技术债追踪

> 目标：**稳定的 STT 转录服务** + **稳定的文本打标（AI 分析）服务**

### STT 转录层

| 优先级 | 债务 | 描述 | 状态 |
|--------|------|------|------|
| 🔴 高 | DashScope Paraformer-v2 未开通 | 当前 `DASHSCOPE_API_KEY` 存在但 Paraformer 服务未激活，每次都 fallback 到讯飞 | 待解决：让朋友在 DashScope 控制台开通 Paraformer-v2 服务 |
| 🔴 高 | 讯飞 11203 license 失败 | 方言大模型 license 校验失败，空音频时 STT 完全不可用 | 待解决：去讯飞控制台检查方言大模型开通/计费状态 |
| 🟡 中 | STT 无健康检测 | 服务启动时不验证 STT 凭证是否有效，失败只在运行时暴露 | 待优化 |
| 🟡 中 | 讯飞只有单一 fallback | DashScope 挂了只有讯飞一条路，无第二备用 | 待优化：可考虑加阿里云 NLS 或其他 STT 作为第三备用 |

### AI 分析层

| 优先级 | 债务 | 描述 | 状态 |
|--------|------|------|------|
| 🟡 中 | AI 分析无 fallback | OpenRouter/DeepSeek 挂了没有备用模型，直接 error | 待优化：可加 `qwen/qwen-turbo` 作为备用（同一 key 可用） |
| 🟡 中 | `saveResults` 写库失败不抛异常 | DB 写入出错只打 log，不触发重试或报警 | 待修复（PR #5 遗留） |
| 🟢 低 | 本地清洗规则硬编码 | 去语气词逻辑写死在代码里，无法动态配置 | 暂不处理 |

### 数据模型

| 优先级 | 债务 | 描述 | 状态 |
|--------|------|------|------|
| 🟢 低 | `lingtin_dish_mentions` 表废弃 | AI 流水线只写 `visit_records.feedbacks` JSONB，dish_mentions 表从未被写入。v1.3.3 起所有读取已改用 feedbacks，表暂保留不删 | 已标记废弃 |

### 可观测性

| 优先级 | 债务 | 描述 | 状态 |
|--------|------|------|------|
| 🟡 中 | 无告警机制 | STT/AI 大规模失败时无主动通知（只能事后看日志） | 待优化 |
| ✅ | 52 条历史 error 记录已重置 | 已通过 Supabase 将 error 重置为 pending（35 条），下次店长打开录音页自动重跑 | 已完成 |
- **版本号更新** — 每次功能迭代提交前，必须更新 `apps/web/components/layout/UpdatePrompt.tsx` 中的 `APP_VERSION`（递增 patch 版本）和 `BUILD_DATE`（当天日期）
- **CHANGELOG.md 同步更新** — 每次功能迭代提交前，在根目录 `CHANGELOG.md` 对应版本区块记录变更（遵循 [Keep a Changelog](https://keepachangelog.com/) 规范：Added / Changed / Fixed / Removed）
- **DATABASE.md 与实际表有差异** — `lingtin_visit_records` 实际含 `feedbacks JSONB` 列（AI 评价短语列表），但 DATABASE.md 未记录。修改 schema 前先查实际表结构

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
- **阶段性保存进度** — 见全局规则。compact、结束 session、或完成阶段任务时，将关键发现写入本文件末尾"进行中工作"区块

## 协作工作流

- **本地开发**: `supabase start` + `pnpm dev` → 本地测试
- **数据库变更**: SQL 迁移文件放 `supabase/migrations/`，由 Jeremy 在线上 Supabase 执行
- **发布流程**: 代码改动 + 构建通过 → **提示用户 `pnpm dev` 本地测试** → 用户确认无误 → commit + push → PR 给 Jeremy → Jeremy 负责线上部署
- **提交前必须等用户确认** — 构建通过后不要自动 commit + push，必须先停下来让用户手动验证功能，用户明确说"OK/没问题/可以提交"后才执行 commit + push
- **不要直接操作线上 Supabase 数据库**
- **Git remotes**: `origin` = 上游 (jeremydong22)，`fork` = 贡献者 (SmartIce-Ray)。SmartIce-Ray 已是 collaborator，可直接 push 到 `origin`
- **Push 策略**: 默认 push 到 `origin`（Jeremy 仓库），可同时 push 到 `fork` 作为备份（`git push fork <branch>`）
- **创建 PR**: `gh pr create --repo jeremydong22/lingtinofsmartice --base main`；若 PR 已存在，用 `gh pr edit <number> --repo ...` 更新
- **Force push（rebase 后）**: push 前先 `git fetch origin <branch>` 刷新 tracking info，否则 `--force-with-lease` 会因 stale info 被拒绝

## 外部服务文档

| 服务 | 文档链接 | 说明 |
|------|----------|------|
| 讯飞方言大模型 | https://www.xfyun.cn/doc/spark/spark_slm_iat.html | STT语音识别，支持202种方言自动识别 |
| 讯飞开放平台控制台 | https://console.xfyun.cn/ | API密钥管理、服务开通 |
| DashScope | https://help.aliyun.com/zh/model-studio/paraformer-recorded-speech-recognition-restful-api | Paraformer-v2 录音文件识别 REST API |
| DashScope 控制台 | https://dashscope.console.aliyun.com/ | API Key 管理 |

## 核心信息流

```
1. 预置: mt_dish_sales → lingtin_dishname_view (菜品字典)
2. 采集: 店长录音 + 桌号 → Supabase Storage → lingtin_visit_records
3. 处理: DashScope STT(讯飞回退) → 清洗 → 自动打标 → visit_records + dish_mentions
4. 展示: 看板(visit_records + table_sessions) / 问答(Text-to-SQL)
5. 行动: AI 负面反馈 → 改善建议(action_items) → 店长处理
```

## 数据库概览

核心表：`lingtin_visit_records`、`lingtin_dish_mentions`（废弃，数据已由 feedbacks JSONB 替代）、`lingtin_table_sessions`、`lingtin_action_items`、`lingtin_meeting_records`、`lingtin_question_templates`
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

> 按角色分文件的完整使用手册详见 @docs/user-guides/README.md

## 进行中工作

> 此区块在 compact、结束 session、或完成阶段任务时更新，确保下次 session 能无缝衔接。

| 任务 | 分支 | 状态 | 关键笔记 |
|------|------|------|----------|
| v1.4.0 管理层会议功能 | feat/meeting-recording | ✅ 已合并 | PR #7 → #10 已 merge |
| 顾客洞察按门店分组展示 | feat/meeting-recording | ✅ 已合并 | PR #11 已 merge。含门店下拉选择器+日期范围选择器+后端分组查询 |
| 本地 .env service key 无效 | — | 待修复 | `apps/api/.env` 中 `SUPABASE_SERVICE_KEY` 无效。线上 Zeabur 有正确 key 所以生产正常 |
| 本地测试局限 | — | 已知问题 | `pnpm dev` 前端连线上 API，本地后端因 service key 无效运行在 MOCK MODE |
