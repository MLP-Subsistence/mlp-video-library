import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Home, Lock, LogIn, Mail, ShieldAlert, GraduationCap } from "lucide-react";
import { loginAction } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-[#f7f8fa] px-3 py-5 text-[#243447] sm:px-6 sm:py-7">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#a64026]"><Home className="size-4" /> Home</Link>
      <div className="mx-auto mt-2 flex max-w-md flex-col items-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-[#a64026] text-white shadow-lg"><GraduationCap className="size-8" /></div>
        <h1 className="mt-5 text-center text-2xl font-extrabold sm:text-3xl">MLP Video Library</h1>
        <p className="mt-1 text-sm text-[#6b7c8f]">Administrator Portal</p>
        <form action={loginAction} className="mt-8 w-full rounded-3xl bg-white p-5 shadow-[0_20px_45px_rgba(36,52,71,0.10)] ring-1 ring-[#edf0f3] sm:mt-10 sm:p-8">
          <h2 className="text-2xl font-extrabold">Welcome Back</h2>
          <p className="mt-2 text-sm text-[#6b7c8f]">Please enter your credentials to manage the library.</p>
          {params.error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{params.error}</div>}
          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-bold">Email Address</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3 top-3 size-4 text-[#8b9bad]" />
              <input name="email" type="email" placeholder="admin@marketplaceliteracy.org" defaultValue="admin@marketplaceliteracy.org" required className="mlp-input w-full pl-10" />
            </span>
          </label>
          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold">Password</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-3 size-4 text-[#8b9bad]" />
              <input name="password" type="password" required className="mlp-input w-full pl-10" />
            </span>
          </label>
          <div className="mt-3 text-right"><a className="text-sm font-bold text-[#a64026]" href="#">Forgot password?</a></div>
          <PendingSubmitButton className="mlp-btn-primary mt-5 w-full" pendingLabel="Signing in..."><LogIn className="size-4" /> Sign In to Dashboard</PendingSubmitButton>
          <Link href="/" className="mlp-btn-outline mt-4 w-full"><ArrowLeft className="size-4" /> Back to Public Library</Link>
          <div className="mt-6 flex gap-3 rounded-lg bg-[#f7f8fa] p-4 text-sm leading-relaxed text-[#6b7c8f]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#6b7c8f]" />
            <span>This area is for authorized MLP staff only. If you are a learner, please return to the home page.</span>
          </div>
        </form>
        <footer className="mt-8 text-center text-xs text-[#526579]">
          <div>(c) 2024 Marketplace Literacy Project</div>
          <div className="mt-2 flex justify-center gap-4"><a>Privacy Policy</a><a>Terms of Service</a></div>
        </footer>
      </div>
    </main>
  );
}
