import type { SupabaseClient } from "@supabase/supabase-js";

/** The browser SDK handles the session at the existing root callback. Never carry query tokens. */
export function authRedirect(origin: string): string {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid sign-in origin.");
  return `${url.origin}/`;
}

export function authFeedback(error: unknown): string {
  const e = error as { status?: number; code?: string; name?: string } | null;
  if (e?.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit"].includes(e?.code ?? ""))
    return "Please wait a minute before requesting another sign-in email.";
  if (e?.code === "email_address_invalid") return "Enter a valid email address.";
  if (e?.name === "AuthRetryableFetchError" && !e.status)
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  return "We couldn't send the sign-in email. Please try again in a moment.";
}

/** Safe diagnostic metadata: never email, provider text, keys, tokens, or callback query strings. */
export function authDiagnostic(error: unknown, origin: string) {
  const e = error as { status?: unknown; code?: unknown } | null;
  return {
    status: typeof e?.status === "number" ? e.status : null,
    code: typeof e?.code === "string" && /^[a-z_]{1,80}$/.test(e.code) ? e.code : "unknown",
    message: authFeedback(error),
    redirect: authRedirect(origin),
  };
}

/** A synchronous gate closes the gap before React commits the disabled state. */
export function createSubmissionGate() {
  let active = false;
  return async (action: () => Promise<void>): Promise<boolean> => {
    if (active) return false;
    active = true;
    try { await action(); return true; }
    finally { active = false; }
  };
}

export async function sendMagicLink(client: Pick<SupabaseClient, "auth">, email: string, origin: string) {
  const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: authRedirect(origin) } });
  if (error) {
    console.warn("SHIFT sign-in email failed", authDiagnostic(error, origin));
    throw new Error(authFeedback(error));
  }
  return email.trim();
}
