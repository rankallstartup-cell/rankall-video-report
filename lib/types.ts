// ── Shared types used across scan routes, report page, and dashboard ──

export type IntentType =
  | 'local_pro'
  | 'personal_pro'
  | 'product_pro'
  | 'global_brand'
  | 'government'
  | 'unknown';

export type CountryCode =
  | 'US' | 'GB' | 'AU' | 'CA' | 'IE' | 'NZ' | 'SG' | 'AE'
  | 'ZA' | 'NG' | 'KE' | 'GH' | 'IN' | 'PH';

export interface PlatformResult {
  platform: string;
  weight: number;
  status: 'success' | 'error' | 'timeout';
  response: string | null;
  error: string | null;
  mentioned: boolean;
  recommended: boolean;
}

export interface TrustSignal {
  key: string;
  label: string;
  exists: boolean;
  url?: string;
  score_impact: number;
  fix_available: boolean;
  fix_priority: 'high' | 'medium' | 'low';
}

export interface FixPrediction {
  fix_type: string;
  title: string;
  description: string;
  predicted_impact: number;
  confidence: number;
  effort: 'low' | 'medium' | 'high';
  generated_content?: string;
}

export interface ScanContext {
  // Core identity
  scan_id: string | null;
  input: string;
  intent_type: IntentType;
  industry: string | null;
  location: string | null;
  country_code: CountryCode | null;

  // Scores
  overall_score: number;
  trust_score: number | null;
  seo_score: number | null;

  // Mention data
  mentioned_count: number;
  total_platforms: number;
  recommendation_share: number;

  // Competitor
  competitor_name: string | null;
  competitor_score: number | null;

  // Business metadata
  business_name: string | null;
  user_id: string | null;

  // Results
  platform_results: PlatformResult[];
  trust_signals: TrustSignal[];
  fix_predictions: FixPrediction[];

  // Timestamps
  created_at: string;
  rescanned_at: string | null;
}

export interface PersonalScanContext {
  scan_id: string | null;
  name: string;
  specialty: string;
  location: string | null;
  country_code: CountryCode | null;
  overall_score: number;
  name_recognition_rate: number;
  recommendation_rate: number;
  authority_citation_rate: number;
  positive_sentiment_rate: number;
  competitor_name: string | null;
  competitor_mention_rate: number;
  trust_signals: TrustSignal[];
  fix_predictions?: FixPrediction[];
  created_at?: string;
}

export interface AgencyClient {
  id: string;
  agency_user_id: string;
  client_name: string | null;
  client_email: string | null;
  business_name: string | null;
  location: string | null;
  country_code: CountryCode | null;
  query: string | null;
  latest_scan_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined from scan:
  latest_score?: number | null;
  latest_competitor?: string | null;
}

export interface OutreachLead {
  id: string;
  scan_id: string | null;
  business_name: string | null;
  email: string | null;
  score: number | null;
  country_code: CountryCode | null;
  status: 'new' | 'contacted' | 'engaged' | 'converted' | 'unsubscribed';
  tracking_token: string | null;
  last_engaged_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
