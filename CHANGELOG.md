# Changelog

本文件记录 Lingtin 语音智能管理平台的所有重要变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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
