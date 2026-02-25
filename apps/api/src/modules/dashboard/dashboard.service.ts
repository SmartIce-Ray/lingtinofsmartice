// Dashboard Service - Analytics business logic
// v2.2 - Added: getBriefing() for admin daily briefing (cross-restaurant anomaly detection)
// v2.1 - Added: getRestaurantDetail() for restaurant detail page
// v2.0 - Added: getRestaurantsOverview() for admin dashboard with sentiment scores
// v1.9 - Added: Multi-restaurant support for administrator role
//        - getRestaurantList() returns all active restaurants
//        - getCoverageStats() supports restaurant_id=all for multi-store summary
//        - getSentimentSummary() supports restaurant_id=all for aggregated data

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { getChinaDateString, toChinaDateString } from '../../common/utils/date';

// Interface for feedback with conversation context (used in sentiment summary)
export interface FeedbackWithContext {
  text: string;
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  transcript: string;
  audioUrl: string | null;
}

// Interface for negative feedback conversation context (used in dish ranking)
export interface NegContext {
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  audioUrl: string | null;
}

// Severity for briefing problem cards
type BriefingSeverity = 'red' | 'yellow';
// Category icons for briefing
type BriefingCategory = 'dish_quality' | 'service_speed' | 'staff_attitude' | 'environment' | 'coverage' | 'sentiment' | 'no_visits' | 'action_overdue';

export interface BriefingProblem {
  severity: BriefingSeverity;
  category: BriefingCategory;
  restaurantId: string;
  restaurantName: string;
  title: string;
  evidence: { text: string; tableId: string; audioUrl: string | null; managerQuestions: string[]; customerAnswers: string[] }[];
  metric?: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Get all active restaurants (for administrator multi-store view)
  async getRestaurantList() {
    if (this.supabase.isMockMode()) {
      return { restaurants: [{ id: 'mock-rest-1', restaurant_name: '测试店铺' }] };
    }
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .eq('is_active', true)
      .order('restaurant_name');

    if (error) throw error;

    return { restaurants: data || [] };
  }

