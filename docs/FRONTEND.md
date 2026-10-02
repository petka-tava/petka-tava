# Frontend pages

Static, no-build Hebrew RTL pages for GitHub Pages. No runtime package dependencies or paid services. Open `index.html` through a static web server (not file://).

## Configuration

`config.js` contains public settings only: API base and Google web client ID. Never put OAuth secrets in frontend code. Set the public ID after enabling the GitHub Pages origin in Google. With no ID, the page explicitly shows Google login as unavailable. GIS renders its official Google button when configured.

## API integration

- Home and catalog read sections from `/api/catalog/sections`.
- Section books and search use `/api/catalog/books?section=&q=`. The API returns at most 200 rows; the UI explains that cap. No fabricated total counts or pagination.
- Book links carry a section and catalog ID. The detail page verifies the ID against catalog search. It displays metadata, not Sefaria text.
- Guest feed reads `/api/feed`; signed-in feed sends the Bearer token. No personalized feed endpoint exists, so My Feed explicitly labels the current published community feed.
- Email start/verify and Google login use the existing POST endpoints. Tokens remain in sessionStorage, not localStorage. Exit calls `/api/auth/logout` to revoke the session before clearing the current tab's token.
- Recording starts locally and uploads only after the explicit upload action. Limits and retention come from `/api/recording/limits` and must verify before recording/upload.
- Uploads, comments, reactions, filtered book feed and account deletion are not implemented or represented as working.

## Attribution

Catalog credit links remain visible in the footer. Existing logo and system fonts are reused; no new fonts/icons. Google Identity Services is credited in credits.html. Add its row to root CREDITS.md when merging (frontend work is restricted to docs/).

## Privacy review

The old policy's unsupported claims about inaccessible private content and no third-party processing were removed. Current policy describes only implemented login, session storage and local recording. Product owner should review before release, especially before enabling uploads/publication.

## Verification on 2026-10-02

Chrome desktop (1440px) and mobile (390px) renders checked. All pages load with no JS errors or horizontal overflow. Catalog, book and limits were tested against live API responses bridged into the local preview because the deployed CORS policy permits only the GitHub Pages origin. Screenshots inspected: homepage, mobile catalog, book, signup and recorder. Live API returned 8 sections and an empty guest feed at the time of testing; the frontend does not hardcode these counts.

Mocked interaction tests passed for search/no results, missing book, HTML-safe feed content, errors and retry, guest gates, email delivery unavailable, email code verification, session token/Bearer use, exit, unavailable limits, one-second recording cap/automatic stop, local playback/download and delete. No actual auth code email sent and no live Google sign-in performed; these need a configured end-to-end check after deployment. Test-only Playwright is outside the repository and is not a shipped dependency.

## Contact and manual registration (second pass)

The shared footer opens an accessible native dialog on the same page, including credits/privacy. POST `/api/contact` sends optional name (80 chars), email (120), message (5..2000) and an empty `website` honeypot. The modal states what is sent and its use for responding. Errors keep the message; only `{ok:true}` shows a sent confirmation. Native modal handles focus containment, Escape and focus return; explicit close and backdrop dismissal are provided.

`register.html` is a distinct manual signup path linked from signup. POST `/api/auth/register` sends email, display_name (2..24), optional phone and explicit required consent. Phone use/hash/non-display is explained per the backend contract. A pending result shows the email-code form; verification sends only email/code and saves the returned token. No password collected. Existing email directs the visitor to login. No CAPTCHA added.

Additional mocked Chrome checks passed for contact payload/limits, mailbox-unavailable preservation/retry, successful reset, same-page behavior and modal keyboard/focus, manual optional-phone and consent fields, existing-account error, pending signup and verification. Desktop/mobile contact and manual form pixels inspected. No real contact email or account creation attempted. Backend endpoints must be deployed and tested end-to-end by the backend owner.

## Content integration (third pass)

- Recorder creates a draft, uploads raw supported audio with x-audio-seconds, and polls the owner detail endpoint every 3 seconds for up to one minute. Checks stop on navigation or when editing starts. A failed upload preserves the local recording and reuses the created draft on retry. Limits are read dynamically (seconds, bytes, daily cap and nullable retention), not hardcoded. No audio playback endpoint exists, so resumed drafts do not invent a server playback link.
- Transcript editor prominently warns about AI errors/hallucinated words on silence/noise. Text is saved separately; submission requires review checkbox and a final confirmation naming public nickname/location/text. Draft, pending, published and rejected states are shown. A pending/published response hides the submit action. Editing existing non-draft transcripts uses the current owner-edit API contract.
- My Feed lists up to 100 own items with status, resume/edit and deletion, plus published community feed. Reactions toggle with returned count/mine state. Comments are HTML-safe and show pending/publication confirmation. Guest interaction asks for login.
- Self-deletion requires a first confirmation and typing the exact confirmation phrase. Server logout must succeed before the tab token is cleared.
- Mocked content tests passed for failed upload/retry without duplicate draft, raw audio headers/Bearer, polling/edit/save/review/submit, own-status listing, reaction toggle, escaped comments and moderation status, two-stage delete cancellation/success and server logout. Screenshots inspected at desktop/mobile. The live limits endpoint was checked; no real content, comments, reactions, deletions, logout or audio uploads were performed during tests.
- Privacy copy covers DB audio storage, AI transcription, configurable retention, public nickname/location, comments, deletion and logout.
