import { NextRequest, NextResponse } from "next/server";
import { approveEmail } from "@/lib/github-access";

type TelegramUpdate = {
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: {
      message_id: number;
      text?: string;
      chat: { id: number };
      from?: { is_bot?: boolean };
    };
  };
};

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (
    !secret ||
    req.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const cb = update.callback_query;

  if (!cb) return NextResponse.json({ ok: true });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !adminId) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  if (
    String(cb.from.id) !== adminId ||
    String(cb.message?.chat.id) !== adminId ||
    cb.message?.from?.is_bot !== true
  ) {
    return NextResponse.json({ ok: true });
  }

  const action = cb.data;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: true });
  }

  const text = cb.message?.text || "";

  if (!text.startsWith("POSTMASTER ACCESS REQUEST\n")) {
    return NextResponse.json({ ok: true });
  }

  const email = text.match(/^Gmail: ([^\s]+@[^\s]+)$/m)?.[1];

  if (!email || email.length > 254) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (action === "approve") {
      await approveEmail(email);
    }

    const result = action === "approve"
      ? `APPROVED: ${email}`
      : `REJECTED: ${email}`;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminId,
          message_id: cb.message?.message_id,
          text: result,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Telegram message update failed");
    }

    await fetch(
      `https://api.telegram.org/bot${token}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: cb.id,
          text: result,
        }),
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram approval error:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
