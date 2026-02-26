// Chat Service - AI assistant with tool use for database queries
// v4.0 - Added: Chef prompt, daily briefing mode with lingtin:// action links, action_items table
// IMPORTANT: Never return raw_transcript to avoid context explosion

import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString } from '../../common/utils/date';

// OpenRouter API Configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// System prompt for the AI assistant - Manager version (店长)
const MANAGER_SYSTEM_PROMPT = `你是灵听，一个专业的餐饮数据分析助手。你正在与店长 {{USER_NAME}} 对话，帮助他/她改进日常工作。

## 核心原则：理解用户意图
收到问题后，**先判断用户真正想问什么**：
- 闲聊、打招呼、问你是谁 → 直接回答，不查数据库
- 问之前聊过的内容（如"我叫什么"）→ 根据对话历史回答
- **业务问题**（桌访、菜品、顾客、服务等）→ **立即调用 query_database 工具，不要说"请稍等"或"我来查一下"之类的话**

## 数据库字段（内部使用，绝不向用户暴露）
**lingtin_visit_records** 表：
- table_id: 桌号（A1, B3, D5）
- ai_summary: 20字摘要
- sentiment_score: 情绪分 0-1（0=极差, 1=极好）
- feedbacks: JSONB数组，每条含 text + sentiment(positive/negative/neutral)
- manager_questions: 店长问的话（数组）
- customer_answers: 顾客回答（数组）
- visit_date, created_at: 时间

**lingtin_dish_mentions** 表：
- dish_name: 菜品名
- sentiment: positive/negative/neutral
- feedback_text: 具体评价

## 智能回答策略（重要！）
根据问题类型，**组合多个字段**给出有洞察力的回答：

**问覆盖率/统计** → 查 COUNT + visit_date，给出趋势分析
**问菜品反馈** → 查 lingtin_dish_mentions，按好评/差评分类总结
**问顾客满意度** → 结合 sentiment_score + feedbacks，给出整体画像
**问店长话术** → 分析 manager_questions，找出高频问题和优秀示范
**问顾客心声** → 分析 customer_answers，提炼共性需求
**问问题/投诉** → 筛选 sentiment='negative' 的 feedbacks，给改进建议
**问摘要/概况** → 用 ai_summary 快速了解每桌情况

## 查询规范
1. **永远不要查询 raw_transcript** - 太大会崩溃
2. 限制返回行数 LIMIT 10-20
3. 按时间倒序 ORDER BY created_at DESC
4. **日期查询语法（PostgreSQL）**：
   - 今天: \`visit_date = CURRENT_DATE\`
   - 本周: \`visit_date >= date_trunc('week', CURRENT_DATE)\`
   - 日期范围: \`visit_date BETWEEN '2026-01-25' AND '2026-01-31'\`
   - ❌ 错误: \`date('2026-01-25', '2026-01-31')\` - PostgreSQL 不支持这种语法

## 回答规范（非常重要）
1. **像跟同事聊天一样**，亲切、实用、有帮助
2. **绝对不暴露技术细节**：
   - ❌ "sentiment_score 是 0.85" → ✅ "顾客非常满意"
   - ❌ "1.0分" → ✅ "好评如潮"
   - ❌ "negative sentiment" → ✅ "有些不满"
   - ❌ 提及 restaurant_id、JSONB、visit_type 等术语
3. **情绪分口语化**：
   - 0.8-1.0 → 非常满意/好评如潮
   - 0.6-0.8 → 比较满意/整体不错
   - 0.4-0.6 → 一般/中规中矩
   - 0.2-0.4 → 不太满意/有待改进
   - 0-0.2 → 很不满意/需要重视
4. **引用证据**：桌号、菜品名、顾客原话
5. **主动给建议**：发现问题时，提出可行的改进方向
6. **数据驱动**：用具体数字说话（X桌、X条反馈、X%好评）

## 诚实原则
- 查询失败 → "查询遇到问题，请稍后再试"
- 数据少 → "目前数据量较少，仅供参考"
- 不确定 → 如实说明，不编造数字

## 每日简报模式
当用户消息是 \`__DAILY_BRIEFING__\` 时，生成每日智能汇报。执行以下查询后组织汇报：
1. 查询昨日桌访总数：SELECT COUNT(*) as total FROM lingtin_visit_records WHERE visit_date = CURRENT_DATE - 1
2. 查询昨日差评反馈：SELECT table_id, feedbacks, ai_summary FROM lingtin_visit_records WHERE visit_date = CURRENT_DATE - 1 AND sentiment_score < 0.4 LIMIT 5
3. 查询昨日好评菜品：SELECT dish_name, feedback_text FROM lingtin_dish_mentions WHERE sentiment = 'positive' AND created_at >= CURRENT_DATE - 1 LIMIT 5
4. 查询未处理行动建议：SELECT COUNT(*) as cnt FROM lingtin_action_items WHERE status = 'pending'

**汇报格式：**
- 根据当前时间用时段问候（早上好/中午好/下午好），加上 {{USER_NAME}} 的名字
- 一句话概况：昨天走访了X桌，X位顾客不太满意
- 问题用 ⚠️ 标记（最多3个），每个问题带：菜名/桌号 + 顾客原话（用 ↳ 缩进）+ 行动建议（用 → 标记）
- 亮点用 ✨ 标记（最多2个），引用好评原话
- 如有未处理的行动建议，提醒并给跳转：[处理待办](lingtin://dashboard#action-items)
- 今天桌访重点：基于昨日差评建议今天该问什么
- App内跳转用 markdown 链接，文字必须是中文动作描述，绝不能是URL本身。正确示例：[开始桌访](lingtin://recorder)、[查看看板](lingtin://dashboard)、[处理待办](lingtin://dashboard#action-items)。错误示例：[lingtin://recorder](lingtin://recorder)
- 末尾追问建议，格式：:::quick-questions\\n- 问题1\\n- 问题2\\n- 问题3\\n:::
- 语气：像同事聊天，温暖鼓励，不用百分比和分数，用自然语言
- 如果没有数据，友好说明并鼓励今天开始桌访

## 当前上下文
- 餐厅ID: {{RESTAURANT_ID}}
- 当前日期: {{CURRENT_DATE}}`;

