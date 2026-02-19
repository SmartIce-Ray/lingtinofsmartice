// Chat Service - AI assistant with tool use for database queries
// v3.6 - Fixed: AI must call tool directly without saying "please wait", added PostgreSQL date syntax
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

## 当前上下文
- 餐厅ID: {{RESTAURANT_ID}}
- 当前日期: {{CURRENT_DATE}}`;

// Tool definitions for function calling
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: '查询餐厅桌访数据库。只支持 SELECT 查询。可查询 lingtin_visit_records（桌访记录）和 lingtin_dish_mentions（菜品提及）表。',
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
  ) {
this.logger.log(`Chat request: ${message.slice(0, 50)}...`);
this.logger.log(`Role: ${roleCode}, User: ${userName}`);

    const currentDate = getChinaDateString();

    // Select system prompt based on role
    const isBoss = roleCode === 'administrator';
    const basePrompt = isBoss ? BOSS_SYSTEM_PROMPT : MANAGER_SYSTEM_PROMPT;
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

      while (iteration < maxIterations) {
        iteration++;
        this.logger.log(`[Iteration ${iteration}] Calling Claude API...`);

        // Send thinking status to client before API call
        const thinkingMessage = iteration === 1 ? '正在思考...' : '正在整理答案...';
        res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingMessage })}\n\n`);

        const response = await this.callClaudeAPI(systemPrompt, messages);

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

            const result = await this.executeToolCall(toolCall, restaurantId);

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
        const content = assistantMessage.content || '';
        this.logger.log(`[Iteration ${iteration}] Final response length: ${content.length}`);

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
  private async callClaudeAPI(systemPrompt: string, messages: ChatMessage[]) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const requestBody = {
      model: 'google/gemini-2.5-flash',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    };

    this.logger.log(`Calling OpenRouter with ${messages.length} messages`);

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

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
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { name, arguments: argsJson } = toolCall.function;

this.logger.log(`Executing tool: ${name}`);

    try {
      const args = JSON.parse(argsJson);

      if (name === 'query_database') {
        const { sql, purpose } = args;
        this.logger.log(`[query_database] ${purpose}`);

        const result = await this.executeQuery(sql, restaurantId);
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
  private async executeQuery(sql: string, restaurantId: string): Promise<any[]> {
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
    const allowedTables = ['lingtin_visit_records', 'lingtin_dish_mentions', 'lingtin_table_sessions'];
    const tablePattern = /from\s+([a-z_]+)/gi;
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

    // For lingtin_visit_records, add restaurant_id filter for security
    let modifiedSql = sql;
    if (normalizedSql.includes('lingtin_visit_records')) {
      // Add restaurant_id filter if not already present
      if (!normalizedSql.includes('restaurant_id')) {
        if (normalizedSql.includes('where')) {
          modifiedSql = sql.replace(/where/i, `WHERE restaurant_id = '${restaurantId}' AND`);
        } else if (normalizedSql.includes('from lingtin_visit_records')) {
          modifiedSql = sql.replace(
            /from\s+lingtin_visit_records/i,
            `FROM lingtin_visit_records WHERE restaurant_id = '${restaurantId}'`
          );
        }
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
