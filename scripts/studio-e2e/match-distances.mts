import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const rows = await prisma.studioMediaMatch.findMany({ where: { rank: 0 }, select: { description: true } });
const hist: Record<string, number> = {};
for (const r of rows) { const m = /^(\d+)% match/.exec(r.description); const pct = m ? Number(m[1]) : -1; const d = Math.round((1 - pct / 100) * 32); hist[d] = (hist[d] ?? 0) + 1; }
console.log(Object.entries(hist).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, n]) => `d${d}:${n}`).join("  "));
await prisma.$disconnect();
