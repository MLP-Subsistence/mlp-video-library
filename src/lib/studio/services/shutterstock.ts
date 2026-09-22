/**
 * Shutterstock adapter for the media library: reverse image search (find the
 * clean stock image behind a captioned lesson frame) and, when MLP has a
 * Shutterstock **API subscription**, licensing + download.
 *
 * Facts that shape this (Shutterstock API reference, checked 2026-09-22):
 * - Search and reverse image search work with any app token
 *   (shutterstock.com → account → Developers → Create app → generate token).
 * - Licensing through the API needs an *API subscription*, which is a separate
 *   product from website image subscriptions ("API subscriptions don't work on
 *   the Shutterstock web site" and vice versa). Without one, the studio still
 *   finds the exact image and links to it so a content manager can license it
 *   with the website subscription and upload the file.
 * - Endpoints: POST /v2/cv/images {base64_image} → {upload_id};
 *   GET /v2/cv/similar/images?asset_id=…; POST /v2/images/licenses;
 *   GET /v2/user/subscriptions. Token: `Authorization: Bearer …`, server only.
 */

const BASE = process.env.SHUTTERSTOCK_API_BASE || "https://api.shutterstock.com";

export function shutterstockConfigured() {
  return Boolean(process.env.SHUTTERSTOCK_API_TOKEN);
}

export function shutterstockLicensingConfigured() {
  return Boolean(process.env.SHUTTERSTOCK_API_TOKEN && process.env.SHUTTERSTOCK_SUBSCRIPTION_ID);
}

function headers(extra: Record<string, string> = {}) {
  const token = process.env.SHUTTERSTOCK_API_TOKEN;
  if (!token) throw new Error("SHUTTERSTOCK_API_TOKEN is not configured");
  return { authorization: `Bearer ${token}`, accept: "application/json", ...extra };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: headers((init.headers as Record<string, string>) || {}) });
  const text = await response.text();
  if (!response.ok) {
    const reset = response.headers.get("RateLimit-Reset");
    throw new Error(`Shutterstock ${response.status}${reset ? ` (rate limit resets ${reset})` : ""}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type StockImageCandidate = {
  externalId: string;
  previewUrl: string;
  pageUrl: string;
  description: string;
  aspect: number | null;
  contributor: string | null;
};

type SimilarResponse = {
  data?: Array<{
    id: string;
    description?: string;
    aspect?: number;
    assets?: { preview?: { url?: string }; huge_thumb?: { url?: string }; large_thumb?: { url?: string }; preview_1000?: { url?: string } };
    contributor?: { id?: string };
  }>;
  total_count?: number;
};

/** Upload the (caption-cropped) frame as an ephemeral image and list visually similar stock images. */
export async function findSimilarImages(imageBytes: Buffer, options: { perPage?: number } = {}): Promise<StockImageCandidate[]> {
  const upload = await request<{ upload_id: string }>("/v2/cv/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ base64_image: imageBytes.toString("base64") })
  });
  const query = new URLSearchParams({ asset_id: upload.upload_id, per_page: String(options.perPage ?? 12), view: "full" });
  const similar = await request<SimilarResponse>(`/v2/cv/similar/images?${query.toString()}`);
  return (similar.data ?? []).map((image) => ({
    externalId: image.id,
    previewUrl: image.assets?.preview_1000?.url || image.assets?.huge_thumb?.url || image.assets?.preview?.url || image.assets?.large_thumb?.url || "",
    pageUrl: `https://www.shutterstock.com/image-photo/-${image.id}`,
    description: image.description ?? "",
    aspect: typeof image.aspect === "number" ? image.aspect : null,
    contributor: image.contributor?.id ?? null
  }));
}

export async function listSubscriptions() {
  const data = await request<{ data?: Array<{ id: string; license?: string; description?: string; allotment?: { downloads_left?: number; downloads_limit?: number } }> }>("/v2/user/subscriptions");
  return data.data ?? [];
}

/** License one image with the API subscription and return the download URL (valid briefly — download immediately). */
export async function licenseImage(imageId: string, options: { size?: "small" | "medium" | "huge"; subscriptionId?: string } = {}) {
  const subscriptionId = options.subscriptionId || process.env.SHUTTERSTOCK_SUBSCRIPTION_ID;
  if (!subscriptionId) throw new Error("SHUTTERSTOCK_SUBSCRIPTION_ID is not configured (an API subscription is required to license through the API)");
  const query = new URLSearchParams({ subscription_id: subscriptionId, size: options.size ?? "huge", format: "jpg" });
  const result = await request<{ data?: Array<{ image_id?: string; license_id?: string; download?: { url?: string }; error?: string }> }>(`/v2/images/licenses?${query.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images: [{ image_id: imageId }] })
  });
  const entry = result.data?.[0];
  if (!entry?.download?.url) throw new Error(`Shutterstock did not return a download URL${entry?.error ? `: ${entry.error}` : ""}`);
  return { downloadUrl: entry.download.url, licenseId: entry.license_id ?? null };
}

export async function downloadLicensedFile(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}
