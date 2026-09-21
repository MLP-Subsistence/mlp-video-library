import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { canAccessAdmin, canAccessStudio } from "@/lib/roles";

export { canAccessAdmin, canAccessStudio, canManageTemplates, isAdminRole, normalizeRole, roleLabel, safeNextPath, type StudioRole } from "@/lib/roles";

const COOKIE_NAME = "mlp_admin_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return value || "local-development-secret-change-before-public-deployment";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function createSessionValue(userId: string) {
  const payload = JSON.stringify({ userId, issuedAt: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export async function setAdminSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, createSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 60 * 60 * 12,
    path: "/"
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const session = jar.get(COOKIE_NAME)?.value;
  const payload = readSessionPayload(session);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}

export function readSessionPayload(session?: string) {
  if (!session) return null;
  const [encoded, signature] = session.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const valid =
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  if (!valid) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      userId: string;
      issuedAt: number;
    };
    if (Date.now() - payload.issuedAt > 1000 * 60 * 60 * 12) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Returns the signed-in user when they may use /admin, otherwise null. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessAdmin(user.role)) return null;
  return user;
}

/** Returns the signed-in user when they may use Educator Studio, otherwise null. */
export async function requireStudioUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!canAccessStudio(user.role)) return null;
  return user;
}


export async function verifyLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