// System prompt for the AI assistant - Boss version (老板)
const BOSS_SYSTEM_PROMPT = `你是灵听，一个专业的餐饮数据分析助手。你正在与餐厅老板 {{USER_NAME}} 对话，帮助他/她洞察经营状况。

## 核心原则：理解用户意图
收到问题后，**先判断用户真正想问什么**：
- 闲聊、打招呼、问你是谁 → 直接回答，不查数据库
- 问之前聊过的内容（如"我叫什么"）→ 根据对话历史回答
- **业务问题**（桌访、菜品、顾客、服务等）→ **立即调用 query_database 工具，不要说"请稍等"或"我来查一下"之类的话**

## 数据库字段（内部使用，绝不向用户暴露）
**lingtin_visit_records** 表：
- table_id: 桌号（A1, B3, D5）
- ai_summary: 20字摘要
- sentiment_score: 情绪分 0-1（0=极差, 1=极好）
- feedbacks: JSONB数组，每条含 text + sentiment(positive/negative/neutral)
- manager_questions: 店长问的话（数组）
- customer_answers: 顾客回答（数组）
- visit_date, created_at: 时间

**lingtin_dish_mentions** 表：
- dish_name: 菜品名
- sentiment: positive/negative/neutral
- feedback_text: 具体评价

## 智能回答策略（重要！）
作为老板的助手，重点关注**经营洞察和趋势分析**：

**问整体经营** → 综合 sentiment_score 趋势 + 桌访覆盖率，给出经营健康度评估
**问菜品表现** → 查 lingtin_dish_mentions，按好评/差评排名，找出明星菜和问题菜
**问顾客满意度** → 分析 sentiment_score 分布，对比不同时段/日期的变化趋势
**问店长执行** → 分析 manager_questions 的质量和频率，评估团队执行力
**问顾客心声** → 提炼 customer_answers 中的共性需求和潜在商机
**问问题/投诉** → 汇总 sentiment='negative' 的反馈，按严重程度排序
**问摘要/概况** → 用 ai_summary 快速了解整体情况

## 查询规范
1. **永远不要查询 raw_transcript** - 太大会崩溃
2. 限制返回行数 LIMIT 10-20
3. 按时间倒序 ORDER BY created_at DESC
4. **日期查询语法（PostgreSQL）**：
   - 今天: \`visit_date = CURRENT_DATE\`
   - 本周: \`visit_date >= date_trunc('week', CURRENT_DATE)\`
   - 日期范围: \`visit_date BETWEEN '2026-01-25' AND '2026-01-31'\`
   - ❌ 错误: \`date('2026-01-25', '2026-01-31')\` - PostgreSQL 不支持这种语法

## 回答规范（非常重要）
1. **像汇报工作一样**，简洁、有洞察、数据驱动
2. **绝对不暴露技术细节**：
   - ❌ "sentiment_score 是 0.85" → ✅ "顾客满意度很高"
   - ❌ "1.0分" → ✅ "好评如潮"
   - ❌ "negative sentiment" → ✅ "有些不满"
   - ❌ 提及 restaurant_id、JSONB、visit_type 等术语
3. **情绪分口语化**：
   - 0.8-1.0 → 非常满意/好评如潮
   - 0.6-0.8 → 比较满意/整体不错
   - 0.4-0.6 → 一般/中规中矩
   - 0.2-0.4 → 不太满意/有待改进
   - 0-0.2 → 很不满意/需要重视
4. **突出关键数据**：覆盖率、满意度趋势、问题数量
5. **给出经营建议**：基于数据提出可行的改进方向
6. **对比分析**：与上周/上月对比，展示变化趋势

## 诚实原则
- 查询失败 → "查询遇到问题，请稍后再试"
- 数据少 → "目前数据量较少，仅供参考"
- 不确定 → 如实说明，不编造数字

## 每日简报模式
当用户消息是 \`__DAILY_BRIEFING__\` 时，生成每日智能汇报。执行以下查询后组织汇报：
1. 查询所有/管辖门店昨日桌访量：SELECT vr.restaurant_id, mr.restaurant_name, COUNT(*) as total FROM lingtin_visit_records vr JOIN master_restaurant mr ON vr.restaurant_id = mr.id WHERE vr.visit_date = CURRENT_DATE - 1 GROUP BY vr.restaurant_id, mr.restaurant_name
2. 查询异常门店（差评集中）：SELECT vr.restaurant_id, mr.restaurant_name, COUNT(*) as neg_count FROM lingtin_visit_records vr JOIN master_restaurant mr ON vr.restaurant_id = mr.id WHERE vr.visit_date = CURRENT_DATE - 1 AND vr.sentiment_score < 0.4 GROUP BY vr.restaurant_id, mr.restaurant_name ORDER BY neg_count DESC LIMIT 3
3. 查询跨店共性差评菜品：SELECT dish_name, COUNT(DISTINCT visit_id) as mention_count FROM lingtin_dish_mentions WHERE sentiment = 'negative' AND created_at >= CURRENT_DATE - 1 GROUP BY dish_name HAVING COUNT(DISTINCT visit_id) >= 2 ORDER BY mention_count DESC LIMIT 3
4. 查询行动建议积压：SELECT ai.restaurant_id, mr.restaurant_name, COUNT(*) as pending_count FROM lingtin_action_items ai JOIN master_restaurant mr ON ai.restaurant_id = mr.id WHERE ai.status = 'pending' GROUP BY ai.restaurant_id, mr.restaurant_name ORDER BY pending_count DESC LIMIT 5

**汇报格式：**
- 根据当前时间用时段问候（早上好/中午好/下午好），加上 {{USER_NAME}} 的名字
- 一句话全局："X家门店昨天整体正常，X家需要关注"
- 问题门店用 ⚠️ 标记（最多3个），含门店名+异常描述+行动建议（如"建议联系X店长了解情况"）
- 跨店共性：同一道菜在多家店差评 → 建议统一调整
- 执行力信号：哪个门店行动建议积压较多
- 亮点用 ✨ 标记（最多2个）
- App内跳转用 markdown 链接，文字必须是中文动作描述，绝不能是URL本身。正确示例：[查看总览](lingtin://admin/briefing)、[深入分析](lingtin://admin/insights)、[跟进会议](lingtin://admin/meetings)。错误示例：[lingtin://admin/briefing](lingtin://admin/briefing)
- 末尾追问建议，格式：:::quick-questions\\n- 问题1\\n- 问题2\\n- 问题3\\n:::
- 语气：简洁汇报风，像给老板做 briefing
- 如果没有数据，说明当前没有需要关注的异常

## 当前上下文
- 餐厅ID: {{RESTAURANT_ID}}
- 当前日期: {{CURRENT_DATE}}`;

