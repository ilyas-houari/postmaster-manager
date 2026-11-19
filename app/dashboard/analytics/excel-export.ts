"use client";
import type { ExportRow, ComplianceExport, FeedbackExport } from "./export-utils";

// Loaded only when Excel XLSX is clicked, not during normal analytics rendering.
export async function downloadWorkbook(
  rows: ExportRow[], failures: string[], selected: string[], includeZeroErrors: boolean,
  compliance: ComplianceExport[], feedback: FeedbackExport[]
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Postmaster Manager";
  wb.created = new Date();

  function safe(v: unknown): string {
    const raw = String(v ?? "N/A");
    return /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  }
  function sheet(name: string, head: string[], data: (string | number)[][]) {
    const ws = wb.addWorksheet(name);
    ws.addRow(head);
    for (const item of data) ws.addRow(item.map(v => safe(v)));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF253247" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: head.length } };
    head.forEach((h, i) => { ws.getColumn(i + 1).width = Math.min(44, Math.max(14, h.length + 4)); });
    return ws;
  }
  const metricGroups: Record<string, string[]> = {
    spam: ["spam"], auth: ["spf", "dkim", "dmarc"],
    tls: ["tls_inbound", "tls_outbound"],
    tls_count: ["count_tls_inbound", "count_tls_outbound"],
  };
  const metrics = selected.flatMap(s => metricGroups[s] || []);
  const perDay = new Map<string, { domain: string; date: string; values: Record<string, string> }>();
  const errors: string[][] = [];
  for (const r of rows) {
    const key = JSON.stringify([r.domain, r.date]);
    if (!perDay.has(key)) perDay.set(key, { domain: r.domain, date: r.date, values: {} });
    if (r.metric.startsWith("error_")) {
      if (includeZeroErrors || Number.parseFloat(r.value) > 0) {
        errors.push([r.domain, r.date, r.metric.replace(/^error_/, ""), r.value]);
      }
    } else {
      perDay.get(key)!.values[r.metric] = r.value;
    }
  }
  sheet("Summary", ["Domain", "Date", ...metrics],
    [...perDay.values()].sort((a,b) => a.domain.localeCompare(b.domain) || a.date.localeCompare(b.date))
      .map(d => [d.domain, d.date, ...metrics.map(m => d.values[m] ?? "N/A")]));
  if (selected.includes("compliance")) {
    const allRequirements = [...new Set(compliance.flatMap(c => c.rows.map(x => x.requirement)))].sort();
    sheet("Compliance", ["Domain", ...allRequirements, "One-Click", "Honor Unsubscribe", "Deliverability", "Reason"],
      compliance.map(c => [c.domain, ...allRequirements.map(req => c.rows.find(x => x.requirement === req)?.status ?? "N/A"),
        c.oneClick, c.honor, c.deliverability, c.reason]));
  }
  if (selected.includes("delivery")) sheet("Delivery Errors", ["Domain", "Date", "Error", "Rate"], errors);
  if (selected.includes("feedback")) sheet("Feedback", ["Domain", "Date", "Feedback ID", "Status"],
    feedback.flatMap(f => f.ids.length ? f.ids.map(x => [f.domain, x.date, x.id, "DATA_AVAILABLE"])
      : [[f.domain, "N/A", "N/A", "NO_DATA"]]));
  sheet("Failures", ["Domain", "Error"], failures.map(f => {
    const i = f.indexOf(":"); return [i >= 0 ? f.slice(0, i) : "N/A", i >= 0 ? f.slice(i + 1).trim() : f];
  }));
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "postmaster-report.xlsx";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
