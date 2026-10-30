CREATE TABLE IF NOT EXISTS referral_conversions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id uuid,
  referred_user_id uuid,
  referred_email text,
  plan text,
  monthly_amount numeric,
  commission numeric,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);
