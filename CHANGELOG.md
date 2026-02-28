# Changelog

本文件记录 Lingtin 语音智能管理平台的所有重要变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [2.0.1] - 2026-02-28

### 修复 (Fixed)
- **总览页展开崩溃** — 点击门店展开详情时白屏报错，原因是 `action_items` / `key_decisions` 可能不是数组，添加 `Array.isArray()` 守卫

### 变更 (Changed)
- **顾客洞察页重设计** — 按门店折叠展示，合并建议 + 反馈到同一张卡片
  - 建议 API 新增 `start_date` / `end_date` 参数，与日期选择器同步（不再硬编码"近 7 天"）
  - 建议 API 返回新增 `by_restaurant` 分组
  - 每家门店一张折叠卡片：建议数（紫）+ 差评数（橙）+ 好评数（绿）
  - 展开查看：建议（含溯源原话 + 录音）→ 不满意反馈 → 满意反馈

## [2.0.0] - 2026-02-28

### 新增 (Added)
- **复盘完成率** — 替代空白覆盖率，追踪店长每日复盘执行情况
  - 定义：有桌访的日子中，同时有 daily_review 会议记录的天数占比
  - 连续复盘天数（streak）：从今天往前连续完成复盘的天数
  - 店长看板：新增执行数据卡（桌访数 + 复盘率 + 连续天数）
  - 管理层简报：第三指标从"覆盖率"改为"复盘完成率"
  - 基准对比：新增"复盘完成率"对比维度
- **厨房响应区块** — 店长看板新增，展示菜品类 action_items 的处理状态
  - 显示厨师长的 `response_note` 处理说明
  - 未处理问题显示提示"N 个菜品问题待厨师长处理"
- **语音录入处理说明** — 厨师长可用语音记录菜品问题的处理情况
  - 新增 `POST /api/audio/quick-transcribe` 端点（短录音 → STT → 文字）
  - 厨师长待办卡片内嵌麦克风按钮，录音自动转文字填入输入框
- **数据库迁移** — `lingtin_action_items` 新增 `response_note TEXT` 列

### 变更 (Changed)
- **管理层简报重设计** — 问题卡片和门店网格合并为折叠式门店列表
  - 按问题数量 + 严重度排序，每行显示：状态点 + 门店名 + 桌访/满意度/复盘状态/问题数
  - 展开查看：嵌套的问题卡片 + 最近复盘记录（AI摘要 + 行动事项 + 关键决定）
  - 未复盘门店显示提示"该门店尚未录制复盘会议"
- **厨师长待办交互升级** — 处理流程更严谨、文案更友善
  - 去掉"知悉"按钮，保留"搞定了"和"忽略"
  - "搞定了"和"忽略"均必填处理说明（后端校验 response_note）
  - 文案统一礼貌风格：placeholder "麻烦记录一下处理情况，谢谢~"
  - 全部完成提示改为"太棒了，暂时没有需要处理的问题！"
- **基准对比面板** — 从 3 列改为 2×2 网格，新增复盘完成率
- **管理层简报 API** — `getBriefing()` 返回新增 `avg_review_completion` 字段
- **门店概况 API** — `getRestaurantsOverview()` 每店新增 `review_completion` + `latest_review` 字段

## [1.9.1] - 2026-02-27

### 修复 (Fixed)
- **录音中断恢复** — 电话打断或系统中断录音时，自动保存已录制部分（不再丢失）
  - 新增 `MediaRecorder.onerror` 处理，捕获录音中断事件
  - 新增 `AudioContext.onstatechange` 监听，检测 iOS 来电导致的 `interrupted`/`suspended` 状态
  - 新增 `visibilitychange` 监听，检测应用进入后台后 MediaRecorder 被系统终止
  - 每秒健康检查：若 MediaRecorder 被系统静默杀掉，自动触发紧急保存
  - 提取公共 `cleanupResources()` 减少重复代码
