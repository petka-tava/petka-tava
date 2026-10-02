# Frontend pages

Static, no-build Hebrew RTL pages for GitHub Pages. No runtime package dependencies or paid services. Open `index.html` through a static web server (not file://).

## Configuration

`config.js` contains public settings only: API base and Google web client ID. Never put OAuth secrets in frontend code. Set the public ID after enabling the GitHub Pages origin in Google. With no ID, the page explicitly shows Google login as unavailable. GIS renders its official Google button when configured.

## API integration

- Home and catalog read sections from `/api/catalog/sections`.
- Section books and search use `/api/catalog/books?section=&q=`. The API returns at most 200 rows; the UI explains that cap. No fabricated total counts or pagination.
- Book links carry a section and catalog ID. The detail page verifies the ID against catalog search. It displays metadata, not Sefaria text.
- Guest feed reads `/api/feed`; signed-in feed sends the Bearer token. No personalized feed endpoint exists, so My Feed explicitly labels the current published community feed.
- Email start/verify and Google login use the existing POST endpoints. Tokens remain in sessionStorage, not localStorage. Exit clears the current tab's token; there is no server-side logout endpoint.
- Recording limits come from `/api/recording/limits`. Recording stays disabled until verified. The recorder stops at the cap, shows the cap and timer, supports local playback/download, and never uploads audio.
- Uploads, comments, reactions, filtered book feed and account deletion are not implemented or represented as working.

## Attribution

Catalog credit links remain visible in the footer. Existing logo and system fonts are reused; no new fonts/icons. Google Identity Services is credited in credits.html. Add its row to root CREDITS.md when merging (frontend work is restricted to docs/).

## Privacy review

The old policy's unsupported claims about inaccessible private content and no third-party processing were removed. Current policy describes only implemented login, session storage and local recording. Product owner should review before release, especially before enabling uploads/publication.

## Verification on 2026-10-02

Chrome desktop (1440px) and mobile (390px) renders checked. All pages load with no JS errors or horizontal overflow. Catalog, book and limits were tested against live API responses bridged into the local preview because the deployed CORS policy permits only the GitHub Pages origin. Screenshots inspected: homepage, mobile catalog, book, signup and recorder. Live API returned 8 sections and an empty guest feed at the time of testing; the frontend does not hardcode these counts.

Mocked interaction tests passed for search/no results, missing book, HTML-safe feed content, errors and retry, guest gates, email delivery unavailable, email code verification, session token/Bearer use, exit, unavailable limits, one-second recording cap/automatic stop, local playback/download and delete. No actual auth code email sent and no live Google sign-in performed; these need a configured end-to-end check after deployment. Test-only Playwright is outside the repository and is not a shipped dependency.
