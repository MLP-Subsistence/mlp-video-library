import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const templates = await prisma.studioTemplate.findMany({ where: { title: { contains: "Youth Africa" } }, include: { segments: { orderBy: { orderIndex: "asc" }, include: { mediaMatches: { orderBy: { rank: "asc" } } } } }, orderBy: { title: "asc" } });
let master = 0, image = 0, total = 0, withCandidates = 0;
const rows: string[] = [];
for (const t of templates) {
  let m = 0, i = 0, c = 0;
  for (const s of t.segments) {
    total++;
    const comp = JSON.parse(s.composition || "{}");
    const ids = (comp.slots ?? []).flatMap((sl: any) => sl.items.map((it: any) => it.assetId));
    const usesMaster = ids.includes(t.masterAssetId);
    if (usesMaster) { m++; master++; if (s.mediaMatches.some((x) => x.status === "candidate")) { c++; withCandidates++; } } else { i++; image++; }
  }
  rows.push(`${t.title.slice(0, 60).padEnd(60)} images ${String(i).padStart(2)} | master video ${String(m).padStart(2)} (with candidates ${c})`);
}
console.log(rows.join("\n"));
console.log({ total, image, master, withCandidates });
await prisma.$disconnect();
