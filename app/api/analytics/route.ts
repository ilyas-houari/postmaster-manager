import { readPostmasterCache } from "@/lib/postmaster-cache";
import { NextRequest, NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/access";
import { getGoogleToken } from "@/lib/google-token";



const errors = {
  reject: [
    "bad_attachment",
    "bad_or_missing_ptr_record",
    "ip_in_rbls",
    "low_domain_reputation",
    "low_ip_reputation",
    "spammy_content",
    "stamp_policy_error",
    "other",
  ],
  temp_fail: ["anomalous_traffic_pattern", "other"],
};

const allMetrics = [
  { name: "spam", baseMetric: { standardMetric: "SPAM_RATE" } },
  ...["inbound", "outbound"].map(direction => ({
    name: `count_tls_${direction}`,
    baseMetric: { standardMetric: "TLS_ENCRYPTION_MESSAGE_COUNT" },
    filter: `traffic_direction = "${direction}"`,
  })),
  { name: "feedback_loop_id", baseMetric: { standardMetric: "FEEDBACK_LOOP_ID" } },
  ...["inbound", "outbound"].flatMap(direction => [
    { name: `tls_${direction}`, baseMetric: { standardMetric: "TLS_ENCRYPTION_RATE" }, filter: `traffic_direction = "${direction}"` },
  ]),
  ...["spf", "dkim", "dmarc"].map((type) => ({
    name: type,
    baseMetric: { standardMetric: "AUTH_SUCCESS_RATE" },
    filter: `auth_type = "${type}"`,
  })),
  ...Object.entries(errors).flatMap(([type, reasons]) =>
    reasons.map((reason) => ({
      name: `error_${type}_${reason}`,
      baseMetric: { standardMetric: "DELIVERY_ERROR_RATE" },
      filter: `error_type = "${type}" AND error_reason = "${reason}"`,
    }))
  ),
];

function apiDate(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export async function POST(req: NextRequest) {
  if (!(await hasAppAccess())) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const input: unknown = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const body = input as Record<string, unknown>;
    const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
    const days = Number(body.days ?? 7);

    if (
      domain.length > 253 ||
      !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
      ![7, 30, 90].includes(days)
    ) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const selected: string[] = Array.isArray(body.categories)
      ? (body.categories as unknown[]).filter((x: unknown): x is string => typeof x === "string")
      : ["auth", "delivery"];

    const metrics = allMetrics.filter(item =>
      (item.name === "spam" && selected.includes("spam")) ||
      (item.name.startsWith("count_tls_") && selected.includes("tls_count")) ||
      (item.name === "feedback_loop_id" && selected.includes("feedback")) ||
      (["spf", "dkim", "dmarc"].includes(item.name) && selected.includes("auth")) ||
      ((item.name.startsWith("tls_")) && selected.includes("tls")) ||
      (item.name.startsWith("error_") && selected.includes("delivery"))
    );

    if (!metrics.length) {
      return NextResponse.json({ error: "Select at least one supported metric." }, { status: 400 });
    }

    const token = await getGoogleToken(req);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);

    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);

    // Read PostgreSQL cache first, retain the original Google API fallback.
    try {
      const cached = await readPostmasterCache(
        domain,
        days,
        token,
        metrics.map(m => m.name)
      );

      if (cached) {
        return NextResponse.json({
          domain,
          days,
          stats: cached,
          source: "postgresql",
        });
      }
    } catch (error) {
      if (error instanceof Error &&
          error.message === "DOMAIN_ACCESS_DENIED") {
        return NextResponse.json(
          { error: "Domain access denied" },
          { status: 403 }
        );
      }

      console.error("Cache unavailable, using Google API fallback");
    }

    const results: unknown[] = [];
    let pageToken = "";

    for (let page = 0; page < 30; page++) {
      const response = await fetch(
        `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}/domainStats:query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            metricDefinitions: metrics,
            timeQuery: {
              dateRanges: {
                dateRanges: [{
                  start: apiDate(start),
                  end: apiDate(end),
                }],
              },
            },
            aggregationGranularity: "DAILY",
            pageSize: 200,
            ...(pageToken ? { pageToken } : {}),
          }),
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          { error: data.error?.message || "Google API failed" },
          { status: response.status }
        );
      }

      results.push(...(data.domainStats || []));
      pageToken = data.nextPageToken || "";

      if (!pageToken) {
        return NextResponse.json({
          domain,
          days,
          stats: results,
        });
      }
    }

    return NextResponse.json(
      { error: "Too many result pages; narrow the date range." },
      { status: 422 }
    );
  } catch {
    return NextResponse.json(
      { error: "Analytics request failed. Please try again." },
      { status: 500 }
    );
  }
}
