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
    const input = await req.json();
    const domain = String(input.domain || "").trim().toLowerCase();
    const days = Number(input.days || 7);

    if (
      domain.length > 253 ||
      !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain) ||
      ![7, 30, 90].includes(days)
    ) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const selected: string[] = Array.isArray(input.categories)
      ? input.categories.filter((x: unknown): x is string => typeof x === "string")
      : ["auth", "delivery"];

    if (selected.some(x => ["compliance"].includes(x))) {
      return NextResponse.json(
        { error: "Compliance and Feedback Loop integration is coming next." },
        { status: 400 }
      );
    }

    const metrics = allMetrics.filter(item =>
      (item.name === "spam" && selected.includes("spam")) ||
      (item.name === "feedback_loop_id" && selected.includes("feedback")) ||
      (["spf", "dkim", "dmarc"].includes(item.name) && selected.includes("auth")) ||
      (item.name.startsWith("tls_") && selected.includes("tls")) ||
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    );
  }
}
