"use client";

import { useEffect, useRef, useState } from "react";
import DomainsOverview from "./domains-overview";
import { createAnalysisRunner, fetchWithRetry } from "./analysis-runner";
import { downloadReport, downloadComplianceCSV, downloadFeedbackCSV } from "./export-utils";

type Stat = {
  metric?: string;
  date?: { year: number; month: number; day: number };
  value?: {
    doubleValue?: number;
    floatValue?: number;
    intValue?: string;
  };
};

type Row = {
  domain: string;
  date: string;
  metric: string;
  value: string;
};

type ComplianceCache = {
  domain: string;
  rows: { requirement: string; status: string }[];
  oneClick: string;
  honor: string;
  deliverability: string;
  reason: string;
};

type FeedbackCache = {
  domain: string;
  ids: { date: string; id: string }[];
};

// Memory lasts only while the page is open.
// A full browser refresh clears this cache.
let analyticsViewCache = {
  input: "",
  days: 7,
  selectedMetrics: ["spam", "auth", "delivery"] as string[],
  includeZeroErrors: true,
  rows: [] as Row[],
  failures: [] as string[],
  complianceResults: [] as ComplianceCache[],
  feedbackResults: [] as FeedbackCache[],
  detailFilters: {} as Record<string, string>,
  activeDetailFilter: "",
  progress: "",
};
function formatValue(stat: Stat) {
  const v = stat.value;
  if (!v) return "N/A";

  const num = v.doubleValue ?? v.floatValue;
  if (typeof num === "number") {
    return (num * 100).toFixed(2) + "%";
  }

  if (v.intValue !== undefined) return v.intValue;
  return "N/A";
}

function csvEscape(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}

