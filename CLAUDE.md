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
│   │   │   ├── (main)/              # 店长端
│   │   │   │   ├── recorder/        # 桌访录音页
│   │   │   │   ├── dashboard/       # 数据看板页
│   │   │   │   └── chat/            # AI 智库页
│   │   │   ├── admin/               # 管理端
│   │   │   │   ├── dashboard/
│   │   │   │   ├── chat/
│   │   │   │   ├── restaurant-detail/
│   │   │   │   └── staff-questions/
│   │   │   └── login/
│   │   ├── components/              # UI 组件 (recorder/, chat/, layout/)
│   │   ├── hooks/                   # useAudioRecorder, useRecordingStore, useChatStream
│   │   ├── contexts/                # AuthContext, SWRProvider
│   │   └── lib/                     # api.ts, backgroundProcessor.ts, supabase/
│   │
│   └── api/                          # NestJS 后端 (@lingtin/api)
│       └── src/
│           ├── modules/
│           │   ├── audio/           # 音频上传 + STT + AI 分析 Pipeline
│           │   ├── auth/            # JWT 认证
│           │   ├── chat/            # AI 对话 (Text-to-SQL)
│           │   ├── dashboard/       # 看板数据聚合
│           │   └── staff/           # 员工 + 问卷管理
│           └── common/              # Supabase 客户端, 工具函数
│
├── packages/                         # 共享包
├── docs/                             # 产品 & 开发文档
│   ├── PRD.md                       # 全景产品需求文档
│   ├── DEVELOPMENT.md               # 开发规范
│   └── archive/                     # 归档文档 (plan-mvp-v1.md 等)
├── Dockerfile                        # 后端容器构建
└── pnpm-workspace.yaml               # Monorepo 配置
```

## 常用命令

```bash
pnpm dev              # 同时启动前端 + 后端
pnpm dev:web          # 仅前端 (localhost:3000)
pnpm dev:api          # 仅后端 (localhost:3001)
pnpm build:web        # 构建前端
pnpm build:api        # 构建后端

# 本地 Supabase (需要 Docker Desktop)
supabase start        # 启动本地 Supabase (localhost:54321)
supabase stop         # 停止本地 Supabase
supabase status       # 查看本地服务状态和密钥
```

## 开发规范摘要

- **迭代开发，不是重构** — 在现有代码基础上渐进增强，不做大规模重写
- **TypeScript strict mode**，避免 `any`
- **文件名** kebab-case，**组件名** PascalCase
- **NestJS 模块**：module + controller + service 三件套
- **数据库表** `lingtin_` 前缀，UUID 主键，TIMESTAMPTZ 时间，启用 RLS
- **Git commit**：`feat|fix|docs|refactor(scope): description`
- **API 响应**：统一 `{ data, message }` 格式

> 详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## 协作工作流

- **本地开发**: `supabase start` + `pnpm dev` → 本地测试
- **数据库变更**: SQL 迁移文件放 `supabase/migrations/`，由 Jeremy 在线上 Supabase 执行
- **发布流程**: 本地测试通过 → push/PR 给 Jeremy → Jeremy 负责线上部署
- **不要直接操作线上 Supabase 数据库**

## 外部服务文档

| 服务 | 文档链接 | 说明 |
|------|----------|------|
| 讯飞方言大模型 | https://www.xfyun.cn/doc/spark/spark_slm_iat.html | STT语音识别，支持202种方言自动识别 |
| 讯飞开放平台控制台 | https://console.xfyun.cn/ | API密钥管理、服务开通 |

## 部署信息

| 环境 | 平台 | 域名 |
|------|------|------|
| 前端 | Cloudflare Pages | https://lt.smartice.ai |
| 前端备用 | Cloudflare Pages | https://lingtinofsmartice.pages.dev |
| 后端 | Zeabur | https://lingtinapi.preview.aliyun-zeabur.cn |

### 后端部署配置 (Zeabur)

- **平台**: Zeabur (https://zeabur.com)
- **项目ID**: `697a5cfa06505fdd547f6889`
- **服务ID**: `697a6376f2339c9e766cb99d`
- **服务名**: `lingtinofsmartice`
- **区域**: 阿里云中国区 (aliyun-zeabur.cn)
- **根目录**: `/apps/api`
- **框架**: NestJS + pnpm
- **自动HTTPS**: Zeabur 自动提供
- **API 地址**: `https://lingtinapi.preview.aliyun-zeabur.cn/api`
- **内部DNS**: `lingtinofsmartice.zeabur.internal`

