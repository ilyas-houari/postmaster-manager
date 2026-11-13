import { NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "@/lib/google-token";

export async function POST(req: NextRequest) {
  let accessToken: string;

  try {
    accessToken = await getGoogleToken(req);
  } catch (error) {
    return NextResponse.json({
      status: "FAILED",
      error: error instanceof Error ? error.message : "Authentication error",
    }, { status: 401 });
  }

  let domain: string;

  try {
    const body = await req.json();
    domain = body.domain?.trim().toLowerCase();
  } catch {
    return NextResponse.json({
      status: "FAILED", error: "Invalid request"
    }, { status: 400 });
  }

  if (
    typeof domain !== "string" ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  ) {
    return NextResponse.json({
      status: "FAILED", error: "Invalid domain"
    }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://gmailpostmastertools.googleapis.com/v2/domains/${encodeURIComponent(domain)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (response.ok) {
      return NextResponse.json({ domain, status: "DELETED" });
    }

    const data = await response.json().catch(() => ({}));

    return NextResponse.json({
      domain,
      status: response.status === 404 ? "NOT FOUND" : "FAILED",
      error: data.error?.message || `Google API error ${response.status}`,
    });
  } catch {
    return NextResponse.json({
      domain, status: "FAILED", error: "Connection error"
    }, { status: 500 });
  }
}
