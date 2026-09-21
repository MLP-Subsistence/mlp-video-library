import { normalizeRole } from "@/lib/roles";

/** Studio capabilities derived from User.role. Pure, safe for the worker and the client. */
export function studioPermissions(user: { role: string | null | undefined }) {
  const role = normalizeRole(user.role);
  return {
    canManageTemplates: role !== "educator",
    canGenerateVideo: true,
    canPublish: role !== "educator"
  };
}
