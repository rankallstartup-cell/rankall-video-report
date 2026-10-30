-- E: Cancel flow feedback table
CREATE TABLE IF NOT EXISTS cancel_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cancel_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cancel_feedback_owner" ON cancel_feedback;
CREATE POLICY "cancel_feedback_owner" ON cancel_feedback
  USING (user_id = auth.uid());
