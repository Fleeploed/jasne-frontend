import { apiFetch } from "@/lib/api";

export type OampTrackingStatus = "probiha" | "schvaleno" | "zamitnuto" | "not_found" | "error";

export type OampTrackingResponse = {
  id: string;
  cislo_jednaci: string;
  current_status: OampTrackingStatus;
  next_check_at: string;
};

export async function listOampTrackings() {
  return apiFetch<OampTrackingResponse[]>("/tracking/applications");
}

export async function createOampTracking(cisloJednaci: string) {
  return apiFetch<OampTrackingResponse>("/tracking/applications", {
    method: "POST",
    json: { cislo_jednaci: cisloJednaci },
  });
}

export async function deleteOampTracking(id: string) {
  await apiFetch<void>(`/tracking/applications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
