import os from "os";
import { prisma } from "@/lib/prisma";
import { processJob, recoverStaleJobs } from "@/worker/process-job";

/**
 * Educator Studio worker: polls StudioJob for queued render/align jobs.
 *
 *   npm run worker
 *
 * Environment: DATABASE_URL (same database as the site), storage settings
 * (STUDIO_STORAGE_DRIVER + STUDIO_S3_* or STUDIO_STORAGE_DIR), OPENAI_API_KEY
 * for alignment, FFMPEG_PATH/FFPROBE_PATH when FFmpeg is not on PATH.
 */
const workerId = `${os.hostname()}-${process.pid}`;
const pollMs = Number(process.env.STUDIO_WORKER_POLL_MS || 4000);
const staleMs = Number(process.env.STUDIO_WORKER_STALE_MS || 30 * 60 * 1000);
let stopping = false;

async function loop() {
  console.log(`[worker] ${workerId} started (poll ${pollMs} ms)`);
  let lastRecovery = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastRecovery > 60_000) {
        const recovered = await recoverStaleJobs(staleMs);
        if (recovered.requeued || recovered.abandoned) console.log(`[worker] recovered stale jobs`, recovered);
        lastRecovery = Date.now();
      }
      const next = await prisma.studioJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
      if (!next) {
        await sleep(pollMs);
        continue;
      }
      console.log(`[worker] running ${next.type} job ${next.id}`);
      const result = await processJob(next.id, workerId);
      if (result) console.log(`[worker] job ${next.id} → ${result.status}`);
    } catch (error) {
      console.error("[worker] loop error", error);
      await sleep(pollMs * 2);
    }
  }
  await prisma.$disconnect();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  stopping = true;
  console.log("[worker] stopping after the current job");
});
process.on("SIGTERM", () => {
  stopping = true;
});

void loop();