- **AI 智库"正在思考"卡死** — 流式响应中断时前端永久卡在加载状态
  - 新增 90 秒流式超时：无数据时自动中止请求并显示"回复超时，请重试"
  - 修复 `[DONE]` 信号检测：增加 `.trim()` 防止尾部空格导致匹配失败
  - 修复内层 try-catch 吞掉服务端错误：JSON 解析与业务错误分离处理
  - 超时后显示"当前访问人数较多，请稍后重试"+ 重试按钮

## [1.9.0] - 2026-02-27

### 变更 (Changed)
- **满意度评分体系升级** — 从主观情绪分（0-1）升级为结构化满意度评分（0-100）
  - AI 对每条反馈独立打分（`score: 0-100`），系统用加权公式计算整体满意度
  - 权重：negative×1.5, positive×1.0, suggestion×1.0, neutral×0.8
  - 移除 AI 输出的整体 `sentimentScore`，改由 `calculateSatisfaction()` 系统计算
- **前端术语统一** — "情绪分/好评/差评" 改为 "满意度/满意/不满意"
  - 管理层总览：情绪→满意度，优秀/一般/需关注→满意/一般/不满意
  - 门店详情：好评/中评/差评→满意/一般/不满意，移除 `×100` 显示转换
  - 店长看板：情绪概览→满意度概览，正面/中性/负面→满意/一般/不满意
  - 店长看板：需要关注→需要改进，好评亮点→值得保持
  - 厨师长：需要关注→需要改进，好评亮点→值得保持
  - 顾客洞察：高频差评→不满意反馈，高频好评→值得保持
  - 基准对比：情绪分→满意度，移除 `×100` 转换
  - 录音历史：情绪emoji改用满意度分数判断（≥70😊/≥50😐/<50😟）
  - 激励横幅：位好评→次满意
- **后端阈值统一** — 所有 `0.x` 阈值改为 `0-100` 范围
  - dashboard: `≥0.8`→`≥80`（好评计数），`<0.5`→`<50`（异常检测）
  - chat: 差评筛选 `<0.4`→`<40`，满意筛选 `>0.6`→`>60`
  - daily-summary: 正面 `≥0.6`→`≥60`，负面 `≤0.4`→`≤40`
  - AI 智库 system prompt 满意度口语化映射更新为 0-100 范围

### 需要配合的操作
- **数据库迁移**（代码部署前执行）：
  1. `ALTER TABLE lingtin_visit_records ALTER COLUMN sentiment_score TYPE DECIMAL(5,2);`
  2. `UPDATE lingtin_visit_records SET sentiment_score = ROUND(sentiment_score * 100) WHERE sentiment_score IS NOT NULL AND sentiment_score <= 1.0;`
- **全量重分析**（部署后）：复用 `POST /api/audio/reanalyze-batch` 端点，让新 prompt 生成 per-item score

## [1.8.3] - 2026-02-27

### 新增 (Added)
- 历史数据批量重分析端点 `POST /api/audio/reanalyze-batch` — 用 Prompt V2 重跑历史桌访的 AI 分析，跳过 STT（节省费用）
  - 幂等机制：按 `processed_at < cutoff_date` 筛选，处理后自动更新 `processed_at`
  - 安全机制：失败不改 status（记录保持 `processed`），用 `processingLocks` 防止并发冲突
  - 限流：每条记录间隔 500ms，单批最大 100 条

## [1.8.2] - 2026-02-27

### 修复 (Fixed)
- 录音按钮防抖从 300ms 降至 100ms，修复 PWA 模式下无法正常取消录音的问题
- 录音按钮添加 `touch-action: manipulation`，消除 iOS Safari 的 300ms 触摸延迟
- 厨师长/管理层/店长每日汇报菜品数据为空——从废弃的 `dish_mentions` 表迁移到 `visit_records.feedbacks` JSONB
- 汇报 SQL 时区修复——`CURRENT_DATE` 改为 `(CURRENT_DATE AT TIME ZONE 'Asia/Shanghai')::date`，避免凌晨时段查错日期

