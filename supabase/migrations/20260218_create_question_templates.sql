-- Create question templates table for store visit questionnaire prompts
-- v1.0 - Initial table + seed data

CREATE TABLE lingtin_question_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for active template lookup (most common query)
CREATE INDEX idx_question_templates_active
  ON lingtin_question_templates (restaurant_id, is_active)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE lingtin_question_templates ENABLE ROW LEVEL SECURITY;

-- RLS policy: service role can do everything
CREATE POLICY "Service role full access"
  ON lingtin_question_templates
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed data: default template with 5 standard questions
-- Uses a placeholder restaurant_id that should be updated per restaurant
INSERT INTO lingtin_question_templates (restaurant_id, template_name, questions, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '标准桌访问卷',
  '[
    {"id": "q1", "text": "您是怎么知道我们店的？", "category": "来源"},
    {"id": "q2", "text": "这是第几次来用餐？", "category": "频次"},
    {"id": "q3", "text": "今天点的菜口味还满意吗？", "category": "菜品"},
    {"id": "q4", "text": "上菜速度和服务还可以吗？", "category": "服务"},
    {"id": "q5", "text": "有什么建议可以让我们做得更好？", "category": "建议"}
  ]'::jsonb,
  true
);
