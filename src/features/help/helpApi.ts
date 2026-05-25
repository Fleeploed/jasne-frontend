import { apiFetch } from "@/lib/api";
import type {
  HelpCategoryDetailResponse,
  HelpGuideDetailResponse,
  HelpHomeResponse,
  HelpLanguage,
  HelpSearchResponse,
} from "@/features/help/types";

export async function getHelpHome(language: HelpLanguage): Promise<HelpHomeResponse> {
  return apiFetch<HelpHomeResponse>(`/help/home?language=${encodeURIComponent(language)}`);
}

export async function getHelpCategory(slug: string, language: HelpLanguage): Promise<HelpCategoryDetailResponse> {
  return apiFetch<HelpCategoryDetailResponse>(
    `/help/categories/${encodeURIComponent(slug)}?language=${encodeURIComponent(language)}`
  );
}

export async function getHelpGuide(slug: string, language: HelpLanguage): Promise<HelpGuideDetailResponse> {
  return apiFetch<HelpGuideDetailResponse>(
    `/help/guides/${encodeURIComponent(slug)}?language=${encodeURIComponent(language)}`
  );
}

export async function searchHelp(query: string, language: HelpLanguage): Promise<HelpSearchResponse> {
  return apiFetch<HelpSearchResponse>(
    `/help/search?q=${encodeURIComponent(query)}&language=${encodeURIComponent(language)}`
  );
}
