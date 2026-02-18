# 灵听 (Lingtin) - 开发规范

> 版本：v1.0 | 更新日期：2026-02-16

---

## 一、环境搭建

### 版本要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18.0.0 | LTS 版本 |
| pnpm | >= 8.0.0 | 包管理器（项目指定 9.0.0） |
| TypeScript | ^5.3.3 | 全项目统一 |

### 本地开发启动

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际值

# 3. 启动全部服务
pnpm dev

# 或分别启动
pnpm dev:web   # 前端 http://localhost:3000
pnpm dev:api   # 后端 http://localhost:3001
```

### 环境变量

参考 `.env.example`，必需变量：

```
SUPABASE_URL=             # Supabase 项目 URL
SUPABASE_SERVICE_KEY=     # Supabase Service Role Key
XUNFEI_APP_ID=            # 讯飞应用 ID
XUNFEI_API_KEY=           # 讯飞 API Key
XUNFEI_API_SECRET=        # 讯飞 API Secret
ANTHROPIC_API_KEY=        # Claude API Key
GEMINI_API_KEY=           # Gemini API Key
OPENROUTER_API_KEY=       # OpenRouter API Key
```

---

## 二、代码规范

### TypeScript

- 启用 strict mode
- 优先使用 `interface` 定义对象类型，`type` 用于联合/交叉类型
- 避免 `any`，必要时使用 `unknown` + 类型守卫
- 函数返回值显式标注类型（公共 API 方法）

### 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `audio.service.ts`, `record-button.tsx` |
| React 组件 | PascalCase | `RecordButton`, `WaveformVisualizer` |
| 函数/变量 | camelCase | `getVisitRecords`, `isRecording` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RECORDING_DURATION` |
| 数据库表 | snake_case + 前缀 | `lingtin_visit_records` |
| API 路径 | kebab-case | `/api/audio/upload`, `/api/action-items` |

### NestJS 模块结构

每个业务模块包含：

```
src/modules/{module-name}/
  ├── {module-name}.module.ts      # 模块定义
  ├── {module-name}.controller.ts  # 路由控制器
  ├── {module-name}.service.ts     # 业务逻辑
  └── dto/                         # 数据传输对象（按需）
      └── create-{entity}.dto.ts
```

### React 组件组织

```
components/
  └── {feature}/                   # 按功能分组
      ├── ComponentName.tsx        # 组件文件
      └── index.ts                 # 导出（按需）

hooks/
  └── use{HookName}.ts             # 自定义 Hook

contexts/
  └── {ContextName}Context.tsx     # Context Provider
```

---

## 三、目录结构

```
lingtin/
├── apps/
│   ├── web/                       # Next.js 前端
│   │   ├── app/
│   │   │   ├── (main)/            # 店长端路由组
│   │   │   │   ├── recorder/      # 桌访录音
│   │   │   │   ├── dashboard/     # 数据看板
│   │   │   │   └── chat/          # AI 智库
│   │   │   ├── admin/             # 管理端路由组
│   │   │   └── login/
│   │   ├── components/            # UI 组件
│   │   │   ├── recorder/
│   │   │   ├── chat/
│   │   │   └── layout/
│   │   ├── hooks/                 # 自定义 Hooks
│   │   ├── contexts/              # React Context
│   │   ├── lib/                   # 工具库
│   │   └── public/                # 静态资源
│   │
│   └── api/                       # NestJS 后端
│       └── src/
│           ├── common/            # 公共模块
│           │   ├── supabase/      # Supabase 客户端
│           │   └── utils/         # 工具函数
│           ├── modules/           # 业务模块
│           │   ├── audio/         # 音频处理 (STT + AI)
│           │   ├── auth/          # 认证
│           │   ├── chat/          # AI 对话
│           │   ├── dashboard/     # 数据看板
│           │   └── staff/         # 员工管理
│           ├── app.module.ts
│           └── main.ts
│
├── packages/                      # 共享包
├── docs/                          # 文档
│   ├── PRD.md                     # 产品需求文档
│   ├── DEVELOPMENT.md             # 开发规范（本文件）
│   └── archive/                   # 归档文档
│
├── CLAUDE.md                      # AI 上下文记忆
├── Dockerfile                     # 后端容器构建
└── pnpm-workspace.yaml
```

### 新增语音场景的目录模板

新增一个语音场景（如"例会录音"）时，按以下结构创建：

**后端**：
```
src/modules/meeting/
  ├── meeting.module.ts
  ├── meeting.controller.ts
  └── meeting.service.ts
```

**前端**：
```
app/(main)/meeting/
  └── page.tsx

components/meeting/
  ├── MeetingRecorder.tsx
  └── MeetingSummary.tsx
```

---

## 四、Git 规范

### 分支策略

| 分支 | 用途 | 命名示例 |
|------|------|----------|
| `main` | 生产分支，始终可部署 | — |
| `dev` | 开发集成分支 | — |
| `feature/*` | 功能开发 | `feature/action-items` |
| `fix/*` | Bug 修复 | `fix/stt-timeout` |
| `docs/*` | 文档更新 | `docs/prd-update` |

### Commit Message 格式

```
<type>(<scope>): <description>

[可选的正文]
```

**Type 类型**：

