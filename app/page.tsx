import Link from "next/link";

export const metadata = {
  title: "Postmaster Manager | Domain Management",
  description:
    "Manage Google Postmaster Tools domains, DNS verification records, and domain verification in one workspace.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b1120] text-slate-100">
      <div className="mx-auto max-w-6xl px-6">
        <header className="flex items-center justify-between border-b border-white/10 py-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 font-bold text-white">
              P
            </div>
            <span className="text-lg font-semibold">
              Postmaster Manager
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Open Dashboard
          </Link>
        </header>

        <section className="grid items-center gap-12 py-20 lg:grid-cols-2">
          <div>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-xs font-medium text-indigo-300">
              Google Postmaster Tools Management
            </span>

            <h1 className="mt-7 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Manage your domains.
              <span className="block text-indigo-400">
                All in one workspace.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-400">
              Postmaster Manager helps authorized users add domains to Google
              Postmaster Tools, retrieve DNS TXT verification records, verify
              domain ownership, and manage registered domains efficiently.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white transition hover:bg-indigo-400"
              >
                Get Started
              </Link>

              <Link
                href="/privacy"
                className="rounded-xl border border-white/10 px-6 py-3 font-medium text-slate-300 transition hover:bg-white/5"
              >
                Privacy Policy
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#151f30] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-semibold text-white">
                Domain Workspace
              </span>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                Google OAuth
              </span>
            </div>

            <div className="space-y-3">
              {[
                ["01", "Add domains", "Register domains with Postmaster Tools"],
                ["02", "Get TXT records", "Retrieve DNS verification tokens"],
                ["03", "Verify domains", "Confirm ownership after DNS setup"],
                ["04", "Manage domains", "Remove registered domains when needed"],
              ].map(([number, title, description]) => (
                <div
                  key={number}
                  className="flex gap-4 rounded-xl border border-white/5 bg-white/[0.03] p-4"
                >
                  <span className="font-mono text-sm text-indigo-400">
                    {number}
                  </span>
                  <div>
                    <h3 className="font-medium text-white">{title}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 border-t border-white/10 py-12 md:grid-cols-3">
          {[
            ["Google Sign-in", "Connect securely using your Google Account."],
            ["Bulk Operations", "Manage multiple authorized domains at once."],
            ["TXT Export", "Copy DNS records for your DNS management tools."],
          ].map(([title, description]) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {description}
              </p>
            </div>
          ))}
        </section>

        <footer className="flex flex-col gap-4 border-t border-white/10 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Created by Ilyas Houari</span>

          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms of Service
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
