import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/global-config";

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

  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const cb = update.callback_query;

  if (!cb) return NextResponse.json({ ok: true });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const apiToken = process.env.VERCEL_API_TOKEN;
  const configId = process.env.GLOBAL_CONFIG_ID;

  if (!botToken || !adminId || !apiToken || !configId) {
    return NextResponse.json({ error: "Configuration missing" }, { status: 503 });
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

  const text = cb.message.text || "";
  if (!text.startsWith("POSTMASTER ACCESS REQUEST\n")) {
    return NextResponse.json({ ok: true });
  }

  const email = text.match(/^Gmail: ([^\s]+@[^\s]+)$/m)?.[1]?.toLowerCase();
  if (!email || email.length > 254) {
    return NextResponse.json({ ok: true });
  }

  let result = "";

  try {
    if (action === "approve") {
      const existing = await get<string[]>("allowed_emails");

      if (existing !== undefined && !Array.isArray(existing)) {
        throw new Error("Invalid allowed_emails configuration");
      }

      const emails = [...new Set([
        ...(existing || []).map((item) => item.toLowerCase()),
        email,
      ])];

      const response = await fetch(
        `https://api.vercel.com/v1/global-config/${configId}/items`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [{
              operation: "upsert",
              key: "allowed_emails",
              value: emails,
            }],
          }),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(`Vercel API returned ${response.status}`);
      }

      result = `APPROVED: ${email}`;
    } else {
      result = `REJECTED: ${email}`;
    }

    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminId,
        message_id: cb.message.message_id,
        text: result,
      }),
    });

    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: result,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram approval failed:", error);
    return NextResponse.json({ error: "Approval failed" }, { status: 500 });
  }
}
