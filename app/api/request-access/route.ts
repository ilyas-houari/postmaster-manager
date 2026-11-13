import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/access";

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

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { error: "Telegram is not configured." },
      { status: 503 }
    );
  }

  const message = [
    "POSTMASTER ACCESS REQUEST",
    "",
    `Gmail: ${email}`,
    "",
    "Approve or reject this user:",
  ].join("\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          reply_markup: {
            inline_keyboard: [[
              { text: "Approve ✅", callback_data: "approve" },
              { text: "Reject ❌", callback_data: "reject" }
            ]]
          }
        }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error("Telegram API request failed");
    }

    return NextResponse.json({
      message: "Access request sent to administrator."
    });
  } catch {
    return NextResponse.json(
      { error: "Could not send request. Please try again." },
      { status: 502 }
    );
  }
}