## [1.8.1] - 2026-02-27

### 变更 (Changed)
- AI 分析 Prompt V2 — 基于 3,727 条数据的系统性审查重写分析 prompt
  - 情绪分改为连续值（0.38/0.55/0.62 等），不再聚集在 0.50/0.70 固定档位
  - 新增一致性规则：sentimentScore 必须与 feedbacks 情感方向一致
  - 新增兜底提取规则：顾客有实质回应时必须至少提取 1 条 feedback
  - suggestion 分类增强：支持口语化建议模式（"分量再多点就好了"等）
  - 角色识别改为语义模式匹配（移除无用的说话人标签指引）
  - 新增 3 个基于真实数据的 few-shot 案例
- AI 分析 temperature 从 0.3 降为 0，消除随机性
- STT 清洗增强 — 新增逐字递增重复检测（修复讯飞 STT "哎你好→哎你好像→哎你好像请" 的渐进重复 artifact）

## [1.8.0] - 2026-02-27

### 新增 (Added)
- AI 智库升级为所有角色首页入口 — 登录后直接进入 AI 聊天页
- 每日智能汇报 — 每天首次打开自动生成角色化的 AI 汇报（店长/管理层/厨师长各不同）
- 厨师长 AI 聊天功能 — 新增 `/chef/chat` 页面，厨师长首次获得 AI 助手
- `lingtin://` 行动链接协议 — AI 汇报中的建议自动渲染为可点击的 pill 按钮，一键跳转到相关页面
- `:::quick-questions:::` 追问解析 — AI 汇报末尾的建议问题渲染为快捷 pill
- `useDailyBriefing` hook — 自动触发每日汇报（sessionStorage 防重复）
- `ChatPage` 统一组件 — 三个角色的聊天页共享核心逻辑

### 变更 (Changed)
- 底部导航重排 — 三个角色的智库 tab 均移至第一位
- 登录跳转 — 所有角色登录后跳转到各自的 AI 聊天页（原：店长→录音、管理层→总览、厨师长→待办）
- 厨师长导航从 3 tab 扩展为 4 tab（智库/待办/菜品/会议）
- `useChatStream` 升级 — 支持 `hideUserMessage` 选项、按角色隔离 sessionStorage、移除静态欢迎语
- `MarkdownRenderer` 升级 — 支持 `lingtin://` 链接渲染为行动按钮 + `onQuickQuestion` 回调
- 后端 chat.service.ts — 新增 CHEF_SYSTEM_PROMPT、3-way 角色选择、action_items 表查询权限、汇报模式 max_tokens 3072
- `allowedTables` 新增 `lingtin_action_items` 和 `master_restaurant`（支持 JOIN 查询门店名称）
- restaurant_id 作用域过滤扩展到 action_items 和 dish_mentions 表

## [1.7.1] - 2026-02-27

### 新增 (Added)
- 日期范围选择器 — 所有日期选择器支持范围选择（近7天、近30天、自定义范围）
- `DateRange` 类型 + `singleDay()`、`isMultiDay()`、`dateRangeParams()` 工具函数
- 日历两步范围选择 UX（第一次点击选起始、第二次点击选结束）
- 后端 `resolveRange()` 工具函数，统一解析 `date`/`start_date`/`end_date` 参数
- 管理层预设：昨日、前天、近7天、近30天
- 店长/厨师长预设：今日、昨日、前天、近7天

### 变更 (Changed)
- 所有 API 端点（dashboard 7个 + meeting 1个）支持 `start_date`/`end_date` 范围参数
- Supabase 查询模式从 `.eq()` 改为 `.gte().lte()` 支持范围过滤
- 店长看板在多日模式下隐藏"比昨天"趋势箭头
- 保留旧 `?date=` 参数向后兼容

