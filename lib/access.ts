import { auth } from "@/auth";
import { getAllowedEmails } from "@/lib/github-access";

export async function hasAppAccess(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) return false;

  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (admin && email === admin) return true;

  const localAllowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (localAllowed.includes(email)) return true;

  try {
    const allowed = await getAllowedEmails();

    return allowed.some(
      (value) =>
        typeof value === "string" &&
        value.trim().toLowerCase() === email
    );
  } catch (error) {
    console.error("GitHub access check failed:", error);
    return false;
  }
}
