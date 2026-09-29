import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authDiagnostic, authFeedback, authRedirect, createSubmissionGate, sendMagicLink } from "./auth";

describe("magic-link submission", () => {
  it.each(["https://shift-streamer.farmtofame.com", "https://shift-staging.vercel.app", "http://localhost:3000", "http://127.0.0.1:3210"])("uses the existing root callback on %s", (origin) => {
    expect(authRedirect(`${origin}/setup?token=secret#secret`)).toBe(`${origin}/`);
  });
  it("rejects non-web origins", () => expect(() => authRedirect("javascript:alert(1)")).toThrow());
  it("sends once with trimmed email and the exact redirect, then reports the recipient", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOtp } } as unknown as SupabaseClient;
    expect(await sendMagicLink(client, " test@example.com ", "http://localhost:3000")).toBe("test@example.com");
    expect(signInWithOtp).toHaveBeenCalledExactlyOnceWith({ email: "test@example.com", options: { emailRedirectTo: "http://localhost:3000/" } });
  });
  it("keeps the submission locked while pending and allows a subsequent request after settling", async () => {
    const gate = createSubmissionGate();
    let resolve!: () => void;
    const action = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    const first = gate(action);
    expect(await gate(action)).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    resolve();
    expect(await first).toBe(true);
    expect(await gate(async () => {})).toBe(true);
  });
  it("releases the gate after failure", async () => {
    const gate = createSubmissionGate();
    await expect(gate(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    expect(await gate(async () => {})).toBe(true);
  });
  it.each([{status:429}, {code:"over_email_send_rate_limit"}, {code:"over_request_rate_limit"}])("explains rate limiting", error => {
    expect(authFeedback(error)).toBe("Please wait a minute before requesting another sign-in email.");
  });
  it("reports send failure without disclosing provider text or secrets", async () => {
    const error = { status: 500, code: "unexpected_failure", message: "SMTP password=secret test@example.com" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const client = { auth: { signInWithOtp: vi.fn().mockResolvedValue({ error }) } } as unknown as SupabaseClient;
      await expect(sendMagicLink(client, "test@example.com", "https://shift-streamer.farmtofame.com")).rejects.toThrow("We couldn't send the sign-in email.");
      const diagnostic = authDiagnostic(error, "https://shift-streamer.farmtofame.com/?token=secret");
      expect(diagnostic).toMatchObject({ status:500, code:"unexpected_failure", redirect:"https://shift-streamer.farmtofame.com/" });
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/password|test@example|secret/);
    } finally { warn.mockRestore(); }
  });
});
