"use client";

import { useMemo, useState } from "react";

type Row = { domain: string; date: string; metric: string; value: string };
type Compliance = {
  domain: string;
  rows: { requirement: string; status: string }[];
  oneClick: string;
  honor: string;
  deliverability: string;
  reason: string;
};
type Feedback = { domain: string; ids: { date: string; id: string }[] };

type Group = {
  domain: string;
  dates: Map<string, Record<string, string>>;
  latest: Record<string, string>;
  latestDate: string;
  compliance?: Compliance;
  feedback?: Feedback;
  problems: string[];
  activeErrors: Row[];
};

const columns = [
  { group: "spam", key: "spam", label: "Spam Rate" },
  { group: "auth", key: "spf", label: "SPF" },
  { group: "auth", key: "dkim", label: "DKIM" },
  { group: "auth", key: "dmarc", label: "DMARC" },
  { group: "tls", key: "tls_inbound", label: "TLS Inbound" },
  { group: "tls", key: "tls_outbound", label: "TLS Outbound" },
  { group: "tls_count", key: "count_tls_inbound", label: "TLS In Count" },
  { group: "tls_count", key: "count_tls_outbound", label: "TLS Out Count" },
] as const;

function isActive(value: string): boolean {
  const n = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0;
}
function errorLabel(metric: string) {
  return metric.replace(/^error_/, "").replaceAll("_", " ");
}
function tone(status: string) {
  if (["COMPLIANT", "PASS"].includes(status)) return "text-emerald-400";
  if (["NEEDS_WORK", "FAILED", "FAIL"].includes(status)) return "text-amber-400";
  return "text-slate-400";
}

