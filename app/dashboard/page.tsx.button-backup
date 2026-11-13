import { hasAppAccess } from "@/lib/access";
import { Suspense } from "react";
import { auth, signIn, signOut } from "@/auth";
import DomainsForm from "../domains-form";

async function Dashboard() {
  const allowed = await hasAppAccess();

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b1120] p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151f30] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-3xl">
            🔒
          </div>

          <h1 className="text-2xl font-bold">
            Access Restricted
          </h1>

          <p className="mt-4 text-sm leading-7 text-slate-400">
            Your account is not authorized to use Postmaster Manager.
            To request access, please contact the administrator on Telegram.
          </p>

          <a
            href="https://t.me/ilyas_houari8"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500"
          >
            Contact @ilyas_houari8
          </a>
        </div>
      </main>
    );
  }
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1019] px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151d2b] p-8 shadow-2xl">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold text-white">P</div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Postmaster Manager</h1>
              <p className="text-xs text-slate-400">Domain operations workspace</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Connect your Google account to manage domains and verification records.</p>
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <button type="submit" className="mt-7 w-full rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">Connect Gmail</button>
          </form>
        </div>
      </div>
    );
  }

  const switchAccount = (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
      <button type="submit" className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:bg-white/10">Switch Gmail</button>
    </form>
  );

  return <DomainsForm email={session.user.email ?? "Connected account"} switchAccount={switchAccount} />;
}

export default function Home() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#0b1019] text-slate-300">Loading workspaceâ€¦</main>}>
      <Dashboard />
    </Suspense>
  );
}



