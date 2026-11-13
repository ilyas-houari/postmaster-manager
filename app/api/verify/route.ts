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
  let action: string;

  try {
    const body = await req.json();
    domain = body.domain?.trim().toLowerCase();
    action = body.action;
  } catch {
    return NextResponse.json({
      status: "FAILED", error: "Invalid request"
    }, { status: 400 });
  }

  if (
    typeof domain !== "string" ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
    !["get", "verify"].includes(action)
  ) {
    return NextResponse.json({
      status: "FAILED", error: "Invalid request"
    }, { status: 400 });
  }

  const name = encodeURIComponent(domain);
  const base = `https://gmailpostmastertools.googleapis.com/v2/domains/${name}`;

  const url = action === "get"
    ? `${base}/verificationToken?verificationMethod=TXT`
    : `${base}:verify`;

  try {
    const response = await fetch(url, {
      method: action === "get" ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(action === "verify"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(action === "verify"
        ? { body: JSON.stringify({ verificationMethod: "TXT" }) }
        : {}),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json({
        status: "FAILED",
        error: data.error?.message || `Google API error ${response.status}`,
      }, { status: response.status });
    }

    if (action === "get") {
      if (!data.token) {
        return NextResponse.json({
          status: "FAILED", error: "No TXT token returned"
        }, { status: 502 });
      }

      return NextResponse.json({
        status: "TXT READY",
        domain,
        record: `${domain},${domain},TXT,${data.token}`,
      });
    }

    return NextResponse.json({
      status: "VERIFIED",
      domain,
    });
  } catch {
    return NextResponse.json({
      status: "FAILED", error: "Connection error"
    }, { status: 500 });
  }
}
