# 数据库设计

## 命名规范

- 所有新表使用 `lingtin_` 前缀
- 已有主数据表使用 `master_` 前缀
- 已有业务数据表使用 `mt_` 前缀

## 现有表（只读引用）

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `master_restaurant` | 餐厅主表 | id, restaurant_name, brand_id, region_id |
| `master_employee` | 员工表（含店长） | id, employee_name, restaurant_id, role_code, managed_region_ids |
| `master_region` | 区域表 | id, region_name, region_code, parent_region_id, is_active |
| `mt_dish_sales` | 菜品销售数据 | 菜品名称, 销售数量, restaurant_id |

### master_region (区域表)

门店按地理区域分组，用于管理层按区域管辖门店。

```sql
id UUID PRIMARY KEY
region_name VARCHAR(50) NOT NULL    -- 区域名称：绵阳区、常熟区
region_code VARCHAR(30)             -- 区域编码：mianyang、changshu
parent_region_id UUID               -- 预留层级（暂不用）
is_active BOOLEAN NOT NULL DEFAULT true
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**关联**：`master_restaurant.region_id` → `master_region.id`（门店属于哪个区域）
**管理员分配**：`master_employee.managed_region_ids UUID[]`（管理员管辖哪些区域）

**权限解析优先级**：`managed_restaurant_ids` > `managed_region_ids` > `managed_brand_id` > 全部（总部）

## Lingtin 核心表

### lingtin_dishname_view (视图)

从 `mt_dish_sales` 提取去重菜品名称，用于STT语音纠偏。

```sql
-- 字段
dish_name TEXT      -- 标准菜品名称
aliases TEXT[]      -- 别名数组（预留扩展）
```

### lingtin_visit_records (桌访录音表)

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

### lingtin_dish_mentions (菜品提及表)

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

### lingtin_table_sessions (开台数据表)

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

### lingtin_action_items (AI行动建议表)

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

## 表关系图

```
master_region (1)
    │
    └──< master_restaurant (N)  -- region_id

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
    ├──< lingtin_visit_records (N)
    │
    └──> master_region (M:N via managed_region_ids[])

lingtin_dishname_view
    │
    └── (语义关联) lingtin_dish_mentions.dish_name
```
