import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isSafeStorageKey, mimeForExtension, storage } from "@/lib/studio/storage";

/**
 * Serves objects for the `local` storage driver (and acts as a proxy when an
 * S3 bucket has no public URL). Supports HTTP range requests so <video> and
 * <audio> elements can seek, which the timeline scrubber relies on.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join("/");
  if (!isSafeStorageKey(key)) return new NextResponse("Not found", { status: 404 });
  const type = mimeForExtension(path.extname(key));
  const driver = storage();
  const local = driver.localPath(key);

  if (local) {
    let size: number;
    try {
      size = (await stat(local)).size;
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }
    const range = request.headers.get("range");
    const headers: Record<string, string> = {
      "content-type": type,
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable"
    };
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      headers["content-range"] = `bytes ${start}-${end}/${size}`;
      headers["content-length"] = String(end - start + 1);
      const stream = createReadStream(local, { start, end });
      return new NextResponse(toWebStream(stream), { status: 206, headers });
    }
    headers["content-length"] = String(size);
    return new NextResponse(toWebStream(createReadStream(local)), { status: 200, headers });
  }

  const bytes = await driver.get(key);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
}

function toWebStream(stream: import("fs").ReadStream) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    }
  });
}
