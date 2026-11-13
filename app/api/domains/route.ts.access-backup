import { NextRequest, NextResponse } from "next/server";
import { getGoogleToken } from "@/lib/google-token";

export async function POST(req: NextRequest) {
  let accessToken: string;

  try {
    accessToken = await getGoogleToken(req);
  } catch (error) {
    return NextResponse.json(
      {
        status: "FAILED",
        error: error instanceof Error
          ? error.message
          : "Authentication error",
      },
      { status: 401 }
    );
  }

  let domain: string;

  try {
    const body = await req.json();
    domain = body.domain?.trim().toLowerCase();
  } catch {
    return NextResponse.json(
      { status: "FAILED", error: "Invalid request" },
      { status: 400 }
    );
  }

  if (
    typeof domain !== "string" ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
  ) {
    return NextResponse.json(
      { status: "FAILED", error: "Invalid domain" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      "https://gmailpostmastertools.googleapis.com/v2/domains",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ domainId: domain }),
        cache: "no-store",
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      return NextResponse.json({ domain, status: "ADDED" });
    }

    if (
      response.status === 409 ||
      data.error?.status === "ALREADY_EXISTS"
    ) {
      return NextResponse.json({
        domain,
        status: "ALREADY EXISTS",
      });
    }

    return NextResponse.json({
      domain,
      status: "FAILED",
      error: data.error?.message || "Google API error",
    });

  } catch {
    return NextResponse.json(
      { domain, status: "FAILED", error: "Connection error" },
      { status: 500 }
    );
  }
}