export default function AnalyticsClient() {
  const [input, setInput] = useState(analyticsViewCache.input);
  const [includeZeroErrors, setIncludeZeroErrors] = useState(analyticsViewCache.includeZeroErrors);
  const [detailFilters, setDetailFilters] = useState<Record<string, string>>(analyticsViewCache.detailFilters);
  const [activeDetailFilter, setActiveDetailFilter] = useState(analyticsViewCache.activeDetailFilter);

  function updateDetailFilter(key: string, value: string) {
    setDetailFilters(prev => ({ ...prev, [key]: value }));
  }
  const [errorDetails, setErrorDetails] = useState<{
    domain: string;
    date: string;
    errors: { name: string; value: string }[];
  } | null>(null);
  const categories = [
    { id: "compliance", label: "Compliance Status" },
    { id: "spam", label: "Spam Rate" },
    { id: "auth", label: "Authentication - SPF / DKIM / DMARC" },
    { id: "tls", label: "TLS Encryption Rate (%)" },
    { id: "tls_count", label: "TLS Encrypted Message Counts" },
    { id: "delivery", label: "Delivery Errors" },
    { id: "feedback", label: "Feedback Loop" },
  ];

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(analyticsViewCache.selectedMetrics);

  function toggleMetric(id: string) {
    setSelectedMetrics(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  }
  const [days, setDays] = useState(analyticsViewCache.days);
  const [rows, setRows] = useState<Row[]>(analyticsViewCache.rows);
  const [feedbackResults, setFeedbackResults] = useState<{
    domain: string;
    ids: { date: string; id: string }[];
  }[]>(analyticsViewCache.feedbackResults);
  const [complianceResults, setComplianceResults] = useState<{
    domain: string;
    rows: { requirement: string; status: string }[];
    oneClick: string;
    honor: string;
    deliverability: string;
    reason: string;
  }[]>(analyticsViewCache.complianceResults);
  const [failures, setFailures] = useState<string[]>(analyticsViewCache.failures);
  const [loading, setLoading] = useState(false);
  const runnerRef = useRef<{
    pause: () => void;
    resume: () => void;
    cancel: () => void;
  } | null>(null);

  const cancelledRef = useRef(false);
  const [runState, setRunState] = useState<
    "idle" | "running" | "paused" | "completed" | "cancelled"
  >("idle");

  const [runProgress, setRunProgress] = useState({
    completed: 0,
    total: 0,
    successful: 0,
    failed: 0,
  });

  const [progress, setProgress] = useState(analyticsViewCache.progress);

  useEffect(() => {
    analyticsViewCache = {
      input,
      days,
      selectedMetrics,
      includeZeroErrors,
      rows,
      failures,
      complianceResults,
      feedbackResults,
      detailFilters,
      activeDetailFilter,
      progress,
    };
  }, [
    input, days, selectedMetrics, includeZeroErrors,
    rows, failures, complianceResults, feedbackResults,
    detailFilters, activeDetailFilter, progress,
  ]);
  const domains = [...new Set(
    input.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean)
  )];

  async function analyze() {
    if (loading || !domains.length || !selectedMetrics.length) return;

    const requestedDomains = [...domains];
    const requestedMetrics = [...selectedMetrics];
    const requestedDays = days;

    cancelledRef.current = false;
    setRunState("running");
    setLoading(true);
    setRows([]);
    setFeedbackResults([]);
    setComplianceResults([]);
    setFailures([]);
    setErrorDetails(null);

    setRunProgress({
      completed: 0,
      total: requestedDomains.length,
      successful: 0,
      failed: 0,
    });

    setProgress(`0/${requestedDomains.length} completed`);

    type Outcome = {
      rows: Row[];
      feedback?: FeedbackCache;
      compliance?: ComplianceCache;
      issues: string[];
    };

    async function processDomain(
      domain: string,
      signal: AbortSignal
    ): Promise<Outcome> {
      const outcome: Outcome = { rows: [], issues: [] };
      let succeeded = false;

      if (requestedMetrics.some(x =>
        ["spam", "auth", "tls", "tls_count", "delivery", "feedback"].includes(x)
      )) {
        try {
          const response = await fetchWithRetry(
            "/api/analytics",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                domain,
                days: requestedDays,
                categories: requestedMetrics,
              }),
              signal,
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }

          succeeded = true;
          const stats = (data.stats || []) as Stat[];

          if (requestedMetrics.includes("feedback")) {
            const ids = stats
              .filter(s => s.metric === "feedback_loop_id")
              .map(s => ({
                date: s.date
                  ? `${s.date.year}-${String(s.date.month).padStart(2, "0")}-${String(s.date.day).padStart(2, "0")}`
                  : "N/A",
                id: (s.value as { stringValue?: string } | undefined)
                  ?.stringValue ?? "",
              }))
              .filter(s => s.id.length > 0);

            outcome.feedback = { domain, ids };
          }

          for (const stat of stats) {
            if (stat.metric === "feedback_loop_id") continue;

            const d = stat.date;

            outcome.rows.push({
              domain,
              date: d
                ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                : "N/A",
              metric: stat.metric || "Unknown",
              value: formatValue(stat),
            });
          }
        } catch (error) {
          if (signal.aborted) throw error;
          outcome.issues.push(
            "Statistics: " +
            (error instanceof Error ? error.message : "Failed")
          );
        }
      }

      if (requestedMetrics.includes("compliance")) {
        try {
          const response = await fetchWithRetry(
            `/api/analytics-compliance?domain=${encodeURIComponent(domain)}`,
            { signal }
          );

          const json = await response.json();

          if (!response.ok) {
            throw new Error(json.error || `HTTP ${response.status}`);
          }

          const info = json.compliance?.complianceData;

          if (!info) {
            throw new Error("Compliance data unavailable");
          }

          succeeded = true;

          outcome.compliance = {
            domain,
            rows: (info.rowData || []).map((r: {
              requirement: string;
              status?: { status?: string };
            }) => ({
              requirement: r.requirement,
              status: r.status?.status || "N/A",
            })),
            oneClick:
              info.oneClickUnsubscribeVerdict?.status?.status || "N/A",
            honor:
              info.honorUnsubscribeVerdict?.status?.status || "N/A",
            deliverability:
              info.deliverabilityStatusVerdict?.state?.status || "N/A",
            reason:
              info.deliverabilityStatusVerdict?.reason || "",
          };
        } catch (error) {
          if (signal.aborted) throw error;
          outcome.issues.push(
            "Compliance: " +
            (error instanceof Error ? error.message : "Failed")
          );
        }
      }

      if (!succeeded) {
        throw new Error(outcome.issues.join(" | ") || "Request failed");
      }

      return outcome;
    }

    const runner = createAnalysisRunner<Outcome>(
      requestedDomains,
      processDomain,
      result => {
        if (result.error) {
          setFailures(prev => [
            ...prev,
            `${result.item}: ${result.error}`,
          ]);
          return;
        }

        const data = result.data;
        if (!data) return;

        if (data.rows.length) {
          setRows(prev => [...prev, ...data.rows]);
        }

        if (data.feedback) {
          setFeedbackResults(prev => [...prev, data.feedback!]);
        }

        if (data.compliance) {
          setComplianceResults(prev => [...prev, data.compliance!]);
        }

        if (data.issues.length) {
          setFailures(prev => [
            ...prev,
            `${result.item}: ${data.issues.join(" | ")}`,
          ]);
        }
      },
      status => {
        setRunProgress(status);
        setProgress(
          `${status.completed}/${status.total} completed`
        );
      },
      3
    );

    runnerRef.current = runner;

    try {
      await runner.start();
      setRunState(cancelledRef.current ? "cancelled" : "completed");
      setProgress(cancelledRef.current ? "Cancelled" : "Completed");
    } finally {
      runnerRef.current = null;
      setLoading(false);
    }
  }

  function pauseAnalysis() {
    runnerRef.current?.pause();
    setRunState("paused");
  }

  function resumeAnalysis() {
    runnerRef.current?.resume();
    setRunState("running");
  }

  function cancelAnalysis() {
    cancelledRef.current = true;
    runnerRef.current?.cancel();
    setRunState("cancelled");
  }
  function exportFile(format: "csv" | "errors" | "json" | "compliance" | "feedback") {
    if (format === "compliance") {
      downloadComplianceCSV(complianceResults);
      return;
    }
    if (format === "feedback") {
      downloadFeedbackCSV(feedbackResults);
      return;
    }
    downloadReport(rows, failures, selectedMetrics, format, includeZeroErrors, complianceResults, feedbackResults);
  }

  return (
    <div className="p-4 text-slate-100 lg:p-6">
      <div className="w-full min-w-0 space-y-6">
        

        <section className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#182333] p-5">
            <h2 className="mb-3 font-semibold">Domains</h2>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"example.com\nexample.net\nexample.org"}
              className="h-52 w-full resize-y rounded-xl border border-white/10 bg-[#0e1725] p-4 font-mono text-sm outline-none focus:border-indigo-500"
            />
            <p className="mt-2 text-xs text-slate-400">
              {domains.length} domain(s) selected
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#182333] p-5">
            <h2 className="mb-4 font-semibold">Analysis Settings</h2>
            <label className="text-sm text-slate-400">Date range</label>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0e1725] p-3"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Select Data</p>
                <button type="button"
                  onClick={() => setSelectedMetrics(categories.map(x => x.id))}
                  className="text-xs text-indigo-300 hover:text-white">
                  Select All
                </button>
              </div>
              {categories.map(item => (
                <label key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-[#0e1725] px-3 py-2.5 text-xs">
                  <input type="checkbox"
                    checked={selectedMetrics.includes(item.id)}
                    onChange={() => toggleMetric(item.id)}
                    className="accent-indigo-500"
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <button
              disabled={loading || !domains.length || !selectedMetrics.length}
              onClick={analyze}
              className="mt-5 w-full rounded-xl bg-indigo-600 p-3 font-semibold hover:bg-indigo-500 disabled:opacity-40"
            >
              {loading ? "Analyzing..." : "Analyze Domains"}
            </button>
              {loading && (
                <div className="mt-4 space-y-3">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{
                        width: `${runProgress.total
                          ? Math.round(
                              runProgress.completed / runProgress.total * 100
                            )
                          : 0}%`,
                      }}
                    />
                  </div>

                  <p className="text-xs text-slate-300">
                    {runProgress.completed}/{runProgress.total} completed
                    {" | "}
                    {runProgress.successful} successful
                    {" | "}
                    {runProgress.failed} failed
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {runState === "running" ? (
                      <button
                        type="button"
                        onClick={pauseAnalysis}
                        className="rounded-lg border border-white/20 px-4 py-2 text-sm"
                      >
                        Pause
                      </button>
                    ) : runState === "paused" ? (
                      <button
                        type="button"
                        onClick={resumeAnalysis}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm"
                      >
                        Resume
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={cancelAnalysis}
                      className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm text-rose-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            <p className="mt-3 text-xs text-slate-400">{progress}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#182333] p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Results</h2>
              <p className="mt-1 text-xs text-slate-400">{rows.length} statistics retrieved</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
    <input
      type="checkbox"
      checked={includeZeroErrors}
      onChange={e => setIncludeZeroErrors(e.target.checked)}
      className="accent-indigo-500"
    />
    Include Zero Errors
  </label>
              <button
                disabled={!complianceResults.length}
                onClick={() => exportFile("compliance")}
                className="rounded-lg border border-emerald-500/30 px-4 py-2 text-sm text-emerald-300 disabled:opacity-40"
              >
                Compliance CSV
              </button>
                            <button
                disabled={!feedbackResults.length}
                onClick={() => exportFile("feedback")}
                className="rounded-lg border border-indigo-500/30 px-4 py-2 text-sm text-indigo-300 disabled:opacity-40"
              >
                Feedback CSV
              </button>
              <button disabled={!rows.length} onClick={() => exportFile("csv")}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-40">
                Summary CSV
              </button>
              <button disabled={!rows.some(r => r.metric.startsWith("error_"))} onClick={() => exportFile("errors")} className="rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-40">Errors CSV</button>
              <button disabled={!rows.length && !complianceResults.length && !feedbackResults.length} onClick={() => exportFile("json")}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm disabled:opacity-40">
                Export JSON
              </button>
            </div>
          </div>

                    <DomainsOverview
            rows={rows}
            complianceResults={complianceResults}
            feedbackResults={feedbackResults}
            failures={failures}
            selectedMetrics={selectedMetrics}
          />

          <details className="mt-5 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer font-medium text-indigo-300">
              Advanced Details - Daily Statistics / Compliance / Feedback
            </summary>
            <div className="mt-4 space-y-5">
          {(() => {
            const definitions: { key: string; label: string; group: string }[] = [
              { key: "spam", label: "Spam Rate", group: "spam" },
              { key: "spf", label: "SPF", group: "auth" },
              { key: "dkim", label: "DKIM", group: "auth" },
              { key: "dmarc", label: "DMARC", group: "auth" },
              { key: "tls_inbound", label: "TLS Inbound", group: "tls" },
              { key: "tls_outbound", label: "TLS Outbound", group: "tls" },
              { key: "count_tls_inbound", label: "TLS In Count", group: "tls_count" },
              { key: "count_tls_outbound", label: "TLS Out Count", group: "tls_count" },
            ];

            const columns = definitions.filter(x =>
              selectedMetrics.includes(x.group)
            );

            const grouped = new Map<string, {
              domain: string;
              date: string;
              metrics: Record<string, string>;
              errors: { name: string; value: string }[];
            }>();

            rows.forEach(r => {
              const key = JSON.stringify([r.domain, r.date]);

              if (!grouped.has(key)) {
                grouped.set(key, {
                  domain: r.domain,
                  date: r.date,
                  metrics: {},
                  errors: [],
                });
              }

              const entry = grouped.get(key)!;

              if (r.metric.startsWith("error_")) {
                entry.errors.push({
                  name: r.metric
                    .replace(/^error_/, "")
                    .replace(/_/g, " "),
                  value: r.value,
                });
              } else {
                entry.metrics[r.metric] = r.value;
              }
            });

            const data = Array.from(grouped.values()).sort(
              (a, b) =>
                a.domain.localeCompare(b.domain) ||
                b.date.localeCompare(a.date)
            );

            const percentageRanges = (key: string, value: string) => {
              const selected = (detailFilters[key] || "")
                .split(",")
                .filter(Boolean);

              if (!selected.length) return true;

              const number = Number.parseFloat(value);
              if (!Number.isFinite(number)) return false;

              return selected.some(range => {
                const [min, max] = range.split("-").map(Number);
                return number >= min &&
                  (number < max || (max === 100 && number <= 100));
              });
            };

            const toggleRange = (key: string, range: string) => {
              const current = (detailFilters[key] || "")
                .split(",").filter(Boolean);
              const next = current.includes(range)
                ? current.filter(x => x !== range)
                : [...current, range];
              updateDetailFilter(key, next.join(","));
            };

            const filteredData = data.filter(entry => {
              if (!entry.domain.toLowerCase().includes(
                (detailFilters.domain || "").trim().toLowerCase()
              )) return false;

              const mode = detailFilters.dateMode || "range";

              if (mode === "single") {
                if (detailFilters.dateSingle &&
                    entry.date !== detailFilters.dateSingle) return false;
              } else {
                if (detailFilters.dateFrom &&
                    entry.date < detailFilters.dateFrom) return false;
                if (detailFilters.dateTo &&
                    entry.date > detailFilters.dateTo) return false;
              }

              if (!columns.every(col =>
                percentageRanges(col.key, entry.metrics[col.key] ?? "N/A")
              )) return false;

              const errorFilter = detailFilters.errors || "all";
              const active = entry.errors.some(
                e => Number.parseFloat(e.value) > 0
              );

              if (errorFilter === "active" && !active) return false;
              if (errorFilter === "clear" && active) return false;

              return true;
            });
            return (
              <div className="max-h-[550px] overflow-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#253247] text-slate-300">
  <tr>
    {[
      { key: "domain", label: "Domain" },
      { key: "date", label: "Date" },
      ...columns,
      ...(selectedMetrics.includes("delivery")
        ? [{ key: "errors", label: "Delivery Errors" }]
        : []),
    ].map(col => (
      <th key={col.key} className="whitespace-nowrap p-3">
        <button
          type="button"
          onClick={() => setActiveDetailFilter(
            activeDetailFilter === col.key ? "" : col.key
          )}
          className="flex items-center gap-2 text-left hover:text-white"
        >
          {col.label}
          <span className={
            detailFilters[col.key] ||
            (col.key === "date" && (
              detailFilters.dateSingle ||
              detailFilters.dateFrom ||
              detailFilters.dateTo
            ))
              ? "text-indigo-300" : "text-slate-400"
          }>
            {activeDetailFilter === col.key ? "▲" : "▼"}
          </span>
        </button>
      </th>
    ))}
  </tr>

  {activeDetailFilter && (
    <tr className="border-t border-white/10 bg-[#1d2a3d]">
      <th
        colSpan={2 + columns.length +
          (selectedMetrics.includes("delivery") ? 1 : 0)}
        className="p-3 text-left font-normal"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-white">
            Filter: {activeDetailFilter.replace(/_/g, " ")}
          </span>

          {activeDetailFilter === "domain" && (
            <input
              value={detailFilters.domain || ""}
              onChange={e => updateDetailFilter("domain", e.target.value)}
              placeholder="Search domain..."
              className="rounded-lg border border-white/10 bg-[#101b2a] px-3 py-2 text-sm text-white"
            />
          )}

          {activeDetailFilter === "date" && (
            <>
              <select
                value={detailFilters.dateMode || "range"}
                onChange={e => updateDetailFilter("dateMode", e.target.value)}
                className="rounded-lg border border-white/10 bg-[#101b2a] p-2 text-sm"
              >
                <option value="single">Single Day</option>
                <option value="range">Date Range</option>
              </select>

              {(detailFilters.dateMode || "range") === "single" ? (
                <input
                  type="date"
                  value={detailFilters.dateSingle || ""}
                  onChange={e => updateDetailFilter("dateSingle", e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#101b2a] p-2 text-sm"
                />
              ) : (
                <>
                  <label className="text-xs">From</label>
                  <input
                    type="date"
                    value={detailFilters.dateFrom || ""}
                    onChange={e => updateDetailFilter("dateFrom", e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#101b2a] p-2 text-sm"
                  />
                  <label className="text-xs">To</label>
                  <input
                    type="date"
                    value={detailFilters.dateTo || ""}
                    onChange={e => updateDetailFilter("dateTo", e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#101b2a] p-2 text-sm"
                  />
                </>
              )}
            </>
          )}

          {columns.some(col => col.key === activeDetailFilter && col.group !== "tls_count") && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!detailFilters[activeDetailFilter]}
                  onChange={() => updateDetailFilter(activeDetailFilter, "")}
                  className="accent-indigo-500"
                />
                All
              </label>

              {(activeDetailFilter === "spam"
                ? ["0-5", "5-10", "10-20", "20-30", "30-50", "50-100"]
                : ["0-25", "25-50", "50-75", "75-100"]
              ).map(range => (
                <label
                  key={range}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={(detailFilters[activeDetailFilter] || "")
                      .split(",").includes(range)}
                    onChange={() => toggleRange(activeDetailFilter, range)}
                    className="accent-indigo-500"
                  />
                  {range}%
                </label>
              ))}
            </>
          )}

          {activeDetailFilter === "errors" && (
            <select
              value={detailFilters.errors || "all"}
              onChange={e => updateDetailFilter("errors", e.target.value)}
              className="rounded-lg border border-white/10 bg-[#101b2a] p-2 text-sm"
            >
              <option value="all">All Errors</option>
              <option value="active">Active Only</option>
              <option value="clear">No Active Errors</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              if (activeDetailFilter === "date") {
                ["dateSingle", "dateFrom", "dateTo"].forEach(
                  key => updateDetailFilter(key, "")
                );
              } else {
                updateDetailFilter(activeDetailFilter, "");
              }
            }}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => setActiveDetailFilter("")}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white"
          >
            Done
          </button>
        </div>
      </th>
    </tr>
  )}
</thead>
                  <tbody>
                    {filteredData.map((entry, index) => {
                      const active = entry.errors.filter(
                        e => Number.parseFloat(e.value) > 0
                      );

                      return (
                        <tr
                          key={JSON.stringify([entry.domain, entry.date])}
                          className={
                            "border-t border-white/5 hover:bg-white/5 " +
(index > 0 && filteredData[index - 1].domain !== entry.domain ? "border-t-[4px] !border-indigo-400/60 " : "") +
                            (index % 2 ? "bg-white/[0.02]" : "")
                          }
                        >
                          <td className="whitespace-nowrap p-3 font-medium text-white">
                            {entry.domain}
                          </td>
                          <td className="whitespace-nowrap p-3 text-slate-400">
                            {entry.date}
                          </td>
                          {columns.map(col => {
                            const value = entry.metrics[col.key];

                            return (
                              <td
                                key={col.key}
                                className={
                                  "whitespace-nowrap p-3 " +
                                  (value === undefined
                                    ? "text-slate-500"
                                    : "text-indigo-300")
                                }
                              >
                                {value ?? "N/A"}
                              </td>
                            );
                          })}
                          {selectedMetrics.includes("delivery") && (
  <td className="whitespace-nowrap p-3">
    {entry.errors.length ? (
      <button
        type="button"
        onClick={() => setErrorDetails({
          domain: entry.domain,
          date: entry.date,
          errors: entry.errors,
        })}
        className="rounded-lg border border-indigo-500/30 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/10"
      >
        {active.length > 0
          ? `${active.length} active - View Errors`
          : "0 active - View Errors"}
      </button>
    ) : (
      <span className="text-slate-500">N/A</span>
    )}
  </td>
)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!data.length && (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No results yet. Enter domains and click Analyze.
                  </p>
                )}
              </div>
            );
          })()}
          {errorDetails && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setErrorDetails(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Delivery Error Details"
                className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#182333] shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between border-b border-white/10 p-5">
                  <div>
                    <h3 className="text-lg font-semibold">Delivery Errors</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {errorDetails.domain} - {errorDetails.date}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorDetails(null)}
                    className="rounded-lg border border-white/10 px-3 py-1 text-sm hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-5">
                  <div className="mb-3 grid grid-cols-[1fr_auto] gap-4 text-xs font-semibold text-slate-400">
                    <span>Error Type / Reason</span>
                    <span>Rate</span>
                  </div>

                  {errorDetails.errors
                    .filter(e =>
                      includeZeroErrors ||
                      Number.parseFloat(e.value) > 0
                    )
                    .map((e, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[1fr_auto] gap-4 border-t border-white/10 py-3 text-sm"
                      >
                        <span className="break-words text-slate-200">{e.name}</span>
                        <span className={
                          Number.parseFloat(e.value) > 0
                            ? "font-semibold text-amber-300"
                            : "text-slate-400"
                        }>
                          {e.value}
                        </span>
                      </div>
                    ))}

                  {!includeZeroErrors &&
                    !errorDetails.errors.some(
                      e => Number.parseFloat(e.value) > 0
                    ) && (
                      <p className="py-8 text-center text-sm text-slate-400">
                        No active delivery errors.
                      </p>
                    )}
                </div>
              </div>
            </div>
          )}
          {selectedMetrics.includes("compliance") && (
            <div className="mt-6 space-y-4">
              <h3 className="text-base font-semibold">
                Compliance Status - Current
              </h3>
              {complianceResults.length === 0 && (
                <p className="text-sm text-slate-400">
                  No compliance results yet.
                </p>
              )}
              {complianceResults.map(item => (
                <div
                  key={item.domain}
                  className="rounded-xl border border-white/10 bg-[#101b2a] p-4"
                >
                  <h4 className="mb-4 font-medium text-white">
                    {item.domain}
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ...item.rows.map(r => ({
                        label: r.requirement.replace(/_/g, " "),
                        value: r.status,
                      })),
                      { label: "One-Click Unsubscribe", value: item.oneClick },
                      { label: "Honor Unsubscribe", value: item.honor },
                    ].map(r => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between gap-3 rounded-lg border border-white/5 p-3"
                      >
                        <span className="text-xs text-slate-300">
                          {r.label}
                        </span>
                        <span className={
                          "text-xs font-semibold " +
                          (r.value === "COMPLIANT"
                            ? "text-emerald-400"
                            : r.value === "N/A"
                              ? "text-slate-400"
                              : "text-amber-300")
                        }>
                          {r.value.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg border border-white/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">Deliverability Status</span>
                      <span className={
                        "text-sm font-semibold " +
                        (item.deliverability === "COMPLIANT"
                          ? "text-emerald-400"
                          : "text-amber-300")
                      }>
                        {item.deliverability.replace(/_/g, " ")}
                      </span>
                    </div>
                    {item.reason && (
                      <p className="mt-2 text-xs text-slate-400">
                        Reason: {item.reason.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedMetrics.includes("feedback") && (
            <div className="mt-6 space-y-3">
              <h3 className="text-base font-semibold">
                Feedback Loop
              </h3>

              {feedbackResults.map(item => (
                <div
                  key={item.domain}
                  className="rounded-xl border border-white/10 bg-[#101b2a] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium text-white">
                      {item.domain}
                    </span>
                    <span className={
                      item.ids.length
                        ? "text-xs text-emerald-300"
                        : "text-xs text-slate-400"
                    }>
                      {item.ids.length
                        ? `${item.ids.length} feedback records`
                        : "No data available"}
                    </span>
                  </div>

                  {item.ids.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {item.ids.map((entry, index) => (
                        <div
                          key={index}
                          className="flex flex-wrap justify-between gap-2 border-t border-white/10 pt-2 text-xs"
                        >
                          <span className="text-slate-400">
                            {entry.date}
                          </span>
                          <span className="break-all text-indigo-300">
                            {entry.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {!feedbackResults.length && !loading && (
                <p className="text-sm text-slate-400">
                  No successful Feedback Loop results yet.
                </p>
              )}
            </div>
          )}
            </div>
          </details>
          {failures.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <h3 className="mb-2 text-sm font-semibold text-rose-300">Errors</h3>
              {failures.map((x, i) => (
                <p key={i} className="text-xs text-rose-200">{x}</p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
