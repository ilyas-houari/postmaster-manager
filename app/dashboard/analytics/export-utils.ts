export type ExportRow = {
  domain: string;
  date: string;
  metric: string;
  value: string;
};

export type ComplianceExport = {
  domain: string;
  rows: { requirement: string; status: string }[];
  oneClick: string;
  honor: string;
  deliverability: string;
  reason: string;
};

const complianceColumns = [
  ["SPF_AND_DKIM", "SPF & DKIM"],
  ["DMARC_ALIGNMENT", "DMARC Alignment"],
  ["DMARC_POLICY", "DMARC Policy"],
  ["ENCRYPTION", "Encryption"],
  ["USER_REPORTED_SPAM_RATE", "User-Reported Spam Rate"],
  ["DNS_RECORDS", "DNS Records"],
];

export function downloadComplianceCSV(items: ComplianceExport[]) {
  const header = [
    "Domain",
    ...complianceColumns.map(x => x[1]),
    "One-Click Unsubscribe",
    "Honor Unsubscribe",
    "Deliverability Status",
    "Deliverability Reason",
  ];

  const lines = [...items]
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .map(item => [
      item.domain,
      ...complianceColumns.map(([key]) =>
        item.rows.find(r => r.requirement === key)?.status ?? "N/A"
      ),
      item.oneClick || "N/A",
      item.honor || "N/A",
      item.deliverability || "N/A",
      item.reason || "N/A",
    ]);

  download(
    "postmaster-compliance.csv",
    csv([header, ...lines]),
    "text/csv;charset=utf-8"
  );
}
const metricGroups: Record<string, string[]> = {
  spam: ["spam"],
  auth: ["spf", "dkim", "dmarc"],
  tls: ["tls_inbound", "tls_outbound"],
  tls_count: ["count_tls_inbound", "count_tls_outbound"],
};

const labels: Record<string, string> = {
  spam: "Spam Rate",
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  tls_inbound: "TLS Inbound",
  tls_outbound: "TLS Outbound",
  count_tls_inbound: "TLS Inbound Count",
  count_tls_outbound: "TLS Outbound Count",
};

function csvCell(value: unknown) {
  const s = String(value ?? "N/A");
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function csv(data: string[][]) {
  return "\uFEFF" +
    data.map(row => row.map(csvCell).join(",")).join("\r\n");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type FeedbackExport = {
  domain: string;
  ids: { date: string; id: string }[];
};

export function downloadFeedbackCSV(items: FeedbackExport[]) {
  const lines = [...items]
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .flatMap(item =>
      item.ids.length
        ? item.ids.map(x => [item.domain, x.date, "DATA_AVAILABLE", x.id])
        : [[item.domain, "N/A", "NO_DATA", "N/A"]]
    );

  download(
    "postmaster-feedback.csv",
    csv([["Domain", "Date", "Status", "Feedback ID"], ...lines]),
    "text/csv;charset=utf-8"
  );
}
export function downloadReport(
  rows: ExportRow[],
  failures: string[],
  selected: string[],
  format: "csv" | "errors" | "json", includeZeroErrors = true, complianceResults: ComplianceExport[] = [], feedbackResults: FeedbackExport[] = []
) {
  const columns = Object.entries(metricGroups)
    .filter(([group]) => selected.includes(group))
    .flatMap(([, metrics]) => metrics);

  const groups = new Map<string, {
    domain: string;
    date: string;
    metrics: Record<string, string>;
    errors: { type: string; reason: string; rate: string }[];
  }>();

  for (const row of rows) {
    const key = JSON.stringify([row.domain, row.date]);

    if (!groups.has(key)) {
      groups.set(key, {
        domain: row.domain,
        date: row.date,
        metrics: {},
        errors: [],
      });
    }

    const item = groups.get(key)!;

    if (row.metric.startsWith("error_")) {
      const match = row.metric.match(/^error_(reject|temp_fail)_(.*)$/);
      item.errors.push({
        type: match?.[1] || "other",
        reason: match?.[2] || row.metric,
        rate: row.value,
      });
    } else {
      item.metrics[row.metric] = row.value;
    }
  }

  const data = [...groups.values()].sort(
    (a, b) => a.domain.localeCompare(b.domain) ||
      a.date.localeCompare(b.date)
  );

  if (format === "csv") {
    const header = [
      "Domain", "Date", "Status",
      ...columns.map(c => labels[c] || c),
    ];

    const lines = data.map(d => [
      d.domain, d.date, "OK",
      ...columns.map(c => d.metrics[c] ?? "N/A"),
    ]);

    for (const failure of failures) {
      lines.push([
        failure.split(":")[0],
        "N/A",
        "FAILED",
        ...columns.map(() => "N/A"),
      ]);
    }

    download(
      "postmaster-summary.csv",
      csv([header, ...lines]),
      "text/csv;charset=utf-8"
    );
    return;
  }

  if (format === "errors") {
    const lines = data.flatMap(d =>
      d.errors.filter(e => includeZeroErrors || Number.parseFloat(e.rate) > 0).map(e => [
        d.domain,
        d.date,
        e.type,
        e.reason.replace(/_/g, " "),
        e.rate,
      ])
    );

    download(
      "postmaster-delivery-errors.csv",
      csv([
        ["Domain", "Date", "Error Type", "Reason", "Rate"],
        ...lines,
      ]),
      "text/csv;charset=utf-8"
    );
    return;
  }

  const byDomain: Record<string, {
    dates: Record<string, {
      metrics: Record<string, string>;
      deliveryErrors: {
        type: string;
        reason: string;
        rate: string;
      }[];
    }>;
  }> = {};

  for (const d of data) {
    if (!byDomain[d.domain]) {
      byDomain[d.domain] = { dates: {} };
    }

    byDomain[d.domain].dates[d.date] = {
      metrics: d.metrics,
      deliveryErrors: d.errors,
    };
  }

  download(
    "postmaster-report.json",
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      selectedCategories: selected,
      domains: byDomain,
      feedbackLoop: Object.fromEntries(feedbackResults.map(x => [
        x.domain,
        {
          status: x.ids.length ? "DATA_AVAILABLE" : "NO_DATA",
          records: x.ids,
        },
      ])),
      compliance: Object.fromEntries(complianceResults.map(x => [x.domain, x])),
      failures,
    }, null, 2),
    "application/json"
  );
}