| Type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `refactor` | 重构（不改变功能） |
| `style` | 代码格式（不影响逻辑） |
| `test` | 测试相关 |
| `chore` | 构建/工具/依赖等 |

**Scope 示例**：`web`, `api`, `audio`, `dashboard`, `auth`

**示例**：
```
feat(api): add action items generation endpoint
fix(web): fix recording timer reset on stop
docs: update PRD with meeting scenario
```

### PR 流程

1. 从 `dev` 创建 feature 分支
2. 开发完成后提交 PR 到 `dev`
3. 代码审查通过后合并
4. `dev` 稳定后合并到 `main` 触发部署

---

## 五、API 设计规范

### RESTful 路径约定

```
GET    /api/{resource}          # 列表
GET    /api/{resource}/:id      # 详情
POST   /api/{resource}          # 创建
PATCH  /api/{resource}/:id      # 更新
DELETE /api/{resource}/:id      # 删除
```

**现有路由**：
- `/api/audio/*` — 音频上传与处理
- `/api/dashboard/*` — 看板数据查询
- `/api/chat/*` — AI 对话
- `/api/staff/*` — 员工与问卷管理
- `/api/auth/*` — 认证

### 统一响应格式

**成功响应**：
```json
{
  "data": { ... },
  "message": "操作成功"
}
```

**列表响应**：
```json
{
  "data": [ ... ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**错误响应**：
```json
{
  "statusCode": 400,
  "message": "参数错误",
  "error": "Bad Request"
}
```

### 错误码

| 状态码 | 含义 | 使用场景 |
|--------|------|----------|
| 200 | 成功 | 查询/更新成功 |
| 201 | 已创建 | 新建资源成功 |
| 400 | 参数错误 | 请求参数不合法 |
| 401 | 未认证 | 未登录或 token 失效 |
| 403 | 无权限 | 无权访问该资源 |
| 404 | 未找到 | 资源不存在 |
| 500 | 服务器错误 | 内部异常 |

### 认证机制

- 使用 JWT (JSON Web Token)
- Token 通过 `Authorization: Bearer <token>` 头传递
- Supabase Auth 负责用户管理，后端通过 JWT 策略校验
- 公开接口使用 `@Public()` 装饰器标记

---

## 六、数据库规范

### 表命名

| 前缀 | 用途 | 说明 |
|------|------|------|
| `lingtin_` | 灵听业务表 | 所有新建表 |
| `master_` | 主数据表 | 已有，只读引用 |
| `mt_` | 旧业务数据表 | 已有，只读引用 |

### 字段规范

- **主键**：`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- **时间字段**：使用 `TIMESTAMPTZ`，包含 `created_at` 和 `updated_at`
- **外键**：命名为 `{关联表}_id`
- **枚举值**：使用 `VARCHAR` + 代码注释，不建数据库 enum
- **JSON 数据**：使用 `JSONB`（非 `JSON`）
- **字段名**：英文 snake_case，不用中文

### RLS (Row Level Security)

所有 `lingtin_` 表必须启用 RLS：

```sql
ALTER TABLE lingtin_xxx ENABLE ROW LEVEL SECURITY;

-- 基本策略：按 restaurant_id 隔离
CREATE POLICY "tenant_isolation" ON lingtin_xxx
  USING (restaurant_id = current_setting('app.restaurant_id')::uuid);
```

### 迁移管理

- 使用 Supabase Dashboard 或 SQL 文件管理 schema 变更
- 重大变更先在测试环境验证
- 保留向后兼容，废弃字段加注释标记

---

## 七、新增语音场景开发流程

新增一个语音场景（如"例会录音"）的标准步骤：

### Step 1: 定义数据模型

1. 设计主表（`lingtin_{scene}_records`）
2. 设计关联表（如有需要）
3. 在 Supabase 创建表 + RLS 策略

### Step 2: 后端 API

1. 创建 NestJS 模块 `src/modules/{scene}/`
2. 实现音频上传接口
3. 实现 AI 分析 Pipeline（复用现有 STT 服务，定制 AI prompt）
4. 实现数据查询接口

### Step 3: AI Prompt 定制

1. 定义场景专属的分析 prompt
2. 定义输出 JSON schema
3. 测试多条真实音频，调优 prompt

### Step 4: 前端页面

1. 创建路由页面 `app/(main)/{scene}/page.tsx`
2. 复用/扩展录音组件
3. 实现场景专属的数据展示

### Step 5: 看板集成

1. 在 Dashboard 添加场景数据卡片
2. 如需独立看板，创建新页面

### Step 6: 测试与部署

1. 端到端测试：录音 → 上传 → STT → AI → 存储 → 展示
2. 前端部署到 Cloudflare Pages
3. 后端部署到 Zeabur

---

## 八、产品使用指南维护

每次功能迭代或版本更新时，必须同步更新 `docs/user-guides/` 下的产品使用指南：

1. **确定受影响角色** — 新功能或变更影响哪些角色（店长/管理层/店员）
2. **更新对应手册** — 在对应角色目录下更新或新增功能说明
3. **更新术语表** — 如有新概念，补充到 `getting-started/glossary.md`
4. **更新版本记录** — 在 `docs/user-guides/README.md` 的版本表中添加条目
5. **内容标准** — 不只写操作步骤，要说明功能的意义、价值和最佳实践方式
