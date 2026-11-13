import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/access";
import { createHash } from "crypto";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "Please sign in with Google first." },
      { status: 401 }
    );
  }

  if (await hasAppAccess()) {
    return NextResponse.json({ message: "Already authorized." });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const githubToken = process.env.GITHUB_ACCESS_TOKEN;
  const owner = process.env.GITHUB_ACCESS_OWNER;
  const repo = process.env.GITHUB_ACCESS_REPO;

  if (!botToken || !chatId || !githubToken || !owner || !repo) {
    return NextResponse.json(
      { error: "Access request service unavailable." },
      { status: 503 }
    );
  }

  // One request per email per 24-hour window.
  const hash = createHash("sha256").update(email).digest("hex");
  const windowId = Math.floor(Date.now() / 86400000);
  const path = `requests/${hash}-${windowId}.json`;

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  try {
    const content = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString() })
    ).toString("base64");

    const lock = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Record access request",
        content,
      }),
      cache: "no-store",
    });

    if (lock.status === 422 || lock.status === 409) {
      return NextResponse.json(
        { error: "Request already sent. Please try again tomorrow." },
        { status: 429 }
      );
    }

    if (!lock.ok) {
      throw new Error(`GitHub request failed: ${lock.status}`);
    }

    const telegram = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: [
            "POSTMASTER ACCESS REQUEST",
            "",
            `Gmail: ${email}`,
            "",
            "Approve or reject this user:",
          ].join("\n"),
          reply_markup: {
            inline_keyboard: [[
              { text: "Approve", callback_data: "approve" },
              { text: "Reject", callback_data: "reject" },
            ]],
          },
        }),
        cache: "no-store",
      }
    );

    if (!telegram.ok) {
      throw new Error(`Telegram request failed: ${telegram.status}`);
    }

    return NextResponse.json({
      message: "Request sent! Please wait for administrator approval.",
    });
  } catch (error) {
    console.error("Access request error:", error);

    return NextResponse.json(
      { error: "Could not send request. Please contact @ilyas_houari8." },
      { status: 502 }
    );
  }
}