  // Get coverage statistics (visits vs table sessions)
  // Supports restaurant_id=all for multi-store summary
  async getCoverageStats(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        periods: [
          { period: 'lunch', open_count: 12, visit_count: 10, coverage: 83, status: 'warning' },
          { period: 'dinner', open_count: 15, visit_count: 14, coverage: 93, status: 'good' },
        ],
      };
    }

    const client = this.supabase.getClient();

    // Multi-restaurant mode: return per-restaurant breakdown with summary
    if (restaurantId === 'all') {
      return this.getMultiRestaurantCoverage(date);
    }

    // Single restaurant mode (original logic)
    // Get table sessions count by period
    const { data: sessions, error: sessionsError } = await client
      .from('lingtin_table_sessions')
      .select('period')
      .eq('restaurant_id', restaurantId)
      .eq('session_date', date);

    if (sessionsError) throw sessionsError;

    // Get visit records count by period
    const { data: visits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('visit_period')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (visitsError) throw visitsError;

    // Aggregate by period
    const periods = ['lunch', 'dinner'];
    const result = periods.map((period) => {
      const openCount = sessions?.filter((s) => s.period === period).length || 0;
      const visitCount =
        visits?.filter((v) => v.visit_period === period).length || 0;
      const coverage = openCount > 0 ? Math.round((visitCount / openCount) * 100) : 0;

      return {
        period,
        open_count: openCount,
        visit_count: visitCount,
        coverage,
        status: coverage >= 90 ? 'good' : coverage >= 70 ? 'warning' : 'critical',
      };
    });

    return { periods: result };
  }

  // Get coverage stats for all restaurants (admin multi-store view)
  private async getMultiRestaurantCoverage(date: string) {
    const client = this.supabase.getClient();

    // Get all active restaurants
    const { data: restaurants, error: restError } = await client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .eq('is_active', true)
      .order('restaurant_name');

    if (restError) throw restError;

    // Get all sessions for the date
    const { data: allSessions, error: sessionsError } = await client
      .from('lingtin_table_sessions')
      .select('restaurant_id, period')
      .eq('session_date', date);

    if (sessionsError) throw sessionsError;

    // Get all visits for the date
    const { data: allVisits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('restaurant_id, visit_period')
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (visitsError) throw visitsError;

    // Calculate per-restaurant stats
    const periods = ['lunch', 'dinner'];
    let totalOpen = 0;
    let totalVisit = 0;

    const restaurantStats = (restaurants || []).map((rest) => {
      const restSessions = allSessions?.filter((s) => s.restaurant_id === rest.id) || [];
      const restVisits = allVisits?.filter((v) => v.restaurant_id === rest.id) || [];

      const periodStats = periods.map((period) => {
        const openCount = restSessions.filter((s) => s.period === period).length;
        const visitCount = restVisits.filter((v) => v.visit_period === period).length;
        const coverage = openCount > 0 ? Math.round((visitCount / openCount) * 100) : 0;

        totalOpen += openCount;
        totalVisit += visitCount;

        return {
          period,
          open_count: openCount,
          visit_count: visitCount,
          coverage,
        };
      });

      // Calculate overall status for this restaurant
      const restTotalOpen = periodStats.reduce((sum, p) => sum + p.open_count, 0);
      const restTotalVisit = periodStats.reduce((sum, p) => sum + p.visit_count, 0);
      const overallCoverage = restTotalOpen > 0 ? Math.round((restTotalVisit / restTotalOpen) * 100) : 0;

      return {
        id: rest.id,
        name: rest.restaurant_name,
        periods: periodStats,
        overall_coverage: overallCoverage,
        status: overallCoverage >= 90 ? 'good' : overallCoverage >= 70 ? 'warning' : 'critical',
      };
    });

    return {
      summary: {
        total_open: totalOpen,
        total_visit: totalVisit,
        coverage: totalOpen > 0 ? Math.round((totalVisit / totalOpen) * 100) : 0,
      },
      restaurants: restaurantStats,
    };
  }

  // Get top feedback items with sentiment (from feedbacks JSONB, not dish_mentions table)
  // Note: lingtin_dish_mentions table is deprecated — AI pipeline only writes to feedbacks JSONB
  async getDishRanking(restaurantId: string, date: string, limit: number) {
    if (this.supabase.isMockMode()) {
      return {
        dishes: [
          { dish_name: '清蒸鲈鱼', mention_count: 8, positive: 6, negative: 1, neutral: 1, negative_feedbacks: [{ text: '偏咸', count: 1, contexts: [{ visitId: 'mock-1', tableId: 'B4', managerQuestions: ['这道鱼觉得怎么样？'], customerAnswers: ['味道偏咸了，鱼倒是新鲜的'], audioUrl: null }] }] },
          { dish_name: '红烧肉', mention_count: 6, positive: 4, negative: 2, neutral: 0, negative_feedbacks: [{ text: '太油腻', count: 1, contexts: [{ visitId: 'mock-2', tableId: 'A2', managerQuestions: ['红烧肉还合口味吗？'], customerAnswers: ['太油腻了，吃不了几块'], audioUrl: null }] }, { text: '肉太硬', count: 1, contexts: [{ visitId: 'mock-3', tableId: 'C1', managerQuestions: ['菜品口感怎么样？'], customerAnswers: ['红烧肉有点硬，没炖烂'], audioUrl: null }] }] },
          { dish_name: '宫保鸡丁', mention_count: 5, positive: 5, negative: 0, neutral: 0, negative_feedbacks: [] },
          { dish_name: '麻婆豆腐', mention_count: 4, positive: 2, negative: 1, neutral: 1, negative_feedbacks: [{ text: '不够辣', count: 1, contexts: [{ visitId: 'mock-4', tableId: 'B2', managerQuestions: ['麻婆豆腐辣度可以吗？'], customerAnswers: ['不够辣，我们四川人吃着没感觉'], audioUrl: null }] }] },
          { dish_name: '糖醋排骨', mention_count: 3, positive: 1, negative: 2, neutral: 0, negative_feedbacks: [{ text: '太甜', count: 2, contexts: [{ visitId: 'mock-5', tableId: 'A5', managerQuestions: ['排骨味道还行吗？'], customerAnswers: ['太甜了，糖放多了'], audioUrl: null }, { visitId: 'mock-6', tableId: 'B1', managerQuestions: ['今天点的菜还满意吗？'], customerAnswers: ['糖醋排骨甜得发腻'], audioUrl: null }] }] },
        ].slice(0, limit),
      };
    }
    const client = this.supabase.getClient();

    // Get visit records with feedbacks JSONB (the actual data source)
    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, feedbacks, manager_questions, customer_answers, audio_url')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (error) throw error;

    // Aggregate feedbacks by text (each feedback item = one "mention")
    const feedbackMap = new Map<
      string,
      {
        positive: number;
        negative: number;
        neutral: number;
        negContexts: NegContext[];
      }
    >();

    for (const record of (data || [])) {
      const feedbacks = record.feedbacks || [];
      for (const fb of feedbacks) {
        if (typeof fb !== 'object' || !fb.text) continue;
        // Skip suggestion-type feedbacks (not dish/service feedback)
        if (fb.sentiment === 'suggestion') continue;

        const text = fb.text;
        const existing = feedbackMap.get(text) || {
          positive: 0,
          negative: 0,
          neutral: 0,
          negContexts: [],
        };

        const sentiment = fb.sentiment as 'positive' | 'negative' | 'neutral';
        if (sentiment in existing) {
          existing[sentiment]++;
        }

        if (sentiment === 'negative' && existing.negContexts.length < 3) {
          existing.negContexts.push({
            visitId: record.id,
            tableId: record.table_id,
            managerQuestions: record.manager_questions || [],
            customerAnswers: record.customer_answers || [],
            audioUrl: record.audio_url || null,
          });
        }

        feedbackMap.set(text, existing);
      }
    }

    // Sort by total mentions and take top N
    const dishes = Array.from(feedbackMap.entries())
      .map(([text, counts]) => ({
        dish_name: text,
        mention_count: counts.positive + counts.negative + counts.neutral,
        positive: counts.positive,
        negative: counts.negative,
        neutral: counts.neutral,
        negative_feedbacks: counts.negContexts.length > 0
          ? [{ text, count: counts.negative, contexts: counts.negContexts }]
          : [],
      }))
      .sort((a, b) => b.mention_count - a.mention_count)
      .slice(0, limit);

    return { dishes };
  }

  // Get sentiment trend over days
  async getSentimentTrend(restaurantId: string, days: number) {
    const client = this.supabase.getClient();

    // Calculate date range in China timezone
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);

    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('visit_date, sentiment_score')
      .eq('restaurant_id', restaurantId)
      .gte('visit_date', toChinaDateString(startDate))
      .lte('visit_date', toChinaDateString(endDate))
      .not('sentiment_score', 'is', null);

    if (error) throw error;

    // Aggregate by date
    const dateMap = new Map<string, number[]>();

    data?.forEach((record) => {
      const scores = dateMap.get(record.visit_date) || [];
      scores.push(record.sentiment_score);
      dateMap.set(record.visit_date, scores);
    });

    // Calculate averages
    const trend = Array.from(dateMap.entries())
      .map(([date, scores]) => ({
        date,
        avg_sentiment: scores.reduce((a, b) => a + b, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { trend };
  }

  // Get sentiment distribution summary for a date with feedback phrases
  // v1.7 - Added: Include conversation context for each feedback (for popover display)
  // v1.9 - Added: Support restaurant_id=all for multi-store aggregation
  async getSentimentSummary(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        positive_count: 12, neutral_count: 5, negative_count: 3,
        positive_percent: 60, neutral_percent: 25, negative_percent: 15,
        total_feedbacks: 20,
        positive_feedbacks: [
          { text: '味道很好', count: 4, contexts: [
            { text: '味道很好', visitId: 'mock-v1', tableId: 'A3', managerQuestions: ['今天菜品口味满意吗？'], customerAnswers: ['味道很好，特别是那道清蒸鲈鱼'], transcript: '', audioUrl: null },
            { text: '味道很好', visitId: 'mock-v2', tableId: 'B1', managerQuestions: ['觉得怎么样？'], customerAnswers: ['味道很好，下次还来'], transcript: '', audioUrl: null },
          ] },
          { text: '服务热情', count: 3, contexts: [
            { text: '服务热情', visitId: 'mock-v3', tableId: 'C2', managerQuestions: ['服务还满意吗？'], customerAnswers: ['很满意，服务员很热情，一直帮我们加水'], transcript: '', audioUrl: null },
          ] },
          { text: '环境不错', count: 2, contexts: [
            { text: '环境不错', visitId: 'mock-v4', tableId: 'A5', managerQuestions: ['用餐环境还好吗？'], customerAnswers: ['挺好的，很干净，音乐也好听'], transcript: '', audioUrl: null },
          ] },
        ],
        negative_feedbacks: [
          { text: '上菜慢', count: 2, contexts: [
            { text: '上菜慢', visitId: 'mock-v5', tableId: 'B4', managerQuestions: ['等了多久了？', '对用餐体验满意吗？'], customerAnswers: ['快半小时了吧', '上菜太慢了，孩子都饿哭了'], transcript: '', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
            { text: '上菜慢', visitId: 'mock-v6', tableId: 'A6', managerQuestions: ['今天用餐还顺利吗？'], customerAnswers: ['等太久了，催了两次'], transcript: '', audioUrl: null },
          ] },
          { text: '偏咸', count: 1, contexts: [
            { text: '偏咸', visitId: 'mock-v7', tableId: 'C1', managerQuestions: ['口味怎么样？'], customerAnswers: ['有点咸，特别是那个红烧肉'], transcript: '', audioUrl: null },
          ] },
        ],
      };
    }
    const client = this.supabase.getClient();

    // Build query - either for single restaurant or all restaurants
    let query = client
      .from('lingtin_visit_records')
      .select('id, table_id, feedbacks, manager_questions, customer_answers, corrected_transcript, audio_url')
      .eq('visit_date', date)
      .eq('status', 'processed');

    // Only filter by restaurant_id if not 'all'
    if (restaurantId !== 'all') {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Count by individual feedback sentiment labels
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    // Collect feedback with conversation context
    const positiveFeedbacks: FeedbackWithContext[] = [];
    const negativeFeedbacks: FeedbackWithContext[] = [];

    data?.forEach((record) => {
      const feedbacks = record.feedbacks || [];
      feedbacks.forEach(
        (fb: { text: string; sentiment: string } | string) => {
          if (typeof fb === 'object' && fb.text) {
            const context: FeedbackWithContext = {
              text: fb.text,
              visitId: record.id,
              tableId: record.table_id,
              managerQuestions: record.manager_questions || [],
              customerAnswers: record.customer_answers || [],
              transcript: record.corrected_transcript || '',
              audioUrl: record.audio_url || null,
            };
            if (fb.sentiment === 'positive') {
              positive++;
              positiveFeedbacks.push(context);
            } else if (fb.sentiment === 'negative') {
              negative++;
              negativeFeedbacks.push(context);
            } else if (fb.sentiment === 'neutral') {
              neutral++;
            }
          }
        },
      );
    });

    // Group feedbacks by text and aggregate contexts
    const groupFeedbacks = (feedbacks: FeedbackWithContext[], limit: number) => {
      const groupMap = new Map<string, { count: number; contexts: FeedbackWithContext[] }>();
      feedbacks.forEach((fb) => {
        const existing = groupMap.get(fb.text) || { count: 0, contexts: [] };
        existing.count++;
        // Only keep first 3 contexts per feedback text
        if (existing.contexts.length < 3) {
          existing.contexts.push(fb);
        }
        groupMap.set(fb.text, existing);
      });
      return Array.from(groupMap.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, limit)
        .map(([text, data]) => ({
          text,
          count: data.count,
          contexts: data.contexts,
        }));
    };

    const total = positive + neutral + negative;

    return {
      positive_count: positive,
      neutral_count: neutral,
      negative_count: negative,
      positive_percent: total > 0 ? Math.round((positive / total) * 100) : 0,
      neutral_percent: total > 0 ? Math.round((neutral / total) * 100) : 0,
      negative_percent: total > 0 ? Math.round((negative / total) * 100) : 0,
      total_feedbacks: total,
      positive_feedbacks: groupFeedbacks(positiveFeedbacks, 6),
      negative_feedbacks: groupFeedbacks(negativeFeedbacks, 6),
    };
  }

  // Get all restaurants overview with sentiment scores and keywords (for admin dashboard)
  // Returns: restaurant list with visit count, avg sentiment, coverage, recent keywords
  async getRestaurantsOverview(date: string) {
    if (this.supabase.isMockMode()) {
      return {
        summary: { total_visits: 28, avg_sentiment: 0.72, restaurant_count: 3 },
        restaurants: [
          { id: 'mock-rest-1', name: '望京旗舰店', visit_count: 15, open_count: 20, coverage: 75, avg_sentiment: 0.68, keywords: ['清蒸鲈鱼', '服务热情', '偏咸', '红烧肉'] },
          { id: 'mock-rest-2', name: '三里屯店', visit_count: 8, open_count: 15, coverage: 53, avg_sentiment: 0.65, keywords: ['上菜慢', '环境不错', '宫保鸡丁'] },
          { id: 'mock-rest-3', name: '国贸店', visit_count: 5, open_count: 6, coverage: 83, avg_sentiment: 0.88, keywords: ['味道好', '分量足'] },
        ],
        recent_keywords: ['清蒸鲈鱼', '服务热情', '偏咸', '上菜慢', '环境不错', '味道好', '红烧肉', '宫保鸡丁', '分量足'],
      };
    }
    const client = this.supabase.getClient();

    // Get all active restaurants
    const { data: restaurants, error: restError } = await client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .eq('is_active', true)
      .order('restaurant_name');

    if (restError) throw restError;

    // Get all visits for the date with sentiment and keywords
    const { data: allVisits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('restaurant_id, visit_period, sentiment_score, keywords')
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (visitsError) throw visitsError;

    // Get all table sessions for coverage calculation
    const { data: allSessions, error: sessionsError } = await client
      .from('lingtin_table_sessions')
      .select('restaurant_id, period')
      .eq('session_date', date);

    if (sessionsError) throw sessionsError;

    // Calculate per-restaurant stats
    let totalVisits = 0;
    let totalSentimentSum = 0;
    let totalSentimentCount = 0;
    const allKeywords: string[] = [];

    const restaurantStats = (restaurants || []).map((rest) => {
      const restVisits = allVisits?.filter((v) => v.restaurant_id === rest.id) || [];
      const restSessions = allSessions?.filter((s) => s.restaurant_id === rest.id) || [];

      // Visit count
      const visitCount = restVisits.length;
      totalVisits += visitCount;

      // Average sentiment score
      const sentimentScores = restVisits
        .filter((v) => v.sentiment_score !== null)
        .map((v) => v.sentiment_score);
      const avgSentiment = sentimentScores.length > 0
        ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
        : null;

      if (avgSentiment !== null) {
        totalSentimentSum += avgSentiment * sentimentScores.length;
        totalSentimentCount += sentimentScores.length;
      }

      // Coverage
      const openCount = restSessions.length;
      const coverage = openCount > 0 ? Math.round((visitCount / openCount) * 100) : 0;

      // Recent keywords (flatten and dedupe)
      const keywords: string[] = [];
      restVisits.forEach((v) => {
        if (Array.isArray(v.keywords)) {
          v.keywords.forEach((kw: string) => {
            if (kw && !keywords.includes(kw)) {
              keywords.push(kw);
            }
            if (kw && !allKeywords.includes(kw)) {
              allKeywords.push(kw);
            }
          });
        }
      });

      return {
        id: rest.id,
        name: rest.restaurant_name,
        visit_count: visitCount,
        open_count: openCount,
        coverage,
        avg_sentiment: avgSentiment !== null ? Math.round(avgSentiment * 100) / 100 : null,
        keywords: keywords.slice(0, 5),
      };
    });

    // Sort by visit count descending
    restaurantStats.sort((a, b) => b.visit_count - a.visit_count);

    return {
      summary: {
        total_visits: totalVisits,
        avg_sentiment: totalSentimentCount > 0
          ? Math.round((totalSentimentSum / totalSentimentCount) * 100) / 100
          : null,
        restaurant_count: restaurants?.length || 0,
      },
      restaurants: restaurantStats,
      recent_keywords: allKeywords.slice(0, 10),
    };
  }

  // Get manager questions used today (simple list)
  async getSpeechHighlights(restaurantId: string, date: string) {
    if (this.supabase.isMockMode()) {
      return {
        questions: [
          { text: '今天的菜品口味还满意吗？', table: 'A3', time: '12:15' },
          { text: '请问是第几次来我们店？', table: 'B1', time: '12:30' },
          { text: '有什么需要改进的地方吗？', table: 'A5', time: '18:45' },
        ],
      };
    }
    const client = this.supabase.getClient();

    // Get all records with manager questions
    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('table_id, manager_questions, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed')
      .not('manager_questions', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Format as simple list of questions with table and time
    const questions: { text: string; table: string; time: string }[] = [];

    data?.forEach((record) => {
      const managerQuestions = record.manager_questions || [];
      if (managerQuestions.length > 0) {
        const time = new Date(record.created_at).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
        managerQuestions.forEach((question: string) => {
          if (question && question.trim()) {
            questions.push({
              text: question,
              table: record.table_id,
              time,
            });
          }
        });
      }
    });

    return { questions: questions.slice(0, 6) };
  }

  // Get restaurant detail with visit records for a specific date
  async getRestaurantDetail(restaurantId: string, date: string) {
    const client = this.supabase.getClient();

    // Get restaurant info
    const { data: restaurant, error: restError } = await client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .eq('id', restaurantId)
      .single();

    if (restError) throw restError;

    // Get all visit records for this restaurant on this date
    const { data: visits, error: visitsError } = await client
      .from('lingtin_visit_records')
      .select('id, table_id, visit_period, sentiment_score, ai_summary, keywords, manager_questions, customer_answers, corrected_transcript, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed')
      .order('created_at', { ascending: false });

    if (visitsError) throw visitsError;

    // Calculate summary
    const sentimentScores = (visits || [])
      .filter((v) => v.sentiment_score !== null)
      .map((v) => v.sentiment_score);
    const avgSentiment = sentimentScores.length > 0
      ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
      : null;

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.restaurant_name,
      },
      visits: visits || [],
      summary: {
        total_visits: visits?.length || 0,
        avg_sentiment: avgSentiment !== null ? Math.round(avgSentiment * 100) / 100 : null,
      },
    };
  }

  // Get daily briefing for admin: cross-restaurant anomaly detection + problem cards
  async getBriefing(date: string) {
    if (this.supabase.isMockMode()) {
      return {
        date,
        greeting: this.getGreeting(),
        problems: [
          {
            severity: 'red' as BriefingSeverity,
            category: 'dish_quality' as BriefingCategory,
            restaurantId: 'mock-rest-1',
            restaurantName: '望京旗舰店',
            title: '🍳 菜品差评（3桌）',
            evidence: [
              { text: '酸汤鱼感觉咽不下去，太酸了', tableId: 'B6', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', managerQuestions: ['今天这道酸汤鱼觉得怎么样？', '辣度可以吗？'], customerAnswers: ['太酸了，感觉咽不下去', '辣度还行，就是酸味太重'] },
              { text: '红烧肉太油腻，吃不了几块', tableId: 'A2', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', managerQuestions: ['红烧肉还合口味吗？'], customerAnswers: ['太油腻了，吃不了几块'] },
              { text: '糖醋排骨偏甜，糖放多了', tableId: 'C1', audioUrl: null, managerQuestions: ['排骨味道怎么样？'], customerAnswers: ['偏甜了，糖放多了吧'] },
            ],
          },
          {
            severity: 'yellow' as BriefingSeverity,
            category: 'service_speed' as BriefingCategory,
            restaurantId: 'mock-rest-2',
            restaurantName: '三里屯店',
            title: '⏱️ 上菜速度投诉（2桌）',
            evidence: [
              { text: '等了40分钟还没上齐', tableId: 'A5', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', managerQuestions: ['今天用餐体验怎么样？'], customerAnswers: ['等太久了，40分钟菜还没上齐'] },
              { text: '催了两次才上菜', tableId: 'B3', audioUrl: null, managerQuestions: ['菜品口味满意吗？', '上菜速度还可以吗？'], customerAnswers: ['口味不错', '不行，催了两次才上来'] },
            ],
          },
          {
            severity: 'yellow' as BriefingSeverity,
            category: 'coverage' as BriefingCategory,
            restaurantId: 'mock-rest-2',
            restaurantName: '三里屯店',
            title: '桌访覆盖率偏低',
            evidence: [],
            metric: '覆盖率 55%',
          },
        ],
        healthy_count: 1,
        restaurant_count: 3,
        avg_sentiment: 0.68,
        avg_coverage: 78,
      };
    }

    const client = this.supabase.getClient();

    // 1. Get all active restaurants
    const { data: restaurants, error: restError } = await client
      .from('master_restaurant')
      .select('id, restaurant_name')
      .eq('is_active', true);
    if (restError) throw restError;
    if (!restaurants || restaurants.length === 0) {
      return { date, greeting: this.getGreeting(), problems: [], healthy_count: 0, avg_sentiment: null, avg_coverage: 0 };
    }

    const restMap = new Map(restaurants.map(r => [r.id, r.restaurant_name]));

    // 2. Fetch visit records, action items, table sessions, and yesterday's data in parallel
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toChinaDateString(yesterday);

    const [visitsRes, actionsRes, sessionsRes, yesterdayVisitsRes] = await Promise.all([
      client.from('lingtin_visit_records')
        .select('id, restaurant_id, table_id, feedbacks, sentiment_score, audio_url, keywords, status, manager_questions, customer_answers')
        .eq('visit_date', date)
        .eq('status', 'processed'),
      client.from('lingtin_action_items')
        .select('id, restaurant_id, category, suggestion_text, priority, status, created_at')
        .in('status', ['pending', 'acknowledged'])
        .eq('priority', 'high'),
      client.from('lingtin_table_sessions')
        .select('restaurant_id, period')
        .eq('session_date', date),
      client.from('lingtin_visit_records')
        .select('restaurant_id, sentiment_score')
        .eq('visit_date', yesterdayStr)
        .eq('status', 'processed'),
    ]);

    const visits = visitsRes.data || [];
    const actions = actionsRes.data || [];
    const sessions = sessionsRes.data || [];
    const yesterdayVisits = yesterdayVisitsRes.data || [];

    // 3. Per-restaurant anomaly detection
    const problems: BriefingProblem[] = [];
    let totalSentimentSum = 0;
    let totalSentimentCount = 0;
    let totalOpen = 0;
    let totalVisit = 0;

    for (const rest of restaurants) {
      const restVisits = visits.filter(v => v.restaurant_id === rest.id);
      const restSessions = sessions.filter(s => s.restaurant_id === rest.id);
      const restYesterdayVisits = yesterdayVisits.filter(v => v.restaurant_id === rest.id);

      // Aggregate sentiment
      const scores = restVisits.filter(v => v.sentiment_score !== null).map(v => v.sentiment_score);
      const avgSentiment = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      if (avgSentiment !== null) {
        totalSentimentSum += avgSentiment * scores.length;
        totalSentimentCount += scores.length;
      }

      // Coverage
      const openCount = restSessions.length;
      const visitCount = restVisits.length;
      totalOpen += openCount;
      totalVisit += visitCount;
      const coverage = openCount > 0 ? Math.round((visitCount / openCount) * 100) : 0;

      // --- Anomaly: no visits ---
      if (restVisits.length === 0 && openCount > 0) {
        problems.push({
          severity: 'yellow',
          category: 'no_visits',
          restaurantId: rest.id,
          restaurantName: rest.restaurant_name,
          title: '当天无桌访记录',
          evidence: [],
          metric: `开台 ${openCount} 桌，0 条桌访`,
        });
        continue;
      }

      // --- Anomaly: low sentiment ---
      if (avgSentiment !== null && avgSentiment < 0.5) {
        problems.push({
          severity: 'red',
          category: 'sentiment',
          restaurantId: rest.id,
          restaurantName: rest.restaurant_name,
          title: '整体情绪偏低',
          evidence: [],
          metric: `日均情绪 ${(avgSentiment).toFixed(2)}`,
        });
      }

      // --- Anomaly: low coverage ---
      if (openCount > 0 && coverage < 70) {
        // Check if yesterday was higher
        const yesterdayCount = restYesterdayVisits.length;
        const diffText = yesterdayCount > visitCount
          ? `昨日 ${yesterdayCount} 条，今日 ${visitCount} 条`
          : `覆盖率 ${coverage}%`;
        problems.push({
          severity: 'yellow',
          category: 'coverage',
          restaurantId: rest.id,
          restaurantName: rest.restaurant_name,
          title: '桌访覆盖率偏低',
          evidence: [],
          metric: diffText,
        });
      }

      // --- Anomaly: negative feedbacks by category ---
      // Collect all negative feedbacks with category detection
      const categoryFeedbacks = new Map<BriefingCategory, { text: string; tableId: string; audioUrl: string | null; managerQuestions: string[]; customerAnswers: string[] }[]>();

      for (const visit of restVisits) {
        const feedbacks = visit.feedbacks || [];
        const keywords = visit.keywords || [];

        for (const fb of feedbacks) {
          if (typeof fb === 'object' && fb.sentiment === 'negative' && fb.text) {
            const cat = this.detectFeedbackCategory(fb.text, keywords);
            const existing = categoryFeedbacks.get(cat) || [];
            existing.push({
              text: fb.text,
              tableId: visit.table_id,
              audioUrl: visit.audio_url || null,
              managerQuestions: visit.manager_questions || [],
              customerAnswers: visit.customer_answers || [],
            });
            categoryFeedbacks.set(cat, existing);
          }
        }
      }

      // Generate problem cards for categories with ≥2 negative feedbacks
      for (const [cat, items] of categoryFeedbacks) {
        if (items.length >= 2) {
          const catLabels: Record<BriefingCategory, string> = {
            dish_quality: '菜品差评',
            service_speed: '上菜速度投诉',
            staff_attitude: '服务态度问题',
            environment: '环境问题',
            coverage: '', sentiment: '', no_visits: '', action_overdue: '',
          };
          const catIcons: Record<BriefingCategory, string> = {
            dish_quality: '🍳', service_speed: '⏱️', staff_attitude: '😐', environment: '🏠',
            coverage: '', sentiment: '', no_visits: '', action_overdue: '',
          };
          problems.push({
            severity: items.length >= 3 ? 'red' : 'yellow',
            category: cat,
            restaurantId: rest.id,
            restaurantName: rest.restaurant_name,
            title: `${catIcons[cat] || ''} ${catLabels[cat] || cat}（${items.length}桌）`,
            evidence: items.slice(0, 3),
          });
        }
      }

      // --- Anomaly: overdue high-priority actions ---
      const restOverdue = actions.filter(a => {
        if (a.restaurant_id !== rest.id) return false;
        const created = new Date(a.created_at);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff > 3;
      });
      if (restOverdue.length > 0) {
        problems.push({
          severity: 'yellow',
          category: 'action_overdue',
          restaurantId: rest.id,
          restaurantName: rest.restaurant_name,
          title: `${restOverdue.length} 条高优先级建议超 3 天未处理`,
          evidence: [],
        });
      }
    }

    // Sort problems: red first, then yellow; within same severity by evidence count desc
    problems.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'red' ? -1 : 1;
      return b.evidence.length - a.evidence.length;
    });

    const healthyCount = restaurants.length - new Set(problems.map(p => p.restaurantId)).size;
    const overallAvgSentiment = totalSentimentCount > 0
      ? Math.round((totalSentimentSum / totalSentimentCount) * 100) / 100
      : null;
    const overallCoverage = totalOpen > 0 ? Math.round((totalVisit / totalOpen) * 100) : 0;

    return {
      date,
      greeting: this.getGreeting(),
      problems,
      healthy_count: healthyCount,
      restaurant_count: restaurants.length,
      avg_sentiment: overallAvgSentiment,
      avg_coverage: overallCoverage,
    };
  }

  // Detect feedback category from text and keywords
  private detectFeedbackCategory(text: string, keywords: string[]): BriefingCategory {
    const lower = text.toLowerCase();
    const allText = [lower, ...keywords.map(k => k.toLowerCase())].join(' ');

    if (/慢|等了|催|久|速度|出菜/.test(allText)) return 'service_speed';
    if (/态度|不耐烦|冷淡|不理|脸色/.test(allText)) return 'staff_attitude';
    if (/环境|吵|脏|热|冷|味道大|苍蝇/.test(allText)) return 'environment';
    return 'dish_quality';
  }

  // Get greeting based on time of day
  private getGreeting(): string {
    const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', hour12: false });
    const h = parseInt(hour, 10);
    if (h < 12) return '早安';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  // Get customer suggestions aggregated from feedbacks with sentiment==='suggestion'
  // Supports restaurant_id=all (cross-restaurant) or single restaurant UUID
  async getSuggestions(restaurantId: string, days: number) {
    if (this.supabase.isMockMode()) {
      return {
        suggestions: [
          {
            text: '希望能加一些辣度选择，比如微辣、中辣、特辣',
            count: 4,
            restaurants: ['望京旗舰店', '三里屯店'],
            evidence: [
              { tableId: 'B2', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', restaurantName: '望京旗舰店', restaurantId: 'mock-rest-1', managerQuestions: ['对菜品有什么建议吗？'], customerAnswers: ['希望能选辣度，我们爱吃辣但有朋友不能吃'] },
              { tableId: 'A7', audioUrl: null, restaurantName: '三里屯店', restaurantId: 'mock-rest-2', managerQuestions: ['有什么改进建议？'], customerAnswers: ['加个辣度选项吧，微辣中辣特辣'] },
              { tableId: 'C3', audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', restaurantName: '望京旗舰店', restaurantId: 'mock-rest-1', managerQuestions: ['下次来还想吃什么？', '口味有要调整的吗？'], customerAnswers: ['还想试试水煮鱼', '能不能出个辣度选择？每次都太辣了'] },
            ],
          },
          {
            text: '建议增加儿童餐或小份菜',
            count: 3,
            restaurants: ['望京旗舰店'],
            evidence: [
              { tableId: 'A1', audioUrl: null, restaurantName: '望京旗舰店', restaurantId: 'mock-rest-1', managerQuestions: ['带孩子来用餐方便吗？'], customerAnswers: ['菜量太大了，小朋友吃不完，有儿童餐就好了'] },
              { tableId: 'B5', audioUrl: null, restaurantName: '望京旗舰店', restaurantId: 'mock-rest-1', managerQuestions: ['还有什么需要的吗？'], customerAnswers: ['能不能出小份的，两个人吃不了那么多'] },
            ],
          },
          {
            text: '停车不太方便，能不能和隔壁商场合作停车券',
            count: 2,
            restaurants: ['三里屯店'],
            evidence: [
              { tableId: 'A3', audioUrl: null, restaurantName: '三里屯店', restaurantId: 'mock-rest-2', managerQuestions: ['来店里方便吗？'], customerAnswers: ['开车来的，停车太难了，绕了三圈'] },
            ],
          },
        ],
      };
    }

    const client = this.supabase.getClient();

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);

    let query = client
      .from('lingtin_visit_records')
      .select('id, restaurant_id, table_id, feedbacks, audio_url, manager_questions, customer_answers')
      .gte('visit_date', toChinaDateString(startDate))
      .lte('visit_date', toChinaDateString(endDate))
      .eq('status', 'processed');

    if (restaurantId !== 'all') {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Build restaurant name lookup if cross-restaurant
    let restMap = new Map<string, string>();
    if (restaurantId === 'all') {
      const { data: restaurants } = await client
        .from('master_restaurant')
        .select('id, restaurant_name')
        .eq('is_active', true);
      restMap = new Map((restaurants || []).map(r => [r.id, r.restaurant_name]));
    }

    // Collect all suggestion feedbacks
    const suggestionMap = new Map<string, {
      count: number;
      restaurants: Set<string>;
      evidence: { tableId: string; audioUrl: string | null; restaurantName: string; restaurantId: string; managerQuestions: string[]; customerAnswers: string[] }[];
    }>();

    for (const record of (data || [])) {
      const feedbacks = record.feedbacks || [];
      for (const fb of feedbacks) {
        if (typeof fb === 'object' && fb.sentiment === 'suggestion' && fb.text) {
          const existing = suggestionMap.get(fb.text) || {
            count: 0,
            restaurants: new Set<string>(),
            evidence: [],
          };
          existing.count++;
          const restName = restMap.get(record.restaurant_id) || '';
          existing.restaurants.add(restName || record.restaurant_id);
          if (existing.evidence.length < 3) {
            existing.evidence.push({
              tableId: record.table_id,
              audioUrl: record.audio_url || null,
              restaurantName: restName,
              restaurantId: record.restaurant_id,
              managerQuestions: record.manager_questions || [],
              customerAnswers: record.customer_answers || [],
            });
          }
          suggestionMap.set(fb.text, existing);
        }
      }
    }

    // Sort by count descending
    const suggestions = Array.from(suggestionMap.entries())
      .map(([text, data]) => ({
        text,
        count: data.count,
        restaurants: Array.from(data.restaurants),
        evidence: data.evidence,
      }))
      .sort((a, b) => b.count - a.count);

    return { suggestions };
  }

  // Get cumulative motivation stats for a restaurant (all-time totals)
  async getMotivationStats(restaurantId: string) {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const DEFAULT_RESTAURANT_ID = '0b9e9031-4223-4124-b633-e3a853abfb8f';
    const safeId = UUID_REGEX.test(restaurantId) ? restaurantId : DEFAULT_RESTAURANT_ID;

    if (this.supabase.isMockMode()) {
      return { total_visits: 156, positive_count: 139, resolved_issues: 23 };
    }

    const client = this.supabase.getClient();

    // Run three counts in parallel
    const [visitsResult, positiveResult, resolvedResult] = await Promise.all([
      client
        .from('lingtin_visit_records')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', safeId)
        .eq('status', 'processed'),
      client
        .from('lingtin_visit_records')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', safeId)
        .eq('status', 'processed')
        .gte('sentiment_score', 0.8),
      client
        .from('lingtin_action_items')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', safeId)
        .eq('status', 'resolved'),
    ]);

    return {
      total_visits: visitsResult.count ?? 0,
      positive_count: positiveResult.count ?? 0,
      resolved_issues: resolvedResult.count ?? 0,
    };
  }
}
