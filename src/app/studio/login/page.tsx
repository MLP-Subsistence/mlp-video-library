import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Clapperboard, Home, Lock, LogIn, Mail, ShieldAlert } from "lucide-react";
import { loginAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { getCurrentUser, safeNextPath } from "@/lib/auth";

export const metadata = { title: "Educator Studio sign in", robots: { index: false, follow: false } };

export default async function StudioLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/studio");
  const user = await getCurrentUser();
  if (user) redirect(next);
  return (
    <main className="min-h-screen bg-[#f7f8fa] px-3 py-5 text-[#243447] sm:px-6 sm:py-7">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#a64026]"><Home className="size-4" /> Home</Link>
      <div className="mx-auto mt-2 flex max-w-md flex-col items-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-[#a64026] text-white shadow-lg"><Clapperboard className="size-8" /></div>
        <h1 className="mt-5 text-center text-2xl font-extrabold sm:text-3xl">Educator Studio</h1>
        <p className="mt-1 text-sm text-[#6b7c8f]">Create and manage localized Marketplace Literacy lessons.</p>
        <form action={loginAction} className="mt-8 w-full rounded-3xl bg-white p-5 shadow-[0_20px_45px_rgba(36,52,71,0.10)] ring-1 ring-[#edf0f3] sm:mt-10 sm:p-8">
          <input type="hidden" name="portal" value="studio" />
          <input type="hidden" name="next" value={next} />
          <h2 className="text-2xl font-extrabold">Welcome</h2>
          <p className="mt-2 text-sm text-[#6b7c8f]">Sign in with the educator account MLP gave you.</p>
          {params.error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{params.error}</div>}
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-bold">Email Address</span>
            <span className="mlp-input flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-[#8b9bad]" />
              <input name="email" type="email" autoComplete="email" placeholder="you@example.org" required className="h-full w-full border-0 bg-transparent p-0 text-[#243447] outline-none" />
            </span>
          </label>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold">Password</span>
            <span className="mlp-input flex items-center gap-2">
              <Lock className="size-4 shrink-0 text-[#8b9bad]" />
              <input name="password" type="password" autoComplete="current-password" required className="h-full w-full border-0 bg-transparent p-0 text-[#243447] outline-none" />
            </span>
          </label>
          <PendingSubmitButton className="mlp-btn-primary mt-6 w-full" pendingLabel="Signing in..."><LogIn className="size-4" /> Open Educator Studio</PendingSubmitButton>
          <Link href="/" className="mlp-btn-outline mt-4 w-full"><ArrowLeft className="size-4" /> Back to Public Library</Link>
          <div className="mt-6 flex gap-3 rounded-lg bg-[#f7f8fa] p-4 text-sm leading-relaxed text-[#6b7c8f]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#6b7c8f]" />
            <span>Educator accounts are created by the Marketplace Literacy team. If you need access, contact your MLP coordinator.</span>
          </div>
        </form>
        <footer className="mt-8 text-center text-xs text-[#526579]">
          <div>(c) 2026 Marketplace Literacy Project</div>
          <div className="mt-2 flex justify-center gap-4"><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link></div>
        </footer>
      </div>
    </main>
  );
}
