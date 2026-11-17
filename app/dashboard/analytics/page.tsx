import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAppAccess } from "@/lib/access";
import AnalyticsClient from "./analytics-client";

async function ProtectedAnalytics() {
  const session = await auth();

  if (!session?.user || !(await hasAppAccess())) {
    redirect("/dashboard");
  }

  return <AnalyticsClient />;
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0b1019] text-slate-300">
          Loading Analytics...
        </main>
      }
    >
      <ProtectedAnalytics />
    </Suspense>
  );
}