### 修复 (Fixed)
- 区域编辑表单改为原位内联显示（来自 fix/region-inline-edit）

## [1.7.0] - 2026-02-26

### 新增 (Added)
- 门店区域分组架构 — 新增 `master_region` 表，按地理区域（绵阳/常熟/德阳/江油）组织门店
- 区域管理页面 `/admin/regions` — 管理员可创建/编辑/删除区域、分配门店和管理员
- `master_restaurant.region_id` 字段 — 门店关联到所属区域
- `master_employee.managed_region_ids` 字段 — 管理员可按区域管辖门店（比手动维护 UUID 列表更便捷）
- 认证层区域解析 — 登录时自动将 `managed_region_ids` 解析为门店 ID 列表，下游 API 无需改动
- 权限优先级：精确门店 > 区域 > 品牌 > 全部（总部）
- 后端 RegionModule — 8 个 API 端点（CRUD + 门店分配 + 管理员分配 + 全部门店 + 管理员列表）
- UserMenu 新增「区域管理」入口（超级管理员可见）
- 超级管理员角色 — `is_super_admin` 布尔字段，控制「产品洞察」和「区域管理」的可见性

### 变更 (Changed)
- 新门店挂到区域后，该区域管理员自动看到新店（无需手动更新 ID 列表）
- 初始数据：4 个区域（绵阳区 4 店、常熟区 3 店、德阳区 1 店、江油区 1 店）

## [1.6.0] - 2026-02-26

### 新增 (Added)
- 区域管理层支持 — 管理层可配置管辖门店范围，只看自己负责的门店数据
- `master_employee.managed_restaurant_ids` 字段 — UUID 数组，存储管辖门店 ID
- 认证系统返回 `managedRestaurantIds` — JWT + 前端 User 接口同步扩展
- `useManagedScope` hook — 前端统一获取管辖范围，自动拼接 `managed_ids` 查询参数
- 基准对比面板 — 区域管理层总览页底部显示"我的区域 vs 全公司"（情绪分/覆盖率/完成率）
- 智能信号检测 — 连续无桌访、高优待办超期、情绪分连续下降自动预警
- 改善亮点卡片 — 展示全公司标杆门店（情绪分/完成率最佳），自己门店标绿
- `GET /api/dashboard/benchmark` 端点 — 区域 vs 全公司对比 + 信号检测 + 亮点
- 所有管理层 API 端点支持 `managed_ids` 查询参数（briefing、overview、coverage、sentiment、suggestions、meeting）

### 变更 (Changed)
- 总览/洞察/会议/智库页面对区域管理层自动过滤为管辖门店数据
- 会议录制页门店下拉只显示管辖门店
- AI 智库数据查询范围限定为管辖门店
- 总部管理层（`managedRestaurantIds=null`）行为完全不变，向后兼容

## [1.5.0] - 2026-02-26

### 新增 (Added)
- 员工产品反馈功能 — 所有角色（店长/厨师长/管理层）可通过文字或语音提交产品反馈
- 反馈 AI 自动分类 — DeepSeek 自动识别分类（bug/功能需求/易用性/性能/内容质量）、优先级、摘要、标签
- 反馈提交页 `/feedback` — 支持文字输入和语音录制两种模式，提交后展示 AI 分类结果
- 我的反馈页 `/feedback/history` — 查看自己提交的反馈列表、状态更新、管理层回复
- 管理层反馈管理 — 洞察页新增"员工反馈"tab，支持按状态/分类筛选、更新状态、回复反馈
- UserMenu 添加"提交反馈"和"我的反馈"入口（所有角色可见）
- 新建 `lingtin_product_feedback` 数据表，含 RLS、索引、自动更新时间
- 后端 FeedbackModule — 7 个 API 端点（提交/语音上传/处理/查询/状态更新/回复）

## [1.4.0] - 2026-02-26

