"use client";

import { useMemo, useState } from "react";

type Row = {
  domain: string;
  date: string;
  metric: string;
  value: string;
};

type Compliance = {
  domain: string;
  rows: { requirement: string; status: string }[];
  oneClick: string;
  honor: string;
  deliverability: string;
  reason: string;
};

type Feedback = {
  domain: string;
  ids: { date: string; id: string }[];
};

type DomainInfo = {
  domain: string;
  latest: string;
  metrics: Record<string, string>;
  activeErrors: Row[];
  compliance?: Compliance;
  feedback?: Feedback;
  failed: boolean;
};

export default function DomainsOverview({
  rows, complianceResults, feedbackResults, failures, selectedMetrics,
}: {
  rows: Row[];
  complianceResults: Compliance[];
  feedbackResults: Feedback[];
  failures: string[];
  selectedMetrics: string[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("attention");
  const [spamFilter, setSpamFilter] = useState("all");
  const [errorFilter, setErrorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const domains = useMemo(() => {
    const map = new Map<string, DomainInfo>();

    function get(domain: string) {
      if (!map.has(domain)) {
        map.set(domain, {
          domain, latest: "", metrics: {},
          activeErrors: [], failed: false,
        });
      }
      return map.get(domain)!;
    }

    for (const r of rows) {
      const d = get(r.domain);

      if (r.metric.startsWith("error_")) {
        if (Number.parseFloat(r.value) > 0) {
          d.activeErrors.push(r);
        }
      } else if (r.date > d.latest) {
        d.latest = r.date;
        d.metrics = { [r.metric]: r.value };
      } else if (r.date === d.latest) {
        d.metrics[r.metric] = r.value;
      }
    }

    for (const c of complianceResults) {
      get(c.domain).compliance = c;
    }

    for (const f of feedbackResults) {
      get(f.domain).feedback = f;
    }

    for (const failure of failures) {
      const domain = failure.split(":")[0].trim();
      if (domain) get(domain).failed = true;
    }

    return [...map.values()];
  }, [rows, complianceResults, feedbackResults, failures]);

  function status(d: DomainInfo) {
    if (d.compliance?.deliverability) {
      return d.compliance.deliverability;
    }
    return d.failed ? "FAILED" : "NO_STATUS";
  }

  const visible = domains
    .filter(d => d.domain.toLowerCase().includes(search.toLowerCase()))
    .filter(d => {
      if (filter === "attention") {
        return status(d) === "NEEDS_WORK" ||
          status(d) === "FAILED" || d.activeErrors.length > 0;
      }
      if (filter === "healthy") {
        return status(d) === "COMPLIANT" &&
          d.activeErrors.length === 0;
      }
      if (filter === "no_data") {
        return status(d) === "NO_STATUS";
      }
      return true;
    })
    .filter(d => {
      if (!selectedMetrics.includes("spam") || spamFilter === "all") return true;
      const v = Number.parseFloat(d.metrics.spam ?? "");
      if (!Number.isFinite(v)) return false;
      return spamFilter === "gte5" ? v >= 5 : spamFilter === "gte10" ? v >= 10 : v < 5;
    })
    .filter(d => {
      if (!selectedMetrics.includes("delivery") || errorFilter === "all") return true;
      return errorFilter === "active" ? d.activeErrors.length > 0 : d.activeErrors.length === 0;
    })
    .sort((a, b) => {
      if (sort === "spam") {
        return (Number.parseFloat(b.metrics.spam || "") || 0) - (Number.parseFloat(a.metrics.spam || "") || 0) || a.domain.localeCompare(b.domain);
      }
      if (sort === "errors") {
        return b.activeErrors.length - a.activeErrors.length ||
          a.domain.localeCompare(b.domain);
      }
      if (sort === "attention") {
        const score = (d: DomainInfo) =>
          (status(d) === "NEEDS_WORK" || status(d) === "FAILED" ? 1000 : 0) +
          d.activeErrors.length;
        return score(b) - score(a) ||
          a.domain.localeCompare(b.domain);
      }
      return a.domain.localeCompare(b.domain);
    });

  const totalPages = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, totalPages);
  const shown = visible.slice((currentPage - 1) * 25, currentPage * 25);
  const current = domains.find(d => d.domain === selected);

  const attention = domains.filter(d =>
    status(d) === "NEEDS_WORK" ||
    status(d) === "FAILED" || d.activeErrors.length > 0
  ).length;
  const healthy = domains.filter(d =>
    status(d) === "COMPLIANT" && d.activeErrors.length === 0
  ).length;

  function value(d: DomainInfo, key: string) {
    return d.metrics[key] ?? "N/A";
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Domains", domains.length],
          ["Need Attention", attention],
          ["Healthy", healthy],
          ["Active Error Records", domains.reduce(
            (sum, d) => sum + d.activeErrors.length, 0
          )],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-[#101b2a] p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{count}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search domain..."
          className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm"
        >
          <option value="all">All Domains</option>
          <option value="attention">Need Attention</option>
          <option value="healthy">Healthy</option>
          <option value="no_data">No Status</option>
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm"
        >
          <option value="attention">Attention First</option>
          <option value="domain">Domain A-Z</option>
          <option value="errors">Most Errors</option>
          {selectedMetrics.includes("spam") && <option value="spam">Highest Spam Rate</option>}
        </select>
        {selectedMetrics.includes("spam") && <select aria-label="Spam rate filter"
          value={spamFilter} onChange={e => {setSpamFilter(e.target.value); setPage(1);}}
          className="rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm">
          <option value="all">Any Spam Rate</option>
          <option value="lt5">Spam below 5%</option>
          <option value="gte5">Spam 5%+</option>
          <option value="gte10">Spam 10%+</option>
        </select>}
        {selectedMetrics.includes("delivery") && <select aria-label="Delivery error filter"
          value={errorFilter} onChange={e => {setErrorFilter(e.target.value); setPage(1);}}
          className="rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm">
          <option value="all">All Error Levels</option>
          <option value="active">Active Errors</option>
          <option value="clear">No Active Errors</option>
        </select>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[360px] text-left text-xs sm:text-sm">
          <thead className="bg-[#253247] text-slate-300">
            <tr>
              <th className="p-3">Domain</th>
              {selectedMetrics.includes("compliance") && (
                <th className="p-3">Deliverability</th>
              )}
              {[
                { group: "spam", key: "spam", label: "Spam" },
                { group: "auth", key: "spf", label: "SPF" },
                { group: "auth", key: "dkim", label: "DKIM" },
                { group: "auth", key: "dmarc", label: "DMARC" },
                { group: "tls", key: "tls_inbound", label: "TLS Inbound" },
                { group: "tls", key: "tls_outbound", label: "TLS Outbound" },
                { group: "tls_count", key: "count_tls_inbound", label: "TLS In Count" },
                { group: "tls_count", key: "count_tls_outbound", label: "TLS Out Count" },
              ].filter(x => selectedMetrics.includes(x.group)).map(x => (
                <th key={x.key} className="whitespace-nowrap p-3">
                  {x.label}
                </th>
              ))}
              {selectedMetrics.includes("delivery") && (
                <th className="p-3">Active Errors</th>
              )}
              {selectedMetrics.includes("feedback") && (
                <th className="p-3">Feedback IDs</th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map(d => (
              <tr
                key={d.domain}
                className="border-t border-white/5 hover:bg-white/5"
              >
                <td className="p-3">
                  <button
                    onClick={() => setSelected(
                      selected === d.domain ? null : d.domain
                    )}
                    className="font-medium text-indigo-300 hover:underline"
                  >
                    {d.domain}
                  </button>
                </td>
                {selectedMetrics.includes("compliance") && (
                  <td className="whitespace-nowrap p-3">
                    <span className={
                      status(d) === "COMPLIANT"
                        ? "text-emerald-400"
                        : status(d) === "NEEDS_WORK" || status(d) === "FAILED"
                          ? "text-amber-300"
                          : "text-slate-400"
                    }>
                      {status(d).replace(/_/g, " ")}
                    </span>
                  </td>
                )}

                {[
                  { group: "spam", key: "spam" },
                  { group: "auth", key: "spf" },
                  { group: "auth", key: "dkim" },
                  { group: "auth", key: "dmarc" },
                  { group: "tls", key: "tls_inbound" },
                  { group: "tls", key: "tls_outbound" },
                  { group: "tls_count", key: "count_tls_inbound" },
                  { group: "tls_count", key: "count_tls_outbound" },
                ].filter(x => selectedMetrics.includes(x.group)).map(x => (
                  <td key={x.key} className="p-3 text-slate-300">
                    {value(d, x.key)}
                  </td>
                ))}

                {selectedMetrics.includes("delivery") && (
                  <td className={
                    "p-3 font-medium " +
                    (d.activeErrors.length ? "text-amber-300" : "text-slate-400")
                  }>
                    {d.activeErrors.length}
                  </td>
                )}

                {selectedMetrics.includes("feedback") && (
                  <td className="p-3 text-slate-300">
                    {d.feedback ? d.feedback.ids.length || "No data" : "N/A"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <p className="p-6 text-center text-sm text-slate-400">
            No matching domains.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{visible.length} matching domain(s) - 25 per page</span>
        <div className="flex items-center gap-3">
          <button
            disabled={currentPage <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="disabled:opacity-30"
          >Previous</button>
          <span>{currentPage} / {totalPages}</span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="disabled:opacity-30"
          >Next</button>
        </div>
      </div>

      {current && (
        <div className="rounded-xl border border-indigo-500/30 bg-[#101b2a] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">{current.domain}</h3>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-slate-400 hover:text-white"
            >Close</button>
          </div>
          <p className="mb-3 text-xs text-slate-400">
            Latest available statistics: {current.latest || "N/A"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...(selectedMetrics.includes("spam") ? [["Spam Rate", value(current, "spam")]] : []),
              ...(selectedMetrics.includes("auth") ? [
                ["SPF", value(current, "spf")], ["DKIM", value(current, "dkim")],
                ["DMARC", value(current, "dmarc")],
              ] : []),
              ...(selectedMetrics.includes("tls") ? [
                ["TLS Inbound", value(current, "tls_inbound")],
                ["TLS Outbound", value(current, "tls_outbound")],
              ] : []),
              ...(selectedMetrics.includes("tls_count") ? [
                ["TLS In Count", value(current, "count_tls_inbound")],
                ["TLS Out Count", value(current, "count_tls_outbound")],
              ] : []),
              ...(selectedMetrics.includes("feedback") ? [
                ["Feedback IDs", current.feedback?.ids.length ?? "N/A"],
              ] : []),
              ...(selectedMetrics.includes("compliance") ? [
                ["Deliverability", status(current).replace(/_/g, " ")],
                ["Reason", current.compliance?.reason.replace(/_/g, " ") || "N/A"],
              ] : []),
            ].map(([label, result]) => (
              <div key={label} className="rounded-lg border border-white/10 p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 break-words text-sm font-medium">{result}</p>
              </div>
            ))}
          </div>
          {current.activeErrors.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-semibold text-amber-300">
                Active Delivery Errors
              </h4>
              {current.activeErrors.slice(0, 20).map((e, i) => (
                <div key={i} className="flex flex-wrap justify-between gap-2 border-t border-white/10 py-2 text-xs">
                  <span>{e.date} - {e.metric.replace(/_/g, " ")}</span>
                  <span className="text-amber-300">{e.value}</span>
                </div>
              ))}
              {current.activeErrors.length > 20 && (
                <p className="text-xs text-slate-400">
                  Open Advanced Details to view all records.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
