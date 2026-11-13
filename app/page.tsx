import { Suspense } from "react";
import { auth, signIn, signOut } from "@/auth";
import DomainsForm from "./domains-form";

async function Dashboard() {
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
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#0b1019] text-slate-300">Loading workspace…</main>}>
      <Dashboard />
    </Suspense>
  );
}