### 新增 (Added)
- 管理层「会议」Tab — 底部导航新增第三个 Tab，查看跨门店会议纪要
- 管理层会议概览页 `/admin/meetings` — 按日期浏览各门店会议，支持"我的会议"折叠区
- 管理层会议录制页 `/admin/meetings/record` — 全屏录制模式，支持经营会/店长沟通两种类型
- 后端 `GET /api/meeting/admin-overview` 端点 — 跨门店会议聚合查询，按门店分组+我的会议分离
- 新增会议类型：`cross_store_review`（跨门店经营分析会）、`one_on_one`（与店长一对一沟通）
- AI 会议纪要针对新类型优化 — 经营会侧重跨店对比和统一决策，沟通会侧重根因分析和承诺事项
- 智能议题卡 — 录制页展示昨日简报问题，辅助管理层会议讨论

### 变更 (Changed)
- 管理层底部导航 4 Tab → 新 4 Tab：总览 / 洞察 / 会议 / 智库（原顾客洞察+产品洞察合并为洞察）
- 洞察页 `/admin/insights` 合并顾客洞察和产品洞察，分段控制切换
- `/admin/question-templates` 和 `/admin/staff-questions` 重定向至 `/admin/insights`

## [1.3.3] - 2026-02-26

### 修复 (Fixed)
- 管理层总览/门店网格默认查「昨日」数据 — 修复前端标题说"昨日"但后端查"今日"导致凌晨/上午无数据的问题
- 厨师长菜品排行改用 `feedbacks` JSONB 提取 — 弃用空表 `lingtin_dish_mentions`，直接从 AI 流水线实际写入的 feedbacks 读取
- AI 流水线补充 `keywords` 字段保存 — 修复门店网格关键词云始终为空的问题

### 变更 (Changed)
- `lingtin_dish_mentions` 表标记为废弃（数据已由 `feedbacks` JSONB 替代，表暂不删除）

## [1.3.2] - 2026-02-26

### 新增 (Added)
- 管理层「总览」页 — 合并原简报 + 看板为统一入口（紧凑指标行 + 问题卡片 + 今日关键词 + 门店网格）
- 管理层「顾客洞察」页 — 顾客建议（近 7 天跨门店聚合）+ 反馈热词（高频差评/好评）
- 管理层「产品洞察」页 — 跨门店员工问题聚类（话题卡片按关注人数排序，3+ 门店标记共同关注）
- 后端 `GET /api/staff/insights` 端点 — 聚合 chat_history + visit_records，关键词分类为 7+1 话题
- UserMenu 新增「问卷管理」入口 — 管理员可从头像菜单进入问卷 CRUD 页面
- 溯源能力增强 — 总览问题卡片 / 顾客洞察建议+热词 均可展开查看原始 Q&A 对话 + 原声播放
- 后端 briefing / suggestions API 返回 `managerQuestions` + `customerAnswers` 字段
- Mock 模式增强 — JWT Guard 支持 mock mode 跳过认证，所有 dashboard API 含丰富 mock 数据

### 变更 (Changed)
- 管理层底部导航 5 Tab → 4 Tab：总览 / 顾客洞察 / 产品洞察 / 智库
- `/admin/dashboard` 重定向至 `/admin/briefing`（看板合入总览）
- 问卷模板 CRUD 移至 `/admin/question-templates/manage` 子路由
- 简报页标题「每日简报」→「总览」，移除「查看全部门店」链接和顾客建议区块
- 全角色视觉风格统一 — 卡片 `rounded-2xl shadow-sm`、emoji 标题→彩色圆点、音频按钮→SVG 圆形播放键、Q&A 展开→`border-primary-200` 对齐标签
- 涉及页面：店长看板、厨师长待办/菜品/会议、管理层总览/顾客洞察/产品洞察/门店详情

### 修复 (Fixed)
- 顾客洞察页 `isLoading` 逻辑错误：`sugLoading && sentLoading` → `sugLoading || sentLoading`

