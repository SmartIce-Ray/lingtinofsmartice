// Shared types and constants for action items
// Used by dashboard ActionItemsCard and chef dashboard

export interface EvidenceItem {
  visitId: string;
  tableId: string;
  feedback: string;
  sentiment: string;
}

export interface ActionItem {
  id: string;
  action_date?: string;
  category: string;
  suggestion_text: string;
  priority: 'high' | 'medium' | 'low';
  evidence: EvidenceItem[];
  status: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  assignee?: string;
  due_date?: string;
  acknowledged_at?: string;
  resolved_at?: string;
  resolved_note?: string;
  response_note?: string;
}

export interface ActionItemsResponse {
  actions: ActionItem[];
  message?: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  dish_quality: '菜品质量',
  service_speed: '服务速度',
  environment: '环境',
  staff_attitude: '员工态度',
  other: '其他',
};

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high: { label: '高', color: 'text-red-700', bg: 'bg-red-100' },
  medium: { label: '中', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  low: { label: '低', color: 'text-blue-700', bg: 'bg-blue-100' },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-orange-600' },
  acknowledged: { label: '已知悉', color: 'text-blue-600' },
  resolved: { label: '已解决', color: 'text-green-600' },
};
