"use client";

import { useMemo, useState, type ReactNode } from "react";

type Result = { domain: string; status: string; error?: string; record?: string };
type Action = "add" | "get" | "verify";
type View = "workspace" | "activity";

function Glyph({ name, size = 18 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const path: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    history: <><path d="M3 12a9 9 0 1 0 2.8-6.5"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    file: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    trash: <><path d="M4 7h16M10 4h4M7 7l1 13h8l1-13"/><path d="M10 11v6M14 11v6"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    check: <path d="m5 12 5 5L20 7"/>,
    alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
  };
  return <svg {...shared} aria-hidden="true">{path[name] ?? path.grid}</svg>;
}

function StatusPill({ status }: { status: string }) {
  const good = ["ADDED", "ALREADY EXISTS", "TXT READY", "VERIFIED", "DELETED"].includes(status);
  return <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${good ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>{status}</span>;
}

export default function DomainsForm({ email, switchAccount }: { email: string; switchAccount: ReactNode }) {
  const [view, setView] = useState<View>("workspace");
  const [domains, setDomains] = useState("");
  const [addResults, setAddResults] = useState<Result[]>([]);
  const [txtResults, setTxtResults] = useState<Result[]>([]);
  const [verifyResults, setVerifyResults] = useState<Result[]>([]);
  const [deleteResults, setDeleteResults] = useState<Result[]>([]);
  const [records, setRecords] = useState<string[]>([]);
  const [loading, setLoading] = useState("");
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  const list = useMemo(() => [...new Set(domains.split(/[\s,;]+/).map(d => d.trim().toLowerCase()).filter(Boolean))], [domains]);
  const busy = loading !== "";
  const addedCount = addResults.filter(r => ["ADDED", "ALREADY EXISTS"].includes(r.status)).length;
  const verifiedCount = verifyResults.filter(r => r.status === "VERIFIED").length;
  const deletedCount = deleteResults.filter(r => r.status === "DELETED").length;
  const allResults = [...addResults, ...txtResults, ...verifyResults, ...deleteResults];
  const failedCount = allResults.filter(r => ["FAILED", "NOT FOUND"].includes(r.status)).length;

  async function request(domain: string, action: Action): Promise<Result> {
    const response = await fetch(action === "add" ? "/api/domains" : "/api/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "add" ? { domain } : { domain, action }),
    });
    const data = await response.json();
    return { domain, status: data.status || "FAILED", error: data.error || (!response.ok ? "Request failed" : undefined), record: data.record };
  }

  async function run(action: Action) {
    if (busy || !list.length) return;
    setLoading(action);
    setProgress(0);
    setCopied(false);
    setMessage("");
    // Preserve the previous behavior: each operation starts with a fresh results set.
    setAddResults([]); setTxtResults([]); setVerifyResults([]); setDeleteResults([]); setRecords([]);
    const collectedRecords: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const domain = list[i];
      try {
        const result = await request(domain, action);
        if (action === "add") {
          setAddResults(p => [...p, result]);
          if (["ADDED", "ALREADY EXISTS"].includes(result.status)) {
            try {
              const txt = await request(domain, "get");
              setTxtResults(p => [...p, txt]);
              if (txt.record) { collectedRecords.push(txt.record); setRecords(p => [...p, txt.record!]); }
            } catch {
              setTxtResults(p => [...p, { domain, status: "FAILED", error: "TXT extraction failed" }]);
            }
          }
        }
        if (action === "get") {
          setTxtResults(p => [...p, result]);
          if (result.record) { collectedRecords.push(result.record); setRecords(p => [...p, result.record!]); }
        }
        if (action === "verify") setVerifyResults(p => [...p, result]);
      } catch {
        const error = { domain, status: "FAILED", error: "Connection error" };
        if (action === "add") setAddResults(p => [...p, error]);
        if (action === "get") setTxtResults(p => [...p, error]);
        if (action === "verify") setVerifyResults(p => [...p, error]);
      }
      setProgress(i + 1);
    }
    if (action === "add" && collectedRecords.length) {
      try { await navigator.clipboard.writeText(collectedRecords.join("\n")); setCopied(true); setMessage("TXT records copied to clipboard."); }
      catch { setMessage("TXT ready. Use Copy TXT if your browser blocked automatic copying."); }
    } else if (action === "get" && collectedRecords.length) {
      setMessage(`${collectedRecords.length} TXT record(s) ready to copy.`);
    }
    setLoading("");
  }

  async function deleteDomains() {
    if (busy || !list.length) return;
    const confirmed = window.confirm(`Delete ${list.length} domain(s) from Google Postmaster?\n\n${list.join("\n")}\n\nThis does not change DNS records.`);
    if (!confirmed) return;
    setLoading("delete"); setProgress(0); setCopied(false); setMessage("");
    setAddResults([]); setTxtResults([]); setVerifyResults([]); setDeleteResults([]); setRecords([]);
    for (let i = 0; i < list.length; i++) {
      const domain = list[i];
      try {
        const response = await fetch("/api/domains/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
        const data = await response.json();
        setDeleteResults(p => [...p, { domain, status: data.status || "FAILED", error: data.error || (!response.ok ? "Delete failed" : undefined) }]);
      } catch { setDeleteResults(p => [...p, { domain, status: "FAILED", error: "Connection error" }]); }
      setProgress(i + 1);
    }
    setLoading("");
  }

  async function copyRecords() {
    if (!records.length) return;
    try { await navigator.clipboard.writeText(records.join("\n")); setCopied(true); setMessage("TXT records copied to clipboard."); }
    catch { setMessage("Clipboard access blocked. Check browser permissions."); }
  }

  const btn = "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-35";

  function ResultList({ title, data }: { title: string; data: Result[] }) {
    if (!data.length) return null;
    return <section className="space-y-2"><h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title} - {data.length}</h3>
      {data.map((r, index) => <div key={`${r.domain}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
        <div className="min-w-0"><div className="break-all text-xs font-medium text-slate-200">{r.domain}</div>{r.error && <p className="mt-1 break-words text-xs text-rose-300">{r.error}</p>}</div><StatusPill status={r.status}/>
      </div>)}
    </section>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1019] text-slate-100 lg:h-screen lg:overflow-hidden lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.06] bg-[#101722] lg:w-[232px] lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-lg font-bold shadow-lg shadow-indigo-600/15">P</div>
          <div className="min-w-0"><p className="text-sm font-semibold tracking-tight">Postmaster</p><p className="text-xs text-slate-500">Manager</p></div>
        </div>
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Workspace</div>
        <nav className="flex gap-1 px-3 pb-3 lg:flex-col" aria-label="Workspace navigation">
          {([{ id: "workspace", icon: "grid", label: "Dashboard" }, { id: "activity", icon: "history", label: "Activity", count: allResults.length }] as const).map(item =>
            <button key={item.id} type="button" onClick={() => setView(item.id)}
              className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition lg:flex-none ${view === item.id ? "bg-indigo-500/15 font-semibold text-indigo-200" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              <Glyph name={item.icon} size={17}/><span>{item.label}</span>{"count" in item && item.count > 0 && <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[10px]">{item.count}</span>}
            </button>
          )}
        </nav>
        <div className="hidden flex-1 lg:block"/>
        <div className="hidden border-t border-white/[0.06] p-4 lg:block">
          <p className="truncate text-xs font-medium text-slate-300">{email}</p>
          <p className="mt-1 text-[11px] text-emerald-400"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>Connected</p>
          <div className="mt-3">{switchAccount}</div>
          
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#121b28] px-5 py-4 lg:px-7">
          <div><p className="text-[11px] font-medium text-indigo-300">POSTMASTER / {view === "workspace" ? "DASHBOARD" : "ACTIVITY"}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{view === "workspace" ? "Domain workspace" : "Activity history"}</h1>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/><span className="hidden sm:inline">Google connected</span><span className="sm:hidden">Connected</span></div>
        </header>

        {view === "workspace" && <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:overflow-hidden lg:p-6">
          <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
            {[{ label: "Domains", value: list.length, color: "text-slate-100" }, { label: "Added", value: addedCount, color: "text-emerald-300" }, { label: "TXT ready", value: records.length, color: "text-indigo-300" }, { label: "Verified", value: verifiedCount, color: "text-sky-300" }].map(stat =>
              <div key={stat.label} className="rounded-xl border border-white/[0.07] bg-[#182231] px-4 py-3"><p className="text-xs text-slate-400">{stat.label}</p><p className={`mt-1.5 text-2xl font-semibold tabular-nums ${stat.color}`}>{stat.value}</p></div>
            )}
          </div>
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <section className="flex min-h-[260px] flex-col rounded-xl border border-white/[0.07] bg-[#182231] p-4 lg:min-h-0 lg:p-5">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Domains</h2><p className="mt-1 text-xs text-slate-400">Paste one domain per line</p></div><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs text-slate-300">{list.length} loaded</span></div>
              <textarea value={domains} onChange={e => { setDomains(e.target.value); setCopied(false); }} disabled={busy} spellCheck={false} placeholder={"example1.com\nexample2.com\nexample3.com"}
                className="min-h-[145px] w-full flex-1 resize-none rounded-lg border border-white/[0.08] bg-[#0f1724] p-4 font-mono text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-indigo-400/60 disabled:opacity-50"/>
              <div className="mt-3 flex shrink-0 items-center justify-between text-xs text-slate-500"><span>Separate with line breaks, spaces or commas</span><span>{list.length} selected</span></div>
            </section>
            <section className="flex flex-col rounded-xl border border-white/[0.07] bg-[#182231] p-4 lg:p-5">
              <div className="mb-3"><h2 className="text-sm font-semibold">Actions</h2><p className="mt-1 text-xs text-slate-400">Manage the domains above</p></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button type="button" disabled={busy || !list.length} onClick={() => run("add")} className={`${btn} bg-indigo-500 text-white hover:bg-indigo-400 xl:col-span-2`}><Glyph name="plus" size={17}/>{loading === "add" ? "Processingâ€¦" : "Add - Get TXT - Copy"}</button>
                <button type="button" disabled={busy || !list.length} onClick={() => run("get")} className={`${btn} border border-white/[0.09] bg-white/[0.055] text-slate-200 hover:bg-white/10`}><Glyph name="file" size={16}/>{loading === "get" ? "Loadingâ€¦" : "Get TXT"}</button>
                <button type="button" disabled={!records.length || busy} onClick={copyRecords} className={`${btn} border border-white/[0.09] bg-white/[0.055] text-slate-200 hover:bg-white/10`}><Glyph name={copied ? "check" : "copy"} size={16}/>{copied ? "Copied" : `Copy TXT (${records.length})`}</button>
                <button type="button" disabled={busy || !list.length} onClick={() => run("verify")} className={`${btn} border border-sky-500/20 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20`}><Glyph name="shield" size={16}/>{loading === "verify" ? "Verifyingâ€¦" : "Verify all"}</button>
                <button type="button" disabled={busy || !list.length} onClick={deleteDomains} className={`${btn} border border-rose-500/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`}><Glyph name="trash" size={16}/>{loading === "delete" ? "Deletingâ€¦" : "Delete"}</button>
              </div>
              <div className="mt-4 border-t border-white/[0.07] pt-3">
                {busy ? <><div className="mb-2 flex items-center justify-between text-xs text-slate-300"><span>Processing {loading}â€¦</span><span>{progress}/{list.length}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-indigo-400 transition-all" style={{ width: `${list.length ? progress / list.length * 100 : 0}%` }}/></div></>
                  : <p className="text-xs leading-5 text-slate-400">{message || "TXT records remain hidden. Copy them directly to your DNS app."}</p>}
              </div>
            </section>
          </div>
          <button type="button" onClick={() => setView("activity")} className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#182231] px-4 py-3 text-left transition hover:border-white/15">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"><span className="font-semibold text-slate-200">Results</span><span className="text-slate-400">{allResults.length} operations</span><span className="text-emerald-300">{addedCount} added</span><span className="text-indigo-300">{records.length} TXT</span><span className="text-sky-300">{verifiedCount} verified</span><span className="text-amber-300">{deletedCount} deleted</span><span className="text-rose-300">{failedCount} failed</span></div>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-300"><Glyph name="eye" size={15}/> View <Glyph name="chevron" size={14}/></span>
          </button>
        </div>}

        {view === "activity" && <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:p-6">
          <div className="flex items-center justify-between"><p className="text-xs text-slate-400">Results from the current session - {allResults.length} operations</p><button type="button" onClick={() => setView("workspace")} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">Back to workspace</button></div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-xl border border-white/[0.07] bg-[#182231] p-4 lg:p-5">
            {!allResults.length && <p className="text-sm text-slate-400">No operations yet. Add or verify a domain to see results here.</p>}
            <ResultList title="Add results" data={addResults}/><ResultList title="TXT results" data={txtResults}/><ResultList title="Verification results" data={verifyResults}/><ResultList title="Delete results" data={deleteResults}/>
          </div>
        </div>}

        <footer className="shrink-0 border-t border-white/[0.05] px-5 py-2 text-[10px] text-slate-600 lg:px-7">Created by Ilyas Houari</footer>
      </main>
    </div>
  );
}