## [1.3.1] - 2026-02-25

### 新增 (Added)
- AI 自动识别顾客建议 — feedbacks 新增 `suggestion` 情绪类型，区分"建议加冷面"与"上菜太慢"等评价
- 后端 `GET /api/dashboard/suggestions` 端点 — 按文本聚合建议，支持单店/跨门店 + 滚动天数窗口
- 管理层简报页「💡 顾客建议 · 近 7 天」区块 — 跨门店聚合建议，含来源门店 + 桌号 + 原声播放
- 店长看板顾客反馈模块新增「💡 顾客建议」子区块 — 本店近 7 天建议列表

## [1.3.0] - 2026-02-25

### 新增 (Added)
- 管理层每日简报页 `/admin/briefing` — 跨门店异常检测，问题卡片自带顾客原话 + 原声播放
- 后端 `GET /api/dashboard/briefing` 端点 — 聚合全门店数据，按规则检测运营/执行异常
- 店长看板「顾客反馈」模块 — 从纯菜品 TOP5 改为全维度（🍳菜品 + ⏱️服务 + 😐态度 + 🏠环境），按严重度排序
- 店长看板「话术使用」分优劣 — 💡优秀示范 / ⚠️可以更好，各附简短原因
- 店长看板「情绪概览」趋势对比 — 昨日对比箭头（↑绿 / ↓红）
- AI 智库空状态个性化问题 — 基于当天覆盖率 + 负面反馈动态生成快捷问题
- 厨师长菜品页扩展为「厨房反馈」— 覆盖出菜速度⏱️、温度🌡️、卖相🎨、食材🥬（不只口味）
- 厨师长菜品页行动按钮 — 每项问题可「已改善」或「查看待办」
- 厨师长待办页「建议优先处理」— 按频次 × 优先级排序，top 2 高亮红框

### 变更 (Changed)
- 管理员登录后默认跳转 `/admin/briefing`（原 `/admin/dashboard`）
- AdminBottomNav 新增「简报」入口
- 厨师长待办页扩展过滤范围 — 包含 `service_speed` + 厨房关键词匹配
- 录音历史组件状态汇总条 — 顶部显示完成/处理中/失败计数，失败项置顶
- 恢复隐身模式 — 桌访录音时自动弹出微信假界面，录音中可手动切换

## [1.2.0] - 2026-02-25

### 新增 (Added)
- 厨师长角色 — 3 个页面：厨房待办(/chef/dashboard)、菜品反馈(/chef/dishes)、厨房会议(/chef/meetings)
- 菜品反馈页「问题优先」布局 — 差评菜置顶 + 展开对话溯源 + 播放原声录音
- ChefBottomNav 底部导航 + head_chef 角色路由跳转
- 录音页激励横幅 — 每日暖心语 + 累计统计（桌访/好评/改善）
- 看板录音播放 — 情绪气泡展开后「原声」按钮播放桌访录音
- 例会模式新增「厨房会议」类型 (kitchen_meeting)
- 厨师长使用指南 docs/user-guides/chef.md
- 共享常量：action-item-constants.ts、date-utils.ts

### 变更 (Changed)
- 录音页视觉优化 Phase 2 — 间距节奏、44px 触控目标、会议类型配色
- 问卷收束提示默认展开可见
- 录音按钮增加 disabledHint（例会未选类型时提示）
- auth header 统一使用 getAuthHeaders()
- 产品使用指南更新 — store-manager.md、README.md 新增厨师长相关内容

### 修复 (Fixed)
- NegContext 类型导出 — dashboard.service.ts 内部 interface 移至顶层 export，修复 TS4055

### 移除 (Removed)
- 隐身模式 — 删除 StealthOverlay 组件及相关逻辑
- chef/dishes 页面 mock 数据

## [1.1.1] - 2026-02-24

