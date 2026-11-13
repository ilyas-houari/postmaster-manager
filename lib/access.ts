import { auth } from "@/auth";
import { get } from "@vercel/global-config";

export async function hasAppAccess(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) return false;

  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (admin && email === admin) {
    return true;
  }

  const localAllowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (localAllowed.includes(email)) {
    return true;
  }

  // Never grant access when configuration is unavailable.
  if (!process.env.GLOBAL_CONFIG && !process.env.EDGE_CONFIG) {
    return false;
  }

  try {
    const allowed = await get<string[]>("allowed_emails");

    if (!Array.isArray(allowed)) return false;

    return allowed.some(
      (value) => typeof value === "string" &&
        value.trim().toLowerCase() === email
    );
  } catch (error) {
    console.error("Global Config access check failed:", error);
    return false;
  }
}
