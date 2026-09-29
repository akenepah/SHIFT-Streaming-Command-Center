# Magic-link validation

The root route `/` is the existing callback. The browser Supabase SDK handles the returned session; no new callback route is required. The app sends the current origin plus `/`, without carrying query parameters or tokens.

## Confirmed external failure (2026-09-29)

A single authorized staging request at 22:03:42 UTC reached `/auth/v1/otp` and returned HTTP 500, displayed as “Error sending confirmation email”. The Supabase Auth log at 22:03:43 UTC reported SMTP 550: the sender domain `shift-streamer.farmtofame.com` was not verified in Resend.

The sender email's domain must exactly match a domain verified in Resend. A website domain and an email sender domain can differ. Do not change SMTP passwords or redirect URLs to repair this sender-domain error.

In Supabase Authentication → Email → SMTP Settings, use the verified sender address. In Authentication → URL Configuration, confirm Site URL and the exact root redirects for production, staging, and the local test origin. Dashboard values have not been verified by this code change.

Tested staging origin: `https://shift-streaming-command-center-git-8e3c08-pixel-perfect-designs.vercel.app/`.

## Client changes

- Synchronous submission gate prevents requests before React's disabled state commits.
- Email input is required and uses native email validation; controls disable while pending.
- Success identifies the recipient under “Check your email”.
- Rate-limit and send-failure feedback is safe and specific.
- Diagnostic logging includes only status, code, safe message, and root redirect; no raw provider text, email, tokens, or keys.

Unit tests cover redirect origins, duplicate submission, lock release, success, failure, and rate limits. Local browser tests using simulated responses verified loading/disabled controls, success copy, rate-limit feedback, and failure feedback without sending email.

Live email delivery, desktop/mobile callback, and session persistence still require a successful request after the sender configuration is corrected. Simulated responses do not establish that acceptance result.