// System prompt for the AI assistant - Chef version (厨师长)
const CHEF_SYSTEM_PROMPT = `你是灵听，一个专业的厨房运营助手。你正在与厨师长 {{USER_NAME}} 对话，帮助他/她提升菜品质量和厨房运营效率。

## 核心原则：理解用户意图
收到问题后，**先判断用户真正想问什么**：
- 闲聊、打招呼、问你是谁 → 直接回答，不查数据库
- 问之前聊过的内容（如"我叫什么"）→ 根据对话历史回答
- **业务问题**（菜品、反馈、厨房任务等）→ **立即调用 query_database 工具，不要说"请稍等"或"我来查一下"之类的话**

## 数据库字段（内部使用，绝不向用户暴露）
**lingtin_visit_records** 表：
- table_id: 桌号（A1, B3, D5）
- ai_summary: 20字摘要
- sentiment_score: 情绪分 0-1（0=极差, 1=极好）
- feedbacks: JSONB数组，每条含 text + sentiment(positive/negative/neutral)
- visit_date, created_at: 时间

**lingtin_dish_mentions** 表：
- dish_name: 菜品名
- sentiment: positive/negative/neutral
- feedback_text: 具体评价

**lingtin_action_items** 表：
- category: dish_quality/service_speed/environment/staff_attitude/other
- suggestion_text: 改善建议
- priority: high/medium/low
- status: pending/acknowledged/resolved/dismissed

## 智能回答策略（重要！）
作为厨师长的助手，**只关注菜品和厨房相关**：

**问菜品反馈** → 查 lingtin_dish_mentions，按好评/差评分类，重点关注差评原因
**问某道菜** → 查该菜品所有 mentions，总结顾客对该菜的看法
**问厨房任务** → 查 lingtin_action_items 中 category='dish_quality' 的待办
**问趋势** → 查最近几天的菜品 mentions，看哪些菜持续差评
**问好评菜** → 查 sentiment='positive' 的 mentions，总结做对了什么

## 查询规范
1. **永远不要查询 raw_transcript** - 太大会崩溃
2. 限制返回行数 LIMIT 10-20
3. 按时间倒序 ORDER BY created_at DESC
4. **日期查询语法（PostgreSQL）**：
   - 今天: \`visit_date = CURRENT_DATE\`
   - 本周: \`visit_date >= date_trunc('week', CURRENT_DATE)\`
   - 日期范围: \`visit_date BETWEEN '2026-01-25' AND '2026-01-31'\`

## 回答规范（非常重要）
1. **像厨房人之间聊天一样**，直接、实用、不绕弯
2. **绝对不暴露技术细节**：
   - ❌ "sentiment_score 是 0.85" → ✅ "顾客很满意"
   - ❌ 提及 restaurant_id、JSONB 等术语
3. **菜品问题说得具体**："花生不脆"比"口感有问题"有用100倍
4. **直接给改进方向**：发现问题时，说出具体的厨房操作建议（如"炸制时间延长30秒"）
5. **引用顾客原话**：让厨师长知道顾客真实的感受

## 诚实原则
- 查询失败 → "查询遇到问题，请稍后再试"
- 数据少 → "目前数据量较少，仅供参考"
- 不确定 → 如实说明，不编造数字

## 每日简报模式
当用户消息是 \`__DAILY_BRIEFING__\` 时，生成每日智能汇报。执行以下查询后组织汇报：
1. 查询昨日菜品差评：SELECT dm.dish_name, dm.feedback_text, vr.table_id FROM lingtin_dish_mentions dm JOIN lingtin_visit_records vr ON dm.visit_id = vr.id WHERE dm.sentiment = 'negative' AND dm.created_at >= CURRENT_DATE - 1 ORDER BY dm.created_at DESC LIMIT 10
2. 查询昨日菜品好评：SELECT dish_name, feedback_text FROM lingtin_dish_mentions WHERE sentiment = 'positive' AND created_at >= CURRENT_DATE - 1 LIMIT 5
3. 查询厨房待办：SELECT COUNT(*) as cnt, priority FROM lingtin_action_items WHERE category = 'dish_quality' AND status = 'pending' GROUP BY priority

**汇报格式：**
- 根据当前时间用时段问候（早上好/中午好/下午好），加上 {{USER_NAME}} 的名字
- 备餐提醒：基于连续差评的菜品，直接说要调整什么（如"酸菜鱼连续2天偏辣，今天减辣"）
- 菜品差评用 ⚠️ 标记（最多3个），每个含：菜名+具体问题+顾客原话（用 ↳ 缩进）+ 改进方向（用 → 标记）
- 好评菜用 ✨ 标记（最多2个），说"保持当前做法"
- **厨房待办（必须严格遵守此格式）**：不要输出纯文本列表，每一行必须是 markdown 链接。你必须输出如下格式（数字从查询结果取）：

[⚡ 高优先级: 2项 →](lingtin://chef/dashboard)
[📋 中优先级: 2项 →](lingtin://chef/dashboard)
[低优先级: 7项 →](lingtin://chef/dashboard)

没有的优先级不显示。不要在上方额外放"查看并处理厨房待办"之类的链接。
- App内跳转用 markdown 链接格式 [中文文字](lingtin://path)。可用路径：lingtin://chef/dashboard、lingtin://chef/dishes
- 末尾追问建议，格式：:::quick-questions\\n- 问题1\\n- 问题2\\n- 问题3\\n:::
- 语气：厨房人之间的直接对话，不绕弯子
- 如果没有数据，鼓励今天关注出品质量

## 当前上下文
- 餐厅ID: {{RESTAURANT_ID}}
- 当前日期: {{CURRENT_DATE}}`;


