# Transient authentication state

StitchTrack uses pinned **Zustand 5.0.16** for the real Login -> Forgot Password email
handoff and reset-step navigation. [The per-screen vanilla store](../../lib/auth/auth-flow-store.ts)
holds only `email` and `resetStep`, with explicit edit/step/clear actions. The existing
[AuthScreen](../../app/%28auth%29/auth/AuthScreen.tsx) retains that store across `/auth`
mode navigation; [AuthForm](../../app/%28auth%29/_components/AuthForm.tsx) records the
submitted email even when login fails or browser autofill did not emit a change event.
The reset request prepopulates that draft, allows editing, then carries it through code
checking and password submission without asking again. No email is put in query strings,
localStorage, sessionStorage or a module-level server singleton.

This is the assessment's state-management-library use case. React state/Context could
handle this small flow without a dependency; Zustand provides one explicit store and
React subscriptions across the existing forms with little boilerplate. It adds a pinned
runtime dependency and subscription behavior to test. A separate store is constructed for
each mounted auth screen, avoiding server-request/user leakage. It is intentionally not a
rewrite of the working session/registration controllers or a general application cache.

Password text stays only in the active controlled password field. The checked OTP stays in
the active reset form's ref until final submission; it is not placed in Zustand. A code
check does not consume it or authorize a password change. The server rechecks eligibility,
expiry, attempts and the same code during the final atomic reset. Leaving/restarting the
flow clears the ref/step; completed reset clears the shared email/step and password/code.
An aborted or uncertain request may still have committed; the UI never manufactures success.

The store is a UX convenience, not authentication or business authorization. It cannot
create sessions, bypass OTP validation, grant a business membership or make an ineligible
account eligible. Client memory/fields remain accessible to browser compromise/XSS;
transient storage reduces persistence, not all disclosure risk.

[Offline tests](../../tests/auth-validation/password-reset.test.mjs) exercise the actual
Zustand store, failed-login handoff, editable prefill, identical email across all three
requests, exact secret strings, clear-on-completion and safe failure responses. Markup
checks preserve labels/status announcements. These are not mounted browser evidence.
The owner browser demonstration should show a failed login followed by a prefilled,
editable Forgot Password form, then complete reset without re-entering the email. Redact
identities and all password/OTP/request/cookie values in evidence. No capture is claimed.

Assumptions: none.
