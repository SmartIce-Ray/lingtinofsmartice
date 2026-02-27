-- Add response_note column to lingtin_action_items
-- Used by kitchen staff to record how they handled a dish quality issue
ALTER TABLE lingtin_action_items ADD COLUMN IF NOT EXISTS response_note TEXT;