### 新增 (Added)
- 看板反馈录音播放 — 情绪标签弹窗内有音频的反馈显示「原声」按钮，支持播放/暂停/切换
- 录音页激励横幅 — 每日轮换暖心语 + 3 个累计统计（总桌访、好评数、已改善）
- 后端 `GET /api/dashboard/motivation-stats` 端点

### 变更 (Changed)
- 录音页视觉优化 Phase 2 — 间距节奏、44px 触控目标、会议类型配色（餐前会蓝/复盘琥珀/周例会紫）
- 问卷收束提示默认展开 + 琥珀色配色

### 修复 (Fixed)
- 问卷收束提示在折叠状态下不可见

## [1.1.0] - 2026-02-22

### 新增 (Added)
- 例会录音功能 — 餐前会/每日复盘/周例会，AI 自动生成会议纪要（摘要 + 关键决定 + 行动待办）
- 每日运营闭环 — 21:00 自动聚合桌访数据生成复盘议题（MeetingAgendaCard），次日餐前会展示昨日待办（PreMealReminder）
- DashScope Paraformer-v2 STT 集成（讯飞自动回退）
- 问卷模板系统 — 管理端 CRUD，录音时自动展示给店长
- 每日总结定时任务模块 (daily-summary)
- 店长培训 PPT (docs/store-manager-guide.pptx)
- 用户使用指南按角色重构（store-manager.md / management.md / staff.md）
- 数据库：lingtin_meeting_records、lingtin_question_templates、lingtin_daily_summaries 表

### 变更 (Changed)
- AI 模型从 Gemini 2.5 Flash 切换至 DeepSeek Chat V3（via OpenRouter）
- 讯飞 STT 收到非零 code 时若已有部分结果则 resolve 而非 reject
- 录音页支持桌访/例会双模式切换
- 音频码率 48kbps → 96kbps

### 修复 (Fixed)
- 线上空白区块 + action_items 自动生成 cron 修复
- cron 端点添加名称防止 Node 18 crypto.randomUUID 崩溃

## [1.0.3] - 2026-02-18

### 新增 (Added)
- 例会录音模块 — 餐前会/每日复盘/周例会录音 + AI 生成纪要
- 问卷模板管理 — 管理端 CRUD + 店长录音前自动提示
- Admin 底部导航栏新增「问卷」入口
- 产品文档：DATABASE.md、DEPLOYMENT.md、DEVELOPMENT.md、PRD.md、PRODUCT-USAGE.md
- 产品使用手册 docs/user-guides/（店长 + 管理层 + 店员）
- 数据库：lingtin_action_items、lingtin_meeting_records、lingtin_question_templates 表

### 变更 (Changed)
- 情绪评分优化 — AI prompt 增加客观评判规则、三段式边界 + 5 档锚定示例

## [1.0.2] - 2026-02-17

### 新增 (Added)
- 数据看板恢复菜品提及 TOP 5 排行榜（进度条 + 好评/差评标签）
- AI 行动建议模块 — 基于当日负面反馈自动生成 3-5 条改善建议，店长可知悉/解决/忽略
- MOCK_MODE 环境变量支持本地无 Supabase 开发

## [1.0.0] - 2026-02-16

### 新增 (Added)
- 录音采集 — 店长选择桌号后一键录音，音频上传 Supabase Storage
- STT 语音识别 — 讯飞方言大模型 WebSocket 集成，支持普通话及方言
- AI 自动分析 — 5 维度打标（情绪分、摘要、关键词、店长话术、顾客回复）
- 数据看板 — 今日桌访统计、情绪分布、反馈气泡弹窗
- AI 智库 — Text-to-SQL 自然语言查询，支持多轮对话
- 认证系统 — Supabase Auth + JWT，角色路由（店长/管理员）
- 管理端 — 多店经营看板、门店详情、员工提问分析
- PWA 支持 — 离线缓存、添加到主屏幕
- 部署 — Cloudflare Pages (前端) + Zeabur (后端)
