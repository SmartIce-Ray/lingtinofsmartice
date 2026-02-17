// Dashboard Service - Analytics business logic
// v2.1 - Added: getRestaurantDetail() for restaurant detail page
// v2.0 - Added: getRestaurantsOverview() for admin dashboard with sentiment scores
// v1.9 - Added: Multi-restaurant support for administrator role
//        - getRestaurantList() returns all active restaurants
//        - getCoverageStats() supports restaurant_id=all for multi-store summary
//        - getSentimentSummary() supports restaurant_id=all for aggregated data

import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { toChinaDateString } from '../../common/utils/date';

// Interface for feedback with conversation context (used in sentiment summary)
export interface FeedbackWithContext {
  text: string;
  visitId: string;
  tableId: string;
  managerQuestions: string[];
  customerAnswers: string[];
  transcript: string;
}

@Injectable()
export class DashboardService {
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

  // Get top mentioned dishes with sentiment
  async getDishRanking(restaurantId: string, date: string, limit: number) {
    if (this.supabase.isMockMode()) {
      return {
        dishes: [
          { dish_name: '清蒸鲈鱼', mention_count: 8, positive: 6, negative: 1, neutral: 1 },
          { dish_name: '红烧肉', mention_count: 6, positive: 4, negative: 2, neutral: 0 },
          { dish_name: '宫保鸡丁', mention_count: 5, positive: 5, negative: 0, neutral: 0 },
          { dish_name: '麻婆豆腐', mention_count: 4, positive: 2, negative: 1, neutral: 1 },
          { dish_name: '糖醋排骨', mention_count: 3, positive: 1, negative: 2, neutral: 0 },
        ].slice(0, limit),
      };
    }
    const client = this.supabase.getClient();

    // Get all dish mentions for the date
    const { data, error } = await client
      .from('lingtin_dish_mentions')
      .select(
        `
        dish_name,
        sentiment,
        lingtin_visit_records!inner(restaurant_id, visit_date)
      `,
      )
      .eq('lingtin_visit_records.restaurant_id', restaurantId)
      .eq('lingtin_visit_records.visit_date', date);

    if (error) throw error;

    // Aggregate by dish
    const dishMap = new Map<
      string,
      { positive: number; negative: number; neutral: number }
    >();

    data?.forEach((mention) => {
      const existing = dishMap.get(mention.dish_name) || {
        positive: 0,
        negative: 0,
        neutral: 0,
      };
      existing[mention.sentiment as 'positive' | 'negative' | 'neutral']++;
      dishMap.set(mention.dish_name, existing);
    });

    // Sort by total mentions and take top N
    const dishes = Array.from(dishMap.entries())
      .map(([name, counts]) => ({
        dish_name: name,
        mention_count: counts.positive + counts.negative + counts.neutral,
        positive: counts.positive,
        negative: counts.negative,
        neutral: counts.neutral,
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
          { text: '味道很好', count: 4, contexts: [] },
          { text: '服务热情', count: 3, contexts: [] },
          { text: '环境不错', count: 2, contexts: [] },
        ],
        negative_feedbacks: [
          { text: '上菜慢', count: 2, contexts: [] },
          { text: '偏咸', count: 1, contexts: [] },
        ],
      };
    }
    const client = this.supabase.getClient();

    // Build query - either for single restaurant or all restaurants
    let query = client
      .from('lingtin_visit_records')
      .select('id, table_id, feedbacks, manager_questions, customer_answers, corrected_transcript')
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
}