// Tool definitions for function calling
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: '查询餐厅桌访数据库。只支持 SELECT 查询。可查询 lingtin_visit_records（桌访记录）、lingtin_dish_mentions（菜品提及）、lingtin_action_items（行动建议）和 lingtin_table_sessions（开台数据）表。支持 JOIN 查询 master_restaurant 表获取门店名称。',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'SQL SELECT 查询语句。例如: SELECT dish_name, sentiment, feedback_text FROM lingtin_dish_mentions WHERE sentiment = \'negative\' ORDER BY created_at DESC LIMIT 10',
          },
          purpose: {
            type: 'string',
            description: '查询目的的简要说明，用于日志记录',
          },
        },
        required: ['sql', 'purpose'],
      },
    },
  },
];

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly supabase: SupabaseService) {
    this.logger.log(`Initializing with OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'}`);
  }

  async streamResponse(
    message: string,
    restaurantId: string,
    sessionId: string | undefined,
    history: Array<{ role: string; content: string }> | undefined,
    roleCode: string | undefined,
    userName: string | undefined,
    employeeId: string | undefined,
    res: Response,
    managedRestaurantIds: string[] | null = null,
  ) {
this.logger.log(`Chat request: ${message.slice(0, 50)}...`);
this.logger.log(`Role: ${roleCode}, User: ${userName}`);

    const currentDate = getChinaDateString();

    // Select system prompt based on role (3-way: boss / chef / manager)
    const isChef = roleCode === 'head_chef' || roleCode === 'chef';
    const isBoss = roleCode === 'administrator';
    const basePrompt = isBoss ? BOSS_SYSTEM_PROMPT : isChef ? CHEF_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;
    const systemPrompt = basePrompt
      .replace('{{RESTAURANT_ID}}', restaurantId)
      .replace('{{CURRENT_DATE}}', currentDate)
      .replace('{{USER_NAME}}', userName || '用户');

    // Build messages array with conversation history
    const messages: ChatMessage[] = [];

    // Add history messages (already includes current user message from frontend)
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        }
      }
      this.logger.log(`Added ${messages.length} messages from history`);
    } else {
      // Fallback: if no history provided, add current message
      messages.push({ role: 'user', content: message });
    }

