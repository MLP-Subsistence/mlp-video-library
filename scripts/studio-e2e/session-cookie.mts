import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const secret = /SESSION_SECRET="?([^"\r\n]+)"?/.exec(env)?.[1] || "local-development-secret-change-before-public-deployment";
const prisma = new PrismaClient();
const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@marketplaceliteracy.org" } });
const encoded = Buffer.from(JSON.stringify({ userId: user.id, issuedAt: Date.now() })).toString("base64url");
const signature = createHmac("sha256", secret).update(encoded).digest("hex");
console.log(`mlp_admin_session=${encoded}.${signature}`);
await prisma.$disconnect();