#### 端口配置

Zeabur 自动设置 `PORT=8080`，NestJS 应用需要监听此端口。Dockerfile 中 EXPOSE 3001 仅作为文档说明，实际端口由 Zeabur 环境变量控制。

#### 环境变量

```
NODE_ENV=production
PORT=8080                    # Zeabur 自动设置
SUPABASE_URL=https://wdpeoyugsxqnpwwtkqsl.supabase.co
SUPABASE_SERVICE_KEY=<见.env>
XUNFEI_API_KEY=<见.env>
XUNFEI_API_SECRET=<见.env>
XUNFEI_APP_ID=<见.env>
GEMINI_API_KEY=<见.env>
ANTHROPIC_API_KEY=<见.env>
OPENROUTER_API_KEY=<见.env>
```

#### Docker 构建注意事项

pnpm 在 Docker 中默认只安装 `dependencies`，不安装 `devDependencies`。因此构建工具和类型声明必须放在 `dependencies` 中：

- `@nestjs/cli` - NestJS 构建命令
- `@nestjs/schematics` - NestJS CLI 依赖
- `typescript` - TypeScript 编译器
- `@types/*` - 所有类型声明文件

#### 历史部署 (已废弃)

~~阿里云 SAE~~ - 2026-01-29 已删除，原因：HTTPS配置复杂，Cloudflare Full (Strict) 模式需要有效SSL证书

### 前端部署配置

- **构建命令**: `pnpm install && pnpm --filter @lingtin/web build`
- **输出目录**: `apps/web/out`
- **环境变量**: `NEXT_PUBLIC_API_URL` = `https://lingtinapi.preview.aliyun-zeabur.cn`
- **项目名**: `lingtinofsmartice`

### 部署状态检查命令

```bash
# 前端 (Cloudflare Pages) - 查看部署列表和状态
npx wrangler pages deployment list --project-name=lingtinofsmartice

# 后端 (Zeabur) - 查看服务列表
zeabur service list -i=false

# 后端 (Zeabur) - 查看服务详情
zeabur service get --id 697a6376f2339c9e766cb99d -i=false

# 后端 (Zeabur) - 手动触发重新部署
zeabur service redeploy --id 697a6376f2339c9e766cb99d -y -i=false

# 后端健康检查 (返回 401 表示 API 正常运行)
curl -s "https://lingtinapi.preview.aliyun-zeabur.cn/api/audio/today?restaurant_id=test"
```

## 数据库设计

### 命名规范

- 所有新表使用 `lingtin_` 前缀
- 已有主数据表使用 `master_` 前缀
- 已有业务数据表使用 `mt_` 前缀

### 现有表（只读引用）

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `master_restaurant` | 餐厅主表 | id, restaurant_name, brand_id |
| `master_employee` | 员工表（含店长） | id, employee_name, restaurant_id, role_code |
| `mt_dish_sales` | 菜品销售数据 | 菜品名称, 销售数量, restaurant_id |

### Lingtin 核心表

#### lingtin_dishname_view (视图)

从 `mt_dish_sales` 提取去重菜品名称，用于STT语音纠偏。

```sql
-- 字段
dish_name TEXT      -- 标准菜品名称
aliases TEXT[]      -- 别名数组（预留扩展）
```

#### lingtin_visit_records (桌访录音表)

