export const OAMP_PHONE = "+420 974 801 801";
export const OAMP_PHONE_TEL = "+420974801801";

export type OampWeekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type OampHoursRange = [number, number] | null;

export const OAMP_HOURS: Record<OampWeekday, OampHoursRange> = {
  mon: [8, 16],
  tue: [8, 16],
  wed: [8, 16],
  thu: [8, 16],
  fri: [8, 14],
  sat: null,
  sun: null,
};

export const OAMP_DOCUMENTS_FOR_PREVZETI = [
  "oamp.documents.passport",
  "oamp.documents.oldPermit",
  "oamp.documents.originalDocs",
] as const;

export type OampStatus = "probiha" | "schvaleno" | "zamitnuto" | "not_found" | "error";
