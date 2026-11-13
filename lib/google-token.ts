import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function getGoogleToken(req: NextRequest) {
  const secure = req.nextUrl.protocol === "https:";
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: secure,
    salt: cookieName,
  });

  if (!token) {
    throw new Error("Please connect Gmail.");
  }

  if (
    token.accessToken &&
    token.expiresAt &&
    Date.now() < Number(token.expiresAt) * 1000 - 60000
  ) {
    return String(token.accessToken);
  }

  if (!token.refreshToken) {
    throw new Error("Please reconnect Gmail to enable auto refresh.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || "",
      client_secret: process.env.AUTH_GOOGLE_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: String(token.refreshToken),
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Google authorization expired. Please reconnect Gmail.");
  }

  return String(data.access_token);
}
