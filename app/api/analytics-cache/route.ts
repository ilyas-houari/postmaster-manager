import { NextRequest, NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/access";
import { getGoogleToken } from "@/lib/google-token";

export async function GET(req: NextRequest) {
  if (!(await hasAppAccess())) {
    return NextResponse.json(
      { error: "Access denied" },
      { status: 403 }
    );
  }

  const domain = req.nextUrl.searchParams.get("domain")
    ?.trim().toLowerCase();

  const days = Number(
    req.nextUrl.searchParams.get("days") || 7
  );

  if (
    !domain ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain) ||
    ![7, 30, 90].includes(days)
  ) {
    return NextResponse.json(
      { error: "Invalid parameters" },
      { status: 400 }
    );
  }

  try {
    const token = await getGoogleToken(req);

    // Verify Google account access to this domain
    const permission = await fetch(
      `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (permission.status === 401 || permission.status === 403 ||
        permission.status === 404) {
      return NextResponse.json(
        { error: "Domain access not verified" },
        { status: 403 }
      );
    }

    if (!permission.ok) {
      return NextResponse.json(
        { error: "Google permission check failed" },
        { status: 502 }
      );
    }

    const apiUrl = process.env.POSTMASTER_API_URL;
    const apiKey = process.env.POSTMASTER_API_KEY;

    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { error: "Database API not configured" },
        { status: 503 }
      );
    }

    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/stats/${encodeURIComponent(domain)}?days=${days}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Database request failed" },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      domain,
      days,
      source: "postgresql",
      stats: data.stats,
    });

  } catch {
    return NextResponse.json(
      { error: "Cache request failed" },
      { status: 500 }
    );
  }
}
