// Chat Service - AI assistant with tool use for database queries
// v2.5 - Added conversation history support for multi-turn context
// IMPORTANT: Never return raw_transcript to avoid context explosion

import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { SupabaseService } from '../../common/supabase/supabase.service';

// PackyAPI Configuration (same as Gemini integration in audio processing)
const PACKY_API_URL = 'https://www.packyapi.com/v1/chat/completions';

// System prompt for the AI assistant
const SYSTEM_PROMPT = `你是灵听，一个专业的餐饮数据分析助手。你可以帮助餐厅老板分析桌访录音数据。

## 你的能力
你可以使用 query_database 工具查询以下数据表：

1. **lingtin_visit_records** - 桌访录音记录
   - id, restaurant_id, table_id
   - corrected_transcript (纠偏后的文本)
   - ai_summary (AI生成的20字摘要)
   - sentiment_score (0-1, 越高越正面)
   - visit_type: routine/complaint/praise
   - dishes (JSONB): 菜品数组 [{name, sentiment, keywords}]
   - service (JSONB): 服务关键词数组 ["态度好", "上菜慢"]
   - other (JSONB): 其他关键词数组 ["老顾客", "推荐朋友"]
   - status, created_at, processed_at

2. **lingtin_dish_mentions** - 菜品提及记录（向后兼容）
   - id, visit_id, dish_name
   - sentiment: positive/negative/neutral
   - feedback_text, created_at

## 查询规范
1. **永远不要查询 raw_transcript 字段** - 它太大会导致上下文爆炸
2. 使用 ai_summary 和 corrected_transcript 替代
3. 优先使用 dishes, service, other JSONB 字段进行分析
4. 限制返回行数，使用 LIMIT 10-20
5. 只选择需要的列，不要 SELECT *

## 回答规范
1. 收到问题后，先思考需要查询什么数据
2. 使用 query_database 工具执行 SQL 查询
3. 根据查询结果，用自然语言总结发现
4. 引用具体的桌号、菜品名、时间作为证据
5. 如有负面反馈，主动给出改进建议
6. 保持简洁，重点突出

## 诚实原则（非常重要）
1. **如果查询失败或返回错误**，必须告诉用户"查询遇到问题"，不要编造数据
2. **如果数据量异常少**（如问"每天多少桌访"但只查到几条记录），主动说明"数据可能不完整"
3. **永远不要编造数字**，所有统计数据必须来自查询结果
4. 如果不确定，说"根据现有数据..."而不是给出绝对结论

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
    this.logger.log(`Initializing with GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`);
  }

  async streamResponse(
    message: string,
    restaurantId: string,
    sessionId: string | undefined,
    history: Array<{ role: string; content: string }> | undefined,
    res: Response,
  ) {
    console.log('\n========== CHAT SERVICE DEBUG ==========');
    console.log('[CHAT] Message:', message);
    console.log('[CHAT] Restaurant ID:', restaurantId);
    console.log('[CHAT] History length:', history?.length || 0);
    this.logger.log(`streamResponse called`);
    this.logger.log(`message: ${message}`);
    this.logger.log(`restaurantId: ${restaurantId}`);

    const currentDate = new Date().toISOString().split('T')[0];
    const systemPrompt = SYSTEM_PROMPT
      .replace('{{RESTAURANT_ID}}', restaurantId)
      .replace('{{CURRENT_DATE}}', currentDate);

    // Build messages array with conversation history
    const messages: ChatMessage[] = [];

    // Add history messages (last 10 from frontend)
    if (history && history.length > 0) {
      for (const msg of history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          });
        }
      }
      this.logger.log(`Added ${messages.length} history messages`);
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

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
   * Call Gemini API via PackyAPI endpoint (same as audio processing)
   */
  private async callClaudeAPI(systemPrompt: string, messages: ChatMessage[]) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const requestBody = {
      model: 'gemini-3-flash-preview',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      tools: TOOLS,
      tool_choice: 'auto',
    };

    this.logger.log(`Calling PackyAPI with ${messages.length} messages`);

    const response = await fetch(PACKY_API_URL, {
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

    console.log('\n---------- TOOL CALL ----------');
    console.log('[TOOL] Name:', name);
    console.log('[TOOL] Arguments:', argsJson);
    this.logger.log(`Executing tool: ${name}`);
    this.logger.log(`Arguments: ${argsJson}`);

    try {
      const args = JSON.parse(argsJson);

      if (name === 'query_database') {
        const { sql, purpose } = args;
        console.log('[TOOL] Purpose:', purpose);
        console.log('[TOOL] SQL:', sql);
        this.logger.log(`[query_database] Purpose: ${purpose}`);
        this.logger.log(`[query_database] SQL: ${sql}`);

        const result = await this.executeQuery(sql, restaurantId);
        console.log('[TOOL] Result rows:', result?.length || 0);
        console.log('[TOOL] Result data:', JSON.stringify(result, null, 2));
        this.logger.log(`[query_database] Result rows: ${result?.length || 0}`);

        return { success: true, data: result };
      }

      return { success: false, error: `Unknown tool: ${name}` };
    } catch (error) {
      console.log('[TOOL] ERROR:', error.message);
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
    const dangerousKeywords = [
      'drop', 'delete', 'update', 'insert', 'alter', 'truncate',
      'grant', 'revoke', 'create', 'exec', 'execute', 'call',
      'into', 'set', 'merge', 'replace', 'upsert',
      'pg_', 'information_schema', 'pg_catalog',
      '--', '/*', '*/', ';', 'union all select',
    ];
    for (const keyword of dangerousKeywords) {
      if (normalizedSql.includes(keyword)) {
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

    console.log('[QUERY] Modified SQL:', modifiedSql);
    this.logger.log(`[executeQuery] Modified SQL: ${modifiedSql}`);

    // Execute the query using Supabase's raw SQL capability
    // Note: In production, use a more secure approach like parameterized queries
    console.log('[QUERY] Calling RPC execute_readonly_query...');
    const { data, error } = await client.rpc('execute_readonly_query', {
      query_text: modifiedSql,
    });

    if (error) {
      // If RPC doesn't exist, try direct query on the table
      console.log('[QUERY] RPC FAILED:', error.message);
      console.log('[QUERY] Falling back to direct query...');
      this.logger.warn(`RPC failed: ${error.message}, trying direct query`);

      // Parse the SQL to extract table and conditions for Supabase query builder
      // For now, let's try a simpler approach using raw fetch
      const result = await this.executeDirectQuery(modifiedSql, client);
      return result;
    }

    console.log('[QUERY] RPC SUCCESS! Data:', JSON.stringify(data, null, 2));
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

  async getSessions(restaurantId: string) {
    return { sessions: [] };
  }
}
