-- Meeting Records - 门店例会录音及AI纪要
-- Supports: pre_meal (餐前会), daily_review (每日复盘), weekly (周例会)

CREATE TABLE lingtin_meeting_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  employee_id UUID,
  meeting_type VARCHAR(20) NOT NULL,  -- pre_meal/daily_review/weekly
  audio_url TEXT,
  duration_seconds INTEGER,
  raw_transcript TEXT,
  corrected_transcript TEXT,
  ai_summary TEXT,                    -- 会议纪要（叙述体，150字以内）
  action_items JSONB NOT NULL DEFAULT '[]',   -- [{who, what, deadline}]
  key_decisions JSONB NOT NULL DEFAULT '[]',  -- [{decision, context}]
  participants JSONB NOT NULL DEFAULT '[]',   -- 预留
  meeting_date DATE,
  meeting_period VARCHAR(10),         -- morning/afternoon/evening
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_records_restaurant_date ON lingtin_meeting_records(restaurant_id, meeting_date DESC);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_meeting_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_meeting_records_updated_at
  BEFORE UPDATE ON lingtin_meeting_records
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_records_updated_at();

ALTER TABLE lingtin_meeting_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON lingtin_meeting_records FOR ALL USING (true);
