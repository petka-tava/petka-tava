# Decisions
- 2026-10-02 Audio: no R2 (needs a payment method). Compressed blobs in D1, cap 3 min / 1.5MB, auto-purge after N days (admin flags). Limit is shown in the recording UI.
- 2026-10-02 Transcription: Cloudflare Workers AI Whisper (free daily quota), behind services/transcription/provider.js so ivrit.ai/Groq can replace it by config. ivrit.ai: self-hosted GPU costs money; hosted API adds an external dependency. Revisit if Hebrew quality is poor. Global daily cap = flag transcription.daily_cap_global.
