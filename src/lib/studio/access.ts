import "server-only";
import { NextResponse } from "next/server";
import { canManageTemplates, getCurrentUser, isAdminRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectWhereForUser } from "@/lib/studio/projects";

export { studioPermissions } from "@/lib/studio/permissions";
export { projectWhereForUser };

export type StudioUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Friendly, typed failures for API handlers. The message is safe to show to
 * educators; `detail` is only ever logged server-side.
 */
export class StudioError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status = 400, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function requireStudioApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new StudioError("Please sign in to Educator Studio.", 401);
  return user;
}

export function assertTemplateManager(user: StudioUser) {
  if (!canManageTemplates(user.role)) throw new StudioError("Only content managers and administrators can change master templates and assets.", 403);
}

export function assertAdmin(user: StudioUser) {
  if (!isAdminRole(user.role)) throw new StudioError("Administrator access is required.", 403);
}

export async function requireProjectAccess(user: StudioUser, projectId: string) {
  const project = await prisma.studioProject.findFirst({ where: { id: projectId, ...projectWhereForUser(user) } });
  if (!project) throw new StudioError("That localization project could not be found.", 404);
  return project;
}

/** Wrap a route handler so StudioErrors become friendly JSON and everything else is logged, not leaked. */
export function studioRoute<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof StudioError) {
        if (error.detail) console.error(`[studio] ${error.message}: ${error.detail}`);
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error("[studio] unexpected error", error);
      return NextResponse.json({ error: "Something went wrong. Please try again, and contact MLP support if it keeps happening." }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new StudioError("The request could not be read.", 400);
  }
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
