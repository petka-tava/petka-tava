# INCIDENTS.md - issue -> fix -> prevention guideline

Permanent rule (owner, 2/10): whenever anything goes wrong in a build (security issue, data damage, anything that could stop the site/app), record the fix here as a guideline for future projects. One entry per incident.

## 2026-10-02 node_modules tracked in git
- Issue: a push to GitHub failed because node_modules/.wrangler (a 128MB workerd binary) was committed.
- Fix: removed from tracking, added .gitignore, re-pushed.
- Guideline: create .gitignore (node_modules, .wrangler, secrets, *.log) before the first commit; check `git status` size before pushing.

## 2026-10-02 secret visible in tool output
- Issue: an API token creation page was read by a tool, printing the token into the working log.
- Fix: token used only for that deploy, then deleted in the provider UI and verified; the admin token was rotated.
- Guideline: read secrets straight into a file (never echo); give tokens the shortest life and delete them right after use; rotate any secret that was displayed.

## 2026-10-02 admin area discoverable by non-admins
- Issue: admin API returned 401 for non-admins, which reveals that an admin area exists.
- Fix: every admin route returns the same 404 as an unknown path unless the admin token is valid; no admin links in the public frontend, no robots/sitemap hints.
- Guideline: admin surfaces must be indistinguishable from nonexistent paths; verify by diffing responses of an admin path and a random path.

## 2026-10-02 email to a first-time unverified OAuth app
- Issue: Google shows "hasn't verified this app" when minting a Gmail refresh token for our own app.
- Fix: the owner of the app proceeds through Advanced for its own mailbox; scope limited to gmail.send only.
- Guideline: request the narrowest scope, mint the token as the product mailbox only, store it only as a Worker secret and in the vault.

## 2026-10-02 caller phone number in voicemail emails
- Issue: the telephony provider's voicemail email includes the caller's raw phone number.
- Fix (decided by owner): keep only a salted hash for matching users, drop the raw number after matching, delete processed emails/recordings after import, play a recording notice at call start (Israeli law).
- Guideline: collect the minimum personal data; hash identifiers that are only needed for matching; always notify the recorded party.

## 2026-10-02 transcription hallucination on non-speech audio
- Issue: Whisper returned a confident Hebrew sentence for a pure test tone.
- Fix: transcripts are always editable before submission; submission requires explicit user action; UI warns that the transcript is automatic.
- Guideline: never auto-publish machine transcripts; keep a human edit step and a moderation step.

## 2026-10-02 deploy appears not to take effect
- Issue: after `wrangler deploy` the old responses were served for up to a minute.
- Fix: waited and retested (edge propagation), not redeployed blindly.
- Guideline: wait 30-60s and retest with a cache-busting query before assuming a deploy failed.

## 2026-10-02 email-link actions and mail scanners
- Issue: one-click approve links in email can be triggered by link scanners/prefetch.
- Fix: the link opens a confirm page (GET) and only a POST changes anything; links are HMAC-signed and any bad signature returns 404.
- Guideline: state changes never happen on GET.
