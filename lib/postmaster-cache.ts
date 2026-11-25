export async function readPostmasterCache(
  domain: string,
  days: number,
  token: string,
  selectedMetrics: string[]
): Promise<unknown[] | null> {
  const base = process.env.POSTMASTER_API_URL;
  const key = process.env.POSTMASTER_API_KEY;

  if (!base || !key) return null;

  // Verify Google's permission before returning cached data.
  const permission = await fetch(
    `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }
  );

  if (permission.status === 401 ||
      permission.status === 403 ||
      permission.status === 404) {
    throw new Error("DOMAIN_ACCESS_DENIED");
  }

  if (!permission.ok) return null;

  const response = await fetch(
    `${base.replace(/\/$/, "")}/stats/${encodeURIComponent(domain)}?days=${days}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) return null;

  const result = await response.json();
  if (!Array.isArray(result.stats) || !result.stats.length) return null;

  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const earliest = new Date(yesterday);
  earliest.setUTCDate(earliest.getUTCDate() - days + 1);

  const records: unknown[] = [];

  for (const row of result.stats) {
    if (!row.date || !row.metrics) continue;

    const parsed = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) continue;
    if (parsed < earliest || parsed > yesterday) continue;

    const [year, month, day] = row.date.split("-").map(Number);

    for (const [metric, value] of Object.entries(row.metrics)) {
      if (!selectedMetrics.includes(metric)) continue;

      records.push({
        name: `domains/${domain}/domainStats/${metric}.${row.date.replace(/-/g, "")}`,
        metric,
        date: { year, month, day },
        value,
      });
    }
  }

  return records.length ? records : null;
}
