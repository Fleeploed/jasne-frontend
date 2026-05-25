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
  | "open_help_center";

export type Section =
  | { type: "text"; title?: string | null; body: string }
  | { type: "steps"; title?: string | null; items: string[] }
  | { type: "checklist"; title?: string | null; items: string[] }
  | { type: "warning"; title?: string | null; body: string }
  | { type: "cta"; title?: string | null; actions: CtaAction[] };

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