存储店长桌访的录音及AI处理结果。

```sql
-- 核心字段
id UUID PRIMARY KEY
restaurant_id UUID              -- 关联餐厅
employee_id UUID                -- 执行桌访的店长
table_id VARCHAR(10)            -- 桌号：B4, A12
audio_url TEXT                  -- 音频文件URL

-- STT处理结果
raw_transcript TEXT             -- 讯飞STT原始转写
corrected_transcript TEXT       -- 纠偏后文本

-- AI自动打标 (5维度)
sentiment_score DECIMAL(3,2)    -- 情绪分：0.00 到 1.00 (0=极差, 0.5=中性, 1=极好)
ai_summary TEXT                 -- AI简要总结 (20字以内)
keywords JSONB                  -- 关键词数组 (菜名、形容词、服务词等)
manager_questions JSONB         -- 店长/服务员说的话
customer_answers JSONB          -- 顾客的回复内容

-- 已废弃字段 (保留向后兼容)
visit_type VARCHAR(20)          -- [废弃] routine/complaint/praise
service_stage VARCHAR(20)       -- [废弃] ordering/serving/checkout
dishes JSONB                    -- [废弃] 复杂菜品提及结构
service JSONB                   -- [废弃] 服务关键词
other JSONB                     -- [废弃] 其他关键词

-- 时间维度
visit_date DATE
visit_period VARCHAR(10)        -- lunch/dinner
status VARCHAR(20)              -- pending/processing/completed/failed
```

<!-- 扩展方向：新增 scene_type 字段以区分桌访/例会/巡检等场景 -->

#### lingtin_dish_mentions (菜品提及表)

记录桌访中提及的菜品及评价。

```sql
-- 核心字段
id UUID PRIMARY KEY
visit_id UUID                   -- 关联桌访记录
dish_name TEXT                  -- 菜品名称
sentiment VARCHAR(10)           -- positive/negative/neutral
feedback_text TEXT              -- 具体反馈：壳硬、偏咸
mention_count INTEGER           -- 提及次数
```

#### lingtin_table_sessions (开台数据表)

记录每日开台情况，用于计算桌访覆盖率。

```sql
-- 核心字段
id UUID PRIMARY KEY
restaurant_id UUID
session_date DATE
period VARCHAR(10)              -- lunch/dinner
table_id VARCHAR(10)
open_time TIMESTAMPTZ
close_time TIMESTAMPTZ
guest_count INTEGER
source VARCHAR(20)              -- manual/pos_sync/excel_import
```

### 表关系图

```
master_restaurant (1)
    │
    ├──< lingtin_visit_records (N)
    │       │
    │       └──< lingtin_dish_mentions (N)
    │
    ├──< lingtin_action_items (N)
    │
    └──< lingtin_table_sessions (N)

master_employee (1)
    │
    └──< lingtin_visit_records (N)

lingtin_dishname_view
    │
    └── (语义关联) lingtin_dish_mentions.dish_name
```

#### lingtin_action_items (AI行动建议表)

AI 基于每日负面反馈生成的改善建议，店长可标记状态。

```sql
-- 核心字段
id UUID PRIMARY KEY
restaurant_id UUID              -- 关联餐厅
action_date DATE                -- 建议日期
category VARCHAR(30)            -- dish_quality/service_speed/environment/staff_attitude/other
suggestion_text TEXT             -- AI生成的建议文案
priority VARCHAR(10)            -- high/medium/low
evidence JSONB                  -- 原始反馈证据 [{visitId, tableId, feedback, sentiment}]
visit_ids UUID[]                -- 关联的桌访记录ID
status VARCHAR(20)              -- pending/acknowledged/resolved/dismissed
```

<!-- 未来新增表：lingtin_meeting_records 等，详见 docs/PRD.md 第六节 -->

## 核心信息流

