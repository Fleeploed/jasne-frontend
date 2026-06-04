export type UserLanguage = "cs" | "en" | "uk" | "ru";
export type UserPlan = "free" | "pro";
export type AccountDeletionStatus = "active" | "pending";
export type DeadlineStatus = "active" | "completed" | "missed";
export type DeadlineType = "payment" | "action" | "response" | "expiration";
export type MessageRole = "user" | "assistant";
export type MessageType = "text" | "image" | "result_card";
export type TrackingType = "oamp_status" | "tax_status" | "zp_refund" | "court_hearing" | string;

export type AnalysisDeadline = {
  date: string;
  description: string;
  type: DeadlineType;
};

export type AnalysisResult = {
  document_type: string;
  document_type_cz: string;
  document_type_localized?: string | null;
  sender?: string | null;
  summary: string;
  translation?: string | null;
  deadlines: AnalysisDeadline[];
  actions_required: string[];
  penalty?: string | null;
  where_to_go?: string | null;
  documents_needed: string[];
  confidence: number;
  tips?: string | null;
};

export type ScanListItem = {
  id: string;
  category?: string | null;
  doc_type?: string | null;
  document_type_cz?: string | null;
  sender?: string | null;
  summary?: string | null;
  confidence?: number | null;
  page_count: number;
  created_at: string;
  last_message_at?: string | null;
  has_analysis_deadlines?: boolean;
  next_analysis_deadline_at?: string | null;
};

export type ScanResponse = {
  id: string;
  user_id: string;
  image_paths: string[];
  page_count: number;
  ocr_text?: string | null;
  category?: string | null;
  doc_type?: string | null;
  category_confidence?: number | null;
  result?: AnalysisResult | null;
  language: UserLanguage;
  model_used?: string | null;
  created_at: string;
};

export type ScanMessage = {
  id: string;
  scan_id: string;
  role: MessageRole;
  content: string;
  message_type: MessageType;
  created_at: string;
};

export type DeadlineResponse = {
  id: string;
  user_id: string;
  scan_id?: string | null;
  title: string;
  description?: string | null;
  due_date: string;
  reminder_days: number[];
  deadline_type: DeadlineType;
  status: DeadlineStatus;
  auto_created: boolean;
  created_at: string;
};

export type Tracking = {
  id: string;
  user_id: string;
  tracking_type: TrackingType;
  identifier: string;
  current_status: string | null;
  metadata: Record<string, unknown>;
  last_checked_at: string | null;
  next_check_at: string;
  is_active: boolean;
  notification_count: number;
  created_at: string;
  updated_at: string;
};

export type LimitsResponse = {
  plan: UserPlan;
  month: string;
  scans_used: number;
  scans_max: number;
  scans_remaining: number;
  max_pages_per_scan: number;
  questions_used_for_scan?: number | null;
  max_questions_per_scan: number;
};

export type ProfileResponse = {
  id: string;
  display_name?: string | null;
  language: UserLanguage;
  has_datova_schranka: boolean;
  plan: UserPlan;
  subscription_product_id?: string | null;
  subscription_expires_at?: string | null;
  subscription_will_renew: boolean;
  deletion_status: AccountDeletionStatus;
  deletion_requested_at?: string | null;
  deletion_scheduled_at?: string | null;
  deletion_reason?: string | null;
  deletion_restored_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiError = Error & {
  status?: number;
  detail?: string;
  code?: string;
};
