-- v1.1 AI Action Items table
-- Stores AI-generated improvement suggestions based on daily negative feedbacks

CREATE TABLE lingtin_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  action_date DATE NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'daily_aggregation',
  visit_ids UUID[] NOT NULL DEFAULT '{}',
  category VARCHAR(30) NOT NULL,
  suggestion_text TEXT NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  evidence JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT,
  dismissed_at TIMESTAMPTZ,
  dismiss_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_items_restaurant_date ON lingtin_action_items(restaurant_id, action_date DESC);
CREATE INDEX idx_action_items_status ON lingtin_action_items(status) WHERE status != 'dismissed';
ALTER TABLE lingtin_action_items ENABLE ROW LEVEL SECURITY;
