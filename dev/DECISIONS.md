# Decisions
- 2026-10-02 Audio: no R2 (needs a payment method). Compressed blobs in D1, cap 3 min / 1.5MB, auto-purge after N days (server settings). Limit is shown in the recording UI.
- 2026-10-02 Transcription: Cloudflare Workers AI Whisper (free daily quota), behind services/transcription/provider.js so ivrit.ai/Groq can replace it by config. ivrit.ai: self-hosted GPU costs money; hosted API adds an external dependency. Revisit if Hebrew quality is poor. Global daily cap = flag transcription.daily_cap_global.
- 2026-10-04 Phone line: the caller is recognised by matching the caller number against the stored salted hash (no code). The raw number is never stored; the voicemail mail is removed right after import. Each recording becomes a draft in the matched account and the user assigns it to a book/chapter in the app before submitting. Unknown callers are dropped. A recording notice plays at call start. The phone number is optional at registration; users without one see a notice (only while the line is on) pointing to their profile.

## Transcription: vocabulary hint and cleanup pass reverted
The Talmudic vocabulary hint and the optional cleanup pass were tried and judged worse than plain transcription by the user on real recordings. Both were removed and the previous behavior restored. Manual editing of the transcript remains the fallback for accuracy.
