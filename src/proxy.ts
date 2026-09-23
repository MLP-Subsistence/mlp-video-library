import { NextResponse, type NextRequest } from "next/server";

/**
 * Educator Studio deep links: send signed-out visitors to the educator login
 * and bring them back to the exact page afterwards. Session validity is still
 * verified server-side in the protected layout; this only checks presence.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!pathname.startsWith("/studio") || pathname.startsWith("/studio/login") || pathname.startsWith("/studio/logout")) return NextResponse.next();
  if (request.cookies.get("mlp_admin_session")?.value) return NextResponse.next();
  const login = request.nextUrl.clone();
  login.pathname = "/studio/login";
  login.search = "";
  if (pathname !== "/studio") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/studio/:path*"]
};
