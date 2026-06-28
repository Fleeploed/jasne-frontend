import { apiFetch } from "@/lib/api";
import type { AppLocale } from "@/lib/i18n";

export type OampStatusQueryKind = "proceedings" | "visa";
export type OampStatusOutcome = "approved" | "processing" | "not_found" | "rejected" | "found" | "unknown";

export type OampStatusResponse = {
  kind: OampStatusQueryKind;
  query: string;
  status: OampStatusOutcome;
  message: string;
  source_url: string;
  checked_at: string;
};

export type OampStatusInput =
  | { caseNumber: string; visaNumber?: undefined; language?: AppLocale }
  | { caseNumber?: undefined; visaNumber: string; language?: AppLocale };

/**
 * POST /status/oamp — backend scrapes the OAMP public portal and returns the
 * proceedings/visa status. The backend re-parses `case_number` server-side
 * (see app/models/schemas.py::OampStatusCheckRequest) so the frontend may
 * send the user's raw číslo jednací unparsed.
 */
export async function checkOampStatus(input: OampStatusInput): Promise<OampStatusResponse> {
  const body: Record<string, string> = {};
  if (input.caseNumber) body.case_number = input.caseNumber;
  if (input.visaNumber) body.visa_number = input.visaNumber;
  if (input.language) body.language = input.language;
  // The backend scrapes ipc.gov.cz with Playwright (~40 s warm, longer on a
  // cold Render start), so the default 30 s timeout aborted early and showed a
  // false network error. Allow up to 120 s to outlast the scrape + cold boot.
  return apiFetch<OampStatusResponse>("/status/oamp", {
    method: "POST",
    json: body,
    timeoutMs: 120_000,
  });
}
