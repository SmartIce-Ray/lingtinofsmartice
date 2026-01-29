// Staff Service - Business logic for employee data queries
// v1.0 - Initial version with chat history and visit records

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Get chat history for all employees in a restaurant
  async getChatHistory(restaurantId: string) {
    this.logger.log(`Getting chat history for restaurant: ${restaurantId}`);

    const client = this.supabase.getClient();

    const { data, error } = await client
      .from('chat_history')
      .select('id, employee_name, content, role, created_at, session_id')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      this.logger.error(`Error fetching chat history: ${error.message}`);
      return { items: [] };
    }

    this.logger.log(`Found ${data?.length || 0} chat history items`);
    return { items: data || [] };
  }

  // Get visit records with manager questions and customer answers
  async getVisitRecords(restaurantId: string) {
    this.logger.log(`Getting visit records for restaurant: ${restaurantId}`);

    const client = this.supabase.getClient();

    // Join with master_employee to get employee name
    const { data, error } = await client
      .from('lingtin_visit_records')
      .select(`
        id,
        table_id,
        manager_questions,
        customer_answers,
        ai_summary,
        sentiment_score,
        created_at,
        employee_id
      `)
      .eq('restaurant_id', restaurantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      this.logger.error(`Error fetching visit records: ${error.message}`);
      return { items: [] };
    }

    // Get employee names for the records
    const employeeIds = [...new Set((data || []).map(r => r.employee_id).filter(Boolean))];

    let employeeMap: Record<string, string> = {};
    if (employeeIds.length > 0) {
      const { data: employees } = await client
        .from('master_employee')
        .select('id, employee_name')
        .in('id', employeeIds);

      if (employees) {
        employeeMap = employees.reduce((acc, emp) => {
          acc[emp.id] = emp.employee_name;
          return acc;
        }, {} as Record<string, string>);
      }
    }

    // Map employee names to records
    const items = (data || []).map(record => ({
      ...record,
      employee_name: record.employee_id ? employeeMap[record.employee_id] || '店长' : '店长',
    }));

    this.logger.log(`Found ${items.length} visit records`);
    return { items };
  }
}
