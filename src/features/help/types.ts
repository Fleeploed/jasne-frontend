export type HelpLanguage = "cs" | "en" | "ru" | "uk";
export type SectionType = "text" | "steps" | "checklist" | "warning" | "cta";

export type CtaAction =
  | "scan_document"
  | "add_deadline"
  | "open_deadlines"
  | "scan_oamp_letter"
  | "add_deadline_manual"
  | "scan_tax_letter"
  | "scan_bill"
  | "scan_contract"
  | "check_status_visa"
  | "open_help_center";

// `locked` is set by the backend when a pro_only section is served to a free
// user: body/items arrive as a short teaser (first line/chars) and the client
// renders it blurred behind the upgrade gate. The full Pro payload stays
// server-side. Gating lives in HelpContentRenderer (components.tsx); the
// blurred teaser shell is ProBlurSection.tsx.
export type Section =
  | { type: "text"; title?: string | null; body: string; pro_only?: boolean; locked?: boolean }
  | { type: "steps"; title?: string | null; items: string[]; pro_only?: boolean; locked?: boolean }
  | { type: "checklist"; title?: string | null; items: string[]; pro_only?: boolean; locked?: boolean }
  | { type: "warning"; title?: string | null; body: string; pro_only?: boolean; locked?: boolean }
  | { type: "cta"; title?: string | null; actions: CtaAction[]; pro_only?: boolean; locked?: boolean };

export type HelpQuickAction = {
  key: string;
  title: string;
  subtitle: string;
  route: string;
};

export type HelpPopularCategory = {
  slug: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  icon?: string | null;
};

export type HelpScanCta = {
  title: string;
  subtitle: string;
  primary_button: string;
  primary_action: string;
  helper_text?: string | null;
  pro_hint?: string | null;
};

export type HelpHomeResponse = {
  quick_actions: HelpQuickAction[];
  popular_categories: HelpPopularCategory[];
  scan_cta: HelpScanCta;
};

export type HelpGuideCardData = {
  slug: string;
  title: string;
  subtitle?: string | null;
};

export type HelpCategoryHero = {
  title?: string | null;
  text?: string | null;
  badge?: string | null;
};

export type HelpUsefulAction = {
  key: string;
  title: string;
  subtitle?: string | null;
  action: string;
  highlighted: boolean;
};

export type HelpFallbackBlock = {
  title: string;
  text: string;
};

export type HelpCategoryDetailResponse = {
  slug: string;
  title: string;
  subtitle?: string | null;
  hero: HelpCategoryHero;
  guides: HelpGuideCardData[];
  fallback?: HelpFallbackBlock | null;
  useful_actions: HelpUsefulAction[];
};

export type HelpGuideCategoryRef = {
  slug: string;
  title: string;
};

export type HelpGuideDetailResponse = {
  slug: string;
  category: HelpGuideCategoryRef;
  title: string;
  subtitle?: string | null;
  short_summary?: string | null;
  language: HelpLanguage;
  fallback_language?: HelpLanguage | null;
  sections: Section[];
  official_source_url?: string | null;
  updated_at?: string | null;
};

export type HelpSearchResult = {
  type: "guide" | "category";
  slug: string;
  title: string;
  subtitle?: string | null;
  category_title?: string | null;
};

export type HelpSearchResponse = {
  query: string;
  results_count: number;
  results: HelpSearchResult[];
};

export function helpLanguageForLocale(locale: HelpLanguage): HelpLanguage {
  return locale;
}
