import { NextResponse } from "next/server";
import { isSafeStorageKey, storage, verifyLocalUploadToken } from "@/lib/studio/storage";

/**
 * Direct upload target for the `local` storage driver. The signed token from
 * /api/studio/uploads/sign authorizes exactly one key, content type, size
 * limit and expiry, so no session cookie is needed here (S3 presigned URLs
 * work the same way).
 */
export async function PUT(request: Request) {
  if (storage().name !== "local") return NextResponse.json({ error: "Direct uploads are handled by object storage on this server." }, { status: 404 });
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const type = url.searchParams.get("type") || "";
  const max = Number(url.searchParams.get("max") || 0);
  const exp = Number(url.searchParams.get("exp") || 0);
  const token = url.searchParams.get("token") || "";
  if (!isSafeStorageKey(key) || !verifyLocalUploadToken(key, type, max, exp, token)) {
    return NextResponse.json({ error: "This upload link is invalid or has expired. Please try the upload again." }, { status: 403 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ error: "The file appears to be empty." }, { status: 400 });
  if (bytes.length > max) return NextResponse.json({ error: "The file is larger than allowed." }, { status: 413 });
  await storage().put(key, bytes, type);
  return NextResponse.json({ ok: true, storageKey: key });
}
