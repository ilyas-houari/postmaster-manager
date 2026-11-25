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

  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();

  if (!domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return NextResponse.json(
      { error: "Invalid domain" },
      { status: 400 }
    );
  }

  try {
    const token = await getGoogleToken(req);

    const response = await fetch(
      `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}/complianceStatus`,
      {
        headers: { Authorization: `Bearer ${token}` },
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

    return NextResponse.json({
      domain,
      compliance: data,
    });
  } catch {
    return NextResponse.json(
      { error: "Compliance request failed. Please try again." },
      { status: 500 }
    );
  }
}