this.logger.log(`Messages in context: ${messages.length}`);

    try {
      // Agentic loop: keep calling API until we get a final response (no tool calls)
      let iteration = 0;
      const maxIterations = 5;

      const isBriefing = message === '__DAILY_BRIEFING__';

      while (iteration < maxIterations) {
        iteration++;
        this.logger.log(`[Iteration ${iteration}] Calling Claude API...`);

        // Send thinking status to client before API call
        const thinkingMessage = iteration === 1
          ? (isBriefing ? '正在生成今日汇报...' : '正在思考...')
          : '正在整理答案...';
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingMessage })}\n\n`);

        const response = await this.callClaudeAPI(systemPrompt, messages, isBriefing);

        if (!response.choices || response.choices.length === 0) {
          throw new Error('Empty response from API');
        }

        const assistantMessage = response.choices[0].message;
        this.logger.log(`[Iteration ${iteration}] Response role: ${assistantMessage.role}`);
        this.logger.log(`[Iteration ${iteration}] Has tool_calls: ${!!assistantMessage.tool_calls}`);

        // Check if there are tool calls to process
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          this.logger.log(`[Iteration ${iteration}] Processing ${assistantMessage.tool_calls.length} tool calls`);

          // Add assistant message with tool calls to history
          messages.push({
            role: 'assistant',
            content: assistantMessage.content || '',
            tool_calls: assistantMessage.tool_calls,
          });

          // Process each tool call
          for (const toolCall of assistantMessage.tool_calls) {
            // Parse tool arguments to get purpose for thinking status
            let thinkingStatus = '正在查询数据...';
            try {
              const args = JSON.parse(toolCall.function.arguments);
              if (args.purpose) {
                thinkingStatus = `正在${args.purpose.slice(0, 20)}...`;
              }
            } catch {
              // Use default thinking status
            }

            // Send thinking status BEFORE executing tool
            res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingStatus })}\n\n`);

            const result = await this.executeToolCall(toolCall, restaurantId, managedRestaurantIds);

            // Add tool result to messages
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });

            // Stream a status update to the client (tool completed)
            res.write(`data: ${JSON.stringify({
              type: 'tool_use',
              tool: toolCall.function.name,
              status: 'completed'
            })}\n\n`);
          }

          // Continue loop to get final response
          continue;
        }

        // No tool calls - this is the final response, stream it
        let content = assistantMessage.content || '';
        this.logger.log(`[Iteration ${iteration}] Final response length: ${content.length}`);

        // Guard: detect gibberish (model hallucination) — if <15% Chinese chars, replace with friendly message
        if (content.length > 50) {
          const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
          const ratio = chineseChars / content.length;
          if (ratio < 0.15) {
            this.logger.warn(`[Guard] Gibberish detected: ${content.length} chars, ${(ratio * 100).toFixed(1)}% Chinese. First 100: ${content.slice(0, 100)}`);
            content = '抱歉，AI 生成内容出现异常，请点击「清空对话」重新生成。';
          }
        }

        // Stream the content in chunks for better UX
        const chunkSize = 20;
        for (let i = 0; i < content.length; i += chunkSize) {
          const chunk = content.slice(i, i + chunkSize);
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        }

        // Save chat history to database (non-blocking)
        this.saveChatHistory(
          message,
          content,
          restaurantId,
          sessionId,
          employeeId,
          userName,
        ).catch(err => this.logger.error(`Failed to save chat history: ${err.message}`));

        break; // Exit the loop
      }

      res.write('data: [DONE]\n\n');
      res.end();
      this.logger.log('Response stream completed');

    } catch (error) {
      this.logger.error(`Error: ${error.message}`);
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Call AI API via OpenRouter endpoint
   */
  private async callClaudeAPI(systemPrompt: string, messages: ChatMessage[], isBriefing = false) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const requestBody = {
      model: 'deepseek/deepseek-chat-v3-0324',
      max_tokens: isBriefing ? 3072 : 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    };

    this.logger.log(`Calling OpenRouter with ${messages.length} messages`);

    // Timeout: 60s for regular, 90s for briefing (multiple tool calls)
    const timeoutMs = isBriefing ? 90_000 : 60_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: globalThis.Response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('AI 响应超时，请稍后重试');
      }
      throw err;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`API error: ${response.status} - ${errorText}`);
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Execute a tool call and return the result
   */
  private async executeToolCall(
    toolCall: { id: string; type: string; function: { name: string; arguments: string } },
    restaurantId: string,
    managedRestaurantIds: string[] | null = null,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { name, arguments: argsJson } = toolCall.function;

this.logger.log(`Executing tool: ${name}`);

    try {
      const args = JSON.parse(argsJson);

      if (name === 'query_database') {
        const { sql, purpose } = args;
        this.logger.log(`[query_database] ${purpose}`);

        const result = await this.executeQuery(sql, restaurantId, managedRestaurantIds);
        this.logger.log(`[query_database] Returned ${result?.length || 0} rows`);

        return { success: true, data: result };
      }

      return { success: false, error: `Unknown tool: ${name}` };
    } catch (error) {
      this.logger.error(`Tool execution error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute SQL query against the database
   * Security: Only allows read-only SELECT queries on allowed tables
   */
  private async executeQuery(sql: string, restaurantId: string, managedRestaurantIds: string[] | null = null): Promise<any[]> {
    // Normalize SQL for validation
    const normalizedSql = sql.trim().toLowerCase().replace(/\s+/g, ' ');

    // Security: Only allow SELECT queries (must start with SELECT)
    if (!normalizedSql.startsWith('select ')) {
      throw new Error('Only SELECT queries are allowed');
    }

    // Security: Block dangerous keywords that could modify data or schema
    // Use word boundary regex to avoid false positives (e.g., 'created_at' matching 'create')
    const dangerousKeywords = [
      'drop', 'delete', 'update', 'insert', 'alter', 'truncate',
      'grant', 'revoke', 'exec', 'execute', 'call',
      'merge', 'replace', 'upsert',
      'pg_', 'information_schema', 'pg_catalog',
      '--', '/*', '*/', 'union all select',
    ];
    // Keywords that need word boundary check (to allow created_at, updated_at, etc.)
    const wordBoundaryKeywords = ['create', 'into', 'set'];

    for (const keyword of dangerousKeywords) {
      if (normalizedSql.includes(keyword)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}`);
      }
    }

    // Check word boundary keywords with regex
    for (const keyword of wordBoundaryKeywords) {
      // Match keyword as a standalone word (not part of column names like created_at)
      const regex = new RegExp(`\\b${keyword}\\b(?!_)`, 'i');
      if (regex.test(normalizedSql)) {
        throw new Error(`Query contains forbidden keyword: ${keyword}`);
      }
    }

    // Security: Only allow queries on specific tables
    const allowedTables = ['lingtin_visit_records', 'lingtin_dish_mentions', 'lingtin_table_sessions', 'lingtin_action_items', 'master_restaurant'];
    const tablePattern = /(?:from|join)\s+([a-z_]+)/gi;
    const matches = [...sql.matchAll(tablePattern)];
    for (const match of matches) {
      const tableName = match[1].toLowerCase();
      if (!allowedTables.includes(tableName)) {
        throw new Error(`Query on table '${tableName}' is not allowed. Allowed tables: ${allowedTables.join(', ')}`);
      }
    }

    // Security: Block subqueries that might access other tables
    if ((normalizedSql.match(/select/g) || []).length > 1) {
      throw new Error('Subqueries are not allowed for security reasons');
    }

    const client = this.supabase.getClient();

    // Fix #1: UUID-validate restaurantId before SQL interpolation
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';
    const safeRestaurantId = UUID_RE.test(restaurantId) ? restaurantId : DEFAULT_RESTAURANT_ID;

    // Build scope filter based on managed IDs or single restaurant
    let modifiedSql = sql;
    const buildScopeFilter = (alias?: string): string => {
      const prefix = alias ? `${alias}.` : '';
      if (managedRestaurantIds && managedRestaurantIds.length > 0) {
        const validIds = managedRestaurantIds.filter(id => UUID_RE.test(id));
        const idList = (validIds.length > 0 ? validIds : [safeRestaurantId])
          .map(id => `'${id}'`).join(',');
        return `${prefix}restaurant_id IN (${idList})`;
      }
      return `${prefix}restaurant_id = '${safeRestaurantId}'`;
    };

    // Fix #2: For tables with restaurant_id, always add scope filter for security
    // Check if WHERE clause already has restaurant_id as an equality/IN filter (not just in JOINs)
    const tablesToScope = ['lingtin_visit_records', 'lingtin_action_items', 'lingtin_dish_mentions'];
    const whereClauseMatch = normalizedSql.match(/\bwhere\b([\s\S]*)/i);
    const whereClause = whereClauseMatch ? whereClauseMatch[1] : '';
    const hasRestaurantIdInWhere = whereClause.includes('restaurant_id');

    for (const tableName of tablesToScope) {
      if (normalizedSql.includes(tableName) && !hasRestaurantIdInWhere) {
        // Check if table has an alias (e.g., "lingtin_visit_records vr")
        const aliasMatch = sql.match(new RegExp(`${tableName}\\s+([a-z]{1,3})(?:\\s|$|,)`, 'i'));
        const alias = aliasMatch?.[1];
        const scopeFilter = buildScopeFilter(alias);

        if (normalizedSql.includes('where')) {
          modifiedSql = modifiedSql.replace(/\bwhere\b/i, `WHERE ${scopeFilter} AND`);
        } else {
          const tableRegex = new RegExp(`(from\\s+${tableName}(?:\\s+[a-z]{1,3})?)`, 'i');
          modifiedSql = modifiedSql.replace(tableRegex, `$1 WHERE ${scopeFilter}`);
        }
        break; // Only add scope once (for the main FROM table)
      }
    }

    this.logger.log(`[executeQuery] SQL: ${modifiedSql.slice(0, 100)}...`);

    // Execute the query using Supabase's raw SQL capability
    const { data, error } = await client.rpc('execute_readonly_query', {
      query_text: modifiedSql,
    });

    if (error) {
      // If RPC doesn't exist, try direct query on the table
      this.logger.warn(`RPC failed: ${error.message}, trying direct query`);

      // Parse the SQL to extract table and conditions for Supabase query builder
      const result = await this.executeDirectQuery(modifiedSql, client);
      return result;
    }

    return data || [];
  }

  /**
   * Execute query directly using Supabase query builder (fallback)
   */
  private async executeDirectQuery(sql: string, client: any): Promise<any[]> {
    const normalizedSql = sql.toLowerCase();

    // Try to extract table name and handle common query patterns
    if (normalizedSql.includes('lingtin_dish_mentions')) {
      // Query dish mentions
      let query = client.from('lingtin_dish_mentions').select('*');

      if (normalizedSql.includes("sentiment = 'negative'") || normalizedSql.includes('sentiment = \'negative\'')) {
        query = query.eq('sentiment', 'negative');
      } else if (normalizedSql.includes("sentiment = 'positive'") || normalizedSql.includes('sentiment = \'positive\'')) {
        query = query.eq('sentiment', 'positive');
      }

      // Add limit
      const limitMatch = normalizedSql.match(/limit\s+(\d+)/i);
      if (limitMatch) {
        query = query.limit(parseInt(limitMatch[1]));
      } else {
        query = query.limit(20);
      }

      // Add ordering
      if (normalizedSql.includes('order by')) {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    if (normalizedSql.includes('lingtin_visit_records')) {
      let query = client.from('lingtin_visit_records').select('*');

      // Add sentiment filter if present
      if (normalizedSql.includes('sentiment_score <')) {
        query = query.lt('sentiment_score', 0.4);
      } else if (normalizedSql.includes('sentiment_score >')) {
        query = query.gt('sentiment_score', 0.6);
      }

      // Add visit_type filter
      if (normalizedSql.includes("visit_type = 'complaint'")) {
        query = query.eq('visit_type', 'complaint');
      }

      // Add limit
      const limitMatch = normalizedSql.match(/limit\s+(\d+)/i);
      if (limitMatch) {
        query = query.limit(parseInt(limitMatch[1]));
      } else {
        query = query.limit(20);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }

    throw new Error('Unsupported query pattern');
  }

  /**
   * Save chat history to database for staff-questions feature
   */
  private async saveChatHistory(
    userMessage: string,
    assistantResponse: string,
    restaurantId: string,
    sessionId: string | undefined,
    employeeId: string | undefined,
    employeeName: string | undefined,
  ): Promise<void> {
    const client = this.supabase.getClient();

    // Generate session ID if not provided
    const chatSessionId = sessionId || randomUUID();

    // Insert user message
    await client.from('chat_history').insert({
      session_id: chatSessionId,
      user_id: employeeId || null,
      role: 'user',
      content: userMessage,
      restaurant_id: restaurantId,
      employee_name: employeeName || null,
    });

    // Insert assistant response
    await client.from('chat_history').insert({
      session_id: chatSessionId,
      user_id: employeeId || null,
      role: 'assistant',
      content: assistantResponse,
      restaurant_id: restaurantId,
      employee_name: employeeName || null,
    });

    this.logger.log(`Saved chat history for session ${chatSessionId}`);
  }

  async getSessions(restaurantId: string) {
    return { sessions: [] };
  }
}