export default function DomainsOverview({
  rows, complianceResults, feedbackResults, failures, selectedMetrics,
}: {
  rows: Row[];
  complianceResults: Compliance[];
  feedbackResults: Feedback[];
  failures: string[];
  selectedMetrics: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [order, setOrder] = useState("attention");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const activeColumns = columns.filter(c => selectedMetrics.includes(c.group));
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    function get(name: string) {
      let group = map.get(name);
      if (!group) {
        group = { domain: name, dates: new Map(), latest: {}, latestDate: "", problems: [], activeErrors: [] };
        map.set(name, group);
      }
      return group;
    }
    for (const row of rows) {
      const group = get(row.domain);
      if (!group.dates.has(row.date)) group.dates.set(row.date, {});
      group.dates.get(row.date)![row.metric] = row.value;
      if (row.date !== "N/A" && row.date > group.latestDate) group.latestDate = row.date;
      if (row.metric.startsWith("error_") && isActive(row.value)) group.activeErrors.push(row);
    }
    for (const c of complianceResults) get(c.domain).compliance = c;
    for (const f of feedbackResults) get(f.domain).feedback = f;
    for (const message of failures) {
      const sep = message.indexOf(":");
      const name = (sep === -1 ? message : message.slice(0, sep)).trim();
      if (name) get(name).problems.push(message);
    }
    for (const group of map.values()) {
      const dates = [...group.dates.keys()].sort((a, b) => b.localeCompare(a));
      // Per-metric latest value: don't show N/A if a different metric has a newer date.
      for (const date of dates) {
        for (const [metric, value] of Object.entries(group.dates.get(date)!)) {
          if (!(metric in group.latest)) group.latest[metric] = value;
        }
      }
      group.activeErrors.sort((a, b) => b.date.localeCompare(a.date));
    }
    return [...map.values()];
  }, [rows, complianceResults, feedbackResults, failures]);

  const needsAttention = (g: Group) =>
    ["NEEDS_WORK", "FAILED"].includes(g.compliance?.deliverability || "") ||
    g.activeErrors.length > 0 || g.problems.length > 0;
  const filtered = groups.filter(g => g.domain.toLowerCase().includes(query.toLowerCase().trim()))
    .filter(g => filter === "all" || (filter === "attention" && needsAttention(g)) ||
      (filter === "errors" && g.activeErrors.length > 0) ||
      (filter === "healthy" && !needsAttention(g) && g.compliance?.deliverability === "COMPLIANT"))
    .sort((a, b) => {
      if (order === "errors") return b.activeErrors.length - a.activeErrors.length || a.domain.localeCompare(b.domain);
      if (order === "az") return a.domain.localeCompare(b.domain);
      if (order === "newest") return b.latestDate.localeCompare(a.latestDate);
      return Number(needsAttention(b)) - Number(needsAttention(a)) || b.activeErrors.length - a.activeErrors.length || a.domain.localeCompare(b.domain);
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Domain Results</h3>
          <p className="mt-1 text-xs text-slate-400">Each domain has its own summary, daily history and diagnostics.</p>
        </div>
        <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300">{filtered.length} of {groups.length} domains</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input aria-label="Find domain" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search domain..." className="min-w-0 rounded-lg border border-white/10 bg-[#0e1725] px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-400" />
        <select aria-label="Filter domains" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-white/10 bg-[#0e1725] px-3 py-2.5 text-sm text-slate-200">
          <option value="all">All domains</option><option value="attention">Need attention</option><option value="errors">Has errors</option><option value="healthy">Healthy</option>
        </select>
        <select aria-label="Sort domains" value={order} onChange={e => setOrder(e.target.value)} className="rounded-lg border border-white/10 bg-[#0e1725] px-3 py-2.5 text-sm text-slate-200">
          <option value="attention">Attention first</option><option value="errors">Most errors</option><option value="newest">Latest activity</option><option value="az">Domain A-Z</option>
        </select>
      </div>
      {filtered.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No matching domains.</p>}
      {filtered.map(group => {
        const status = selectedMetrics.includes("compliance") ? group.compliance?.deliverability || "NO STATUS" : "";
        const dates = [...group.dates.keys()].filter(d => d !== "N/A").sort((a, b) => b.localeCompare(a));
        const showAll = !!expanded[group.domain];
        const displayedDates = showAll ? dates : dates.slice(0, 7);
        const latestErrors = group.activeErrors.slice(0, showAll ? 100 : 5);
        return (
          <article key={group.domain} className="pm-domain-result-card min-w-0 overflow-hidden rounded-2xl border bg-[#182333]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h4 className="break-all text-base font-semibold text-slate-100 sm:text-lg">{group.domain}</h4>
                <p className="mt-1 text-xs text-slate-400">Last data: {group.latestDate || "N/A"} · {dates.length} dates</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {status && <span className={`rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold ${tone(status.replaceAll(" ", "_"))}`}>{status.replaceAll("_", " ")}</span>}
                {selectedMetrics.includes("delivery") && <span className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${group.activeErrors.length ? "border-amber-400/20 bg-amber-400/10 text-amber-300" : "border-white/10 text-slate-300"}`}>{group.activeErrors.length} active error records</span>}
              </div>
            </div>
            {activeColumns.length > 0 && <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:p-5">
              {activeColumns.map(c => <div key={c.key} className="min-w-0 rounded-xl border border-white/10 bg-[#101b2a] p-3">
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="mt-1 break-all text-base font-semibold tabular-nums text-slate-100">{group.latest[c.key] ?? "N/A"}</p>
              </div>)}
            </div>}
            {activeColumns.length > 0 && dates.length > 0 && <div className="px-4 pb-4 sm:px-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-sm font-semibold text-slate-200">Daily history</h5>
                <span className="text-xs text-slate-400">Newest dates first</span>
              </div>
              <div className="max-w-full overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-max text-left text-xs">
                  <thead className="bg-white/[0.06] text-slate-300"><tr><th className="sticky left-0 z-10 bg-[#27364b] px-3 py-3 font-semibold">Date</th>{activeColumns.map(c => <th key={c.key} className="whitespace-nowrap px-3 py-3 font-semibold">{c.label}</th>)}</tr></thead>
                  <tbody>{displayedDates.map(date => <tr key={date} className="border-t border-white/10 text-slate-300"><td className="sticky left-0 bg-[#182333] px-3 py-3 font-medium tabular-nums">{date}</td>{activeColumns.map(c => <td key={c.key} className="whitespace-nowrap px-3 py-3 tabular-nums">{group.dates.get(date)?.[c.key] ?? "N/A"}</td>)}</tr>)}</tbody>
                </table>
              </div>
              {dates.length > 7 && <button type="button" onClick={() => setExpanded(old => ({...old, [group.domain]: !old[group.domain]}))} className="mt-3 rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10">{showAll ? "Show recent 7 dates" : `Show all ${dates.length} dates`}</button>}
            </div>}
            {selectedMetrics.includes("delivery") && group.activeErrors.length > 0 && <div className="border-t border-white/10 px-4 py-4 sm:px-5">
              <h5 className="mb-2 text-sm font-semibold text-slate-200">Delivery errors</h5>
              <div className="space-y-1.5">{latestErrors.map((r, i) => <div key={`${r.date}-${r.metric}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-400/[0.06] px-3 py-2 text-xs"><span className="break-words text-slate-300">{r.date} · {errorLabel(r.metric)}</span><strong className="tabular-nums text-amber-300">{r.value}</strong></div>)}</div>
              {group.activeErrors.length > 5 && !showAll && <p className="mt-2 text-xs text-slate-400">Showing latest 5 error records. Use “Show all dates” to expand history.</p>}
            </div>}
            {selectedMetrics.includes("compliance") && group.compliance && <div className="border-t border-white/10 px-4 py-4 sm:px-5">
              <h5 className="mb-2 text-sm font-semibold text-slate-200">Compliance</h5>
              {group.compliance.reason && <p className="mb-3 text-xs text-slate-400">Deliverability reason: {group.compliance.reason.replaceAll("_", " ")}</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[...group.compliance.rows, {requirement: "One-click unsubscribe", status: group.compliance.oneClick}, {requirement: "Honor unsubscribe", status: group.compliance.honor}].map((r,i) => <div key={`${r.requirement}-${i}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><span className="min-w-0 break-words text-slate-300">{r.requirement.replaceAll("_", " ")}</span><span className={`shrink-0 font-semibold ${tone(r.status)}`}>{r.status.replaceAll("_", " ")}</span></div>)}
              </div>
            </div>}
            {selectedMetrics.includes("feedback") && <div className="border-t border-white/10 px-4 py-3 text-xs sm:px-5"><strong className="mr-2 text-slate-200">Feedback Loop:</strong>{group.feedback ? (group.feedback.ids.length ? group.feedback.ids.map((id,i) => <span key={`${id.id}-${i}`} className="mr-2 inline-block break-all text-indigo-300">{id.date}: {id.id}</span>) : <span className="text-slate-400">No data</span>) : <span className="text-slate-400">N/A</span>}</div>}
            {group.problems.length > 0 && <div className="border-t border-rose-400/20 px-4 py-3 sm:px-5"><strong className="text-xs text-rose-300">Request issues</strong>{group.problems.map((msg,i) => <p key={i} className="mt-1 break-words text-xs text-rose-300">{msg}</p>)}</div>}
          </article>
        );
      })}
    </section>
  );
}
