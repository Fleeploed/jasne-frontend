// Extracts a trackable OAMP číslo jednací from free OCR text.
//
// The backend tracker validates identifiers against `^OAM-\d+/[A-Z]+-\d{4}$`
// (see app/services/trackers/oamp.py), so we normalize whatever shape the
// document uses — including the optional `-4` proceedings suffix and stray
// whitespace — down to that canonical, trackable form. The suffix is dropped
// because the automatic status tracker keys on the base case number only.
const OAMP_IN_TEXT_RE = /OAM[\s-]?(\d{1,6})(?:[\s-]?[A-Z0-9]{1,3})?\s*\/\s*([A-Z]{2,4})[\s-]?(\d{4})/i;

export function extractOampIdentifier(text: string): string | null {
  if (!text) return null;
  const normalized = text.replace(/0AM/gi, "OAM");
  const match = OAMP_IN_TEXT_RE.exec(normalized);
  if (!match) return null;
  const [, sequence, type, year] = match;
  return `OAM-${sequence}/${type.toUpperCase()}-${year}`;
}

// Normalizes an identifier for equality comparison between a freshly extracted
// number and one already stored on a tracking row.
export function normalizeOampIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/^0AM/, "OAM");
}
