# UI/UX check, 2026-10-02

## Scope and results

324 page/state/width checks: 12 screens (home, catalog, book, community feed, My Feed, signup, login, manual registration, new recording, resumed recording, privacy, credits) x guest/member/product-account x populated/empty/server-error x 320/390/1440px.

Checked page errors, overflow, local-link destinations, account-specific copy/forms, management-link access, no queue fetch from public pages, shared contact modal containment/Escape/focus return. Desktop/mobile pixels inspected for member empty feed and product-account populated feed.

Additional mocked interaction suites: email failures/verification; Google optional nickname and validation; manual consent/optional phone/pending verification; contact errors/retry; local record/cap/upload retry/polling/transcript review/submit; comments/reactions; deletion cancellation/two-stage confirmation; server logout; Hebrew date on every page including 15/16 and leap-month cases. No actual messages, registration, uploads, publication, deletion or moderation performed.

## Issues fixed in this patch

| Severity | Issue | Fix |
|---|---|---|
| High | Signed-in community feed sent no Bearer token and displayed hardcoded guest prompts | Authenticate feed whenever session is verified; derive member/guest copy and hide guest notice before loading |
| Medium | Signed-in signup/login still displayed prompts to create/enter an account | Hide those prompts once the account is confirmed |
| Medium | Signed-in manual-registration page still offered a second registration form | Replace form with current-account notice and My Feed link |
| High | Session lookup network error on general pages silently fell back to guest interpretation | Stop with a retryable session error on every page instead |
| Medium | Draft saved before a failed audio upload had no recording/upload recovery on resume | Detect audio-less draft and reopen recorder with stored location |
| Low | Six-item product-account nav could crowd at small widths | Wrap nav without overflow, retaining readable labels |
| Low | Signup guidance omitted forbidden nickname symbols, email field exceeded manual backend cap | Align descriptions and field length; avoid unrelated code-request instruction on Google nickname collision |

## Backend-console findings (outside docs scope)

Existing console source from services/admin/console.js was rendered with mocked API on desktop/mobile. Verified HIGH: failed moderation response shows no error; failed queue reload leaves stale cards/actions visible with login. MEDIUM: action buttons stay enabled during request; fetch failures are uncaught; code input lacks a visible label. These findings were handed to the backend owner with screenshot evidence. No public/admin markup duplication added in docs.

The current server returns a signed management link from /api/me/extras only after its server-side product-email check. Public pages do not fetch moderation data. Testing that contract used mocked account responses, not an actual product-account session. Production auth, real mailbox delivery, real audio transcription and moderation need a final end-to-end check by the backend owner/user.

## Re-run

`tests/ui-state-check.cjs` is the reproducible screen-state check. It uses test-only Playwright (install outside the app, or set NODE_PATH) and Chrome at `/usr/bin/google-chrome`. Run with Node. It serves docs locally, mocks all account/content calls, writes selected screenshots to /tmp, and performs no production mutations. No test package is shipped to visitors.

## Flow + content-only library UI (2026-10-02, held for backend release)

Changes: direct record/read home CTAs, persistent record/help navigation, member home copy, content-only library API browsing, content=1 search with real cursor batches, book/daf pages and contextual feed links, own-content workspace, separate account page, citation-only optional picker with server shorthand parsing and confirmation chip, source selector for Bavli, identity-first login, return context across auth paths, completion states.

Test: `dev/tests/flow-library.cjs` using Playwright and Chrome. Independent guest/member mocks, 11 pages at 390/1440, no page exceptions or horizontal overflow; pending submission completion; email login preserves selected book/daf/amud; rejected unsafe/looping return targets; real cursor UI batching; missing-amud choice buttons; out-of-range daf message removes confirmation; shorthand match chip; clear association; header help dialog. Syntax and git whitespace checks pass. API responses are mocked against the backend contract, not production end-to-end testing. New backend release must be live before merge/deploy. No live writes or migration run by frontend.

Visual inspection: rendered mobile member home, recorder, daf and own-workspace, plus desktop home. All use real Chrome pixels. No published management code or QA files; those remain in dev/. Optional account.html is included in the same-site return allowlist so account actions can resume after login.
