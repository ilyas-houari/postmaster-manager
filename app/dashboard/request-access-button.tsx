"use client";

import { useState } from "react";

export default function RequestAccessButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function requestAccess() {
    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/request-access", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }

      setMessage("Request sent! Please wait for administrator approval.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={requestAccess}
        disabled={loading}
        className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Request Access"}
      </button>

      {message && (
        <p className="mt-3 text-sm text-slate-300">{message}</p>
      )}
    </div>
  );
}
