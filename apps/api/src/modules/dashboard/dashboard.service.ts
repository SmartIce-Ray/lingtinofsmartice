// Dashboard Service - Analytics business logic
// v1.7 - Fixed: Use China timezone for date calculations

import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { toChinaDateString } from '../../common/utils/date';

@Injectable()
export class DashboardService {
  constructor(private readonly supabase: SupabaseService) {}

  // Get coverage statistics (visits vs table sessions)
  async getCoverageStats(restaurantId: string, date: string) {
    const client = this.supabase.getClient();

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

  // Get top mentioned dishes with sentiment
  async getDishRanking(restaurantId: string, date: string, limit: number) {
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
  // v1.6 - Count by individual feedback items, not by overall visit score
  async getSentimentSummary(restaurantId: string, date: string) {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('lingtin_visit_records')
      .select('feedbacks')
      .eq('restaurant_id', restaurantId)
      .eq('visit_date', date)
      .eq('status', 'processed');

    if (error) throw error;

    // Count by individual feedback sentiment labels
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    // Collect feedback phrases by sentiment
    const positiveFeedbacks: string[] = [];
    const negativeFeedbacks: string[] = [];

    data?.forEach((record) => {
      const feedbacks = record.feedbacks || [];
      feedbacks.forEach(
        (fb: { text: string; sentiment: string } | string) => {
          if (typeof fb === 'object' && fb.text) {
            if (fb.sentiment === 'positive') {
              positive++;
              positiveFeedbacks.push(fb.text);
            } else if (fb.sentiment === 'negative') {
              negative++;
              negativeFeedbacks.push(fb.text);
            } else if (fb.sentiment === 'neutral') {
              neutral++;
            }
          }
        },
      );
    });

    // Count feedback frequency and get top feedbacks
    const countFeedbacks = (feedbacks: string[], limit: number) => {
      const countMap = new Map<string, number>();
      feedbacks.forEach((fb) => {
        countMap.set(fb, (countMap.get(fb) || 0) + 1);
      });
      return Array.from(countMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([text, count]) => ({ text, count }));
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
      positive_feedbacks: countFeedbacks(positiveFeedbacks, 6),
      negative_feedbacks: countFeedbacks(negativeFeedbacks, 6),
    };
  }

  // Get manager questions used today (simple list)
  async getSpeechHighlights(restaurantId: string, date: string) {
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
}
