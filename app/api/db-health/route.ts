import { NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/access";

export async function GET() {
  if (!(await hasAppAccess())) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const apiUrl = process.env.POSTMASTER_API_URL;

  if (!apiUrl || !process.env.POSTMASTER_API_KEY) {
    return NextResponse.json(
      { error: "Postmaster API not configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${apiUrl}/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Postmaster API unavailable" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: "connected",
      backend: "PostgreSQL via FastAPI",
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot connect to Postmaster API" },
      { status: 502 }
    );
  }
}
