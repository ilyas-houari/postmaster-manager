import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/postmaster",
          prompt: "consent select_account",
          access_type: "offline",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.expiresAt = account.expires_at;
        token.refreshToken = account.refresh_token;
        token.error = undefined;
        return token;
      }

      if (
        token.accessToken &&
        token.expiresAt &&
        Date.now() < Number(token.expiresAt) * 1000 - 60000
      ) {
        return token;
      }

      if (!token.refreshToken) {
        token.error = "RefreshTokenError";
        return token;
      }

      try {
        const response = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: process.env.AUTH_GOOGLE_ID!,
              client_secret: process.env.AUTH_GOOGLE_SECRET!,
              grant_type: "refresh_token",
              refresh_token: String(token.refreshToken),
            }),
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok || !data.access_token) {
          throw new Error("Google token refresh failed");
        }

        token.accessToken = data.access_token;
        token.expiresAt =
          Math.floor(Date.now() / 1000) + data.expires_in;

        if (data.refresh_token) {
          token.refreshToken = data.refresh_token;
        }

        token.error = undefined;
      } catch {
        token.error = "RefreshTokenError";
      }

      return token;
    },
  },
});