```
1. 预置阶段
   mt_dish_sales → lingtin_dishname_view (菜品字典)

2. 采集阶段
   店长录音 + 桌号 → Supabase Storage → lingtin_visit_records

3. 处理阶段 (AI Pipeline)
   讯飞STT → 纠偏(对照dishname_view) → 自动打标 → 更新visit_records
                                              → 写入dish_mentions

4. 展示阶段
   看板: 聚合查询 visit_records + table_sessions
   问答: Claude Text-to-SQL → 查询所有表

5. 行动阶段 (v1.1)
   AI 基于当日负面反馈 → 生成3-5条改善建议 → 店长知悉/解决/忽略
```

---

## 产品使用说明

### 使用流程

#### 录音页面 (`/recorder`)

**操作步骤：**
1. 打开APP，默认进入「桌访录音」页面
2. 点击桌号选择器，选择要访问的桌号（如 A1、B3）
3. 点击红色录音按钮开始录音，页面显示波形动画和计时器
4. 录完后再次点击按钮停止
5. 系统自动保存并提示「A1桌录音已保存」
6. 后台自动处理，完成后提示「A1桌分析完成」

**页面元素：**
- 波形可视化：实时显示音频振幅
- 计时器：显示录音时长（MM:SS格式）
- 今日录音列表：显示状态（处理中/已完成/失败）

#### 数据看板 (`/dashboard`)

**查看内容：**
- **执行覆盖率**：午市/晚市的开台数、桌访数、覆盖率
- **菜品提及 TOP 5**：被顾客提到最多的菜品及好评/差评数
- **情绪概览**：正面/中性/负面情绪占比
- **话术红黑榜**：优秀话术示范 & 待改进话术建议

**时间筛选**：支持「今日/昨日/本周」切换

#### AI智库 (`/chat`)

**使用方式：**
- 输入自然语言问题，如「今天投诉最多的菜是什么？」
- 或点击快捷问题按钮：今天投诉最多的菜 / 本周情绪最低的桌 / 退菜原因分析 / 午市覆盖率如何

**交互特点：**
- 流式输出（打字机效果）
- 支持清空对话历史

### 技术参数

| 项目 | 说明 |
|------|------|
| **录音格式** | WebM/Opus, 44.1kHz, 降噪+回声消除 |
| **本地存储** | 最多保存 **20条** 录音（localStorage） |
| **页面显示** | 只显示 **今日** 的录音记录 |
| **AI分析耗时** | 约 **10-15秒**（讯飞STT 3-5秒 + AI 7-10秒） |
| **离线支持** | 录音先存本地，有网时后台自动上传处理 |
| **失败处理** | 支持点击「重试」按钮重新处理失败的录音 |

### 处理流程时序

```
用户点击停止录音
    ↓ (立即)
本地保存 → 提示「已保存」
    ↓ (后台静默处理)
[Step 1] 上传音频到云存储 (~2秒)
    ↓
[Step 2] 讯飞语音识别 STT (~3-5秒)
    ↓
[Step 3] AI 分析 (~7-10秒)
    • 菜名纠错（清蒸路鱼→清蒸鲈鱼）
    • 情绪评分（0-1分，0=极差，1=极好）
    • 自动摘要（20字内）
    • 关键词提取
    • 店长问题 & 顾客回答分离
    ↓
[Step 4] 保存数据库 → 提示「分析完成」
```

### 录音状态说明

| 状态 | 含义 | 显示 |
|------|------|------|
| `saved` | 已保存本地，等待上传 | 灰色 |
| `uploading` | 正在上传音频 | 蓝色 |
| `processing` | AI正在分析 | 黄色/动画 |
| `completed` | 处理完成 | 绿色 |
| `error` | 处理失败 | 红色，可重试 |

### 注意事项

1. **首次使用**需授权麦克风权限
2. **必须先选桌号**才能开始录音
3. 网络不好时录音会暂存本地，恢复后自动处理
4. 单条录音建议控制在 **1分钟以内**（约500KB）
