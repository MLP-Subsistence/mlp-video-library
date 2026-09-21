export type StudioRole = "admin" | "editor" | "educator";

export function normalizeRole(role: string | null | undefined): StudioRole {
  if (role === "admin") return "admin";
  if (role === "educator") return "educator";
  return "editor";
}

export function roleLabel(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") return "Administrator";
  if (normalized === "educator") return "Educator";
  return "Content Manager";
}

/** Administrators and content managers may use the /admin portal. */
export function canAccessAdmin(role: string | null | undefined) {
  return normalizeRole(role) !== "educator";
}

/** Every signed-in role may use Educator Studio. */
export function canAccessStudio(role: string | null | undefined) {
  return Boolean(normalizeRole(role));
}

/** Master templates, assets, layouts and timing corrections. */
export function canManageTemplates(role: string | null | undefined) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "editor";
}

export function isAdminRole(role: string | null | undefined) {
  return normalizeRole(role) === "admin";
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNextPath(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (!(value.startsWith("/studio") || value.startsWith("/admin"))) return fallback;
  return value;
}
