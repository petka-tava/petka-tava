// Provider interface: transcribe({ audio: ArrayBuffer, mime, lang }) -> { text, provider }
// Swap providers by changing the 'transcription' flag config.provider. No other code depends on a vendor.
export const providers = {
  cloudflare: async (env, { audio, lang }) => {
    const bytes = [...new Uint8Array(audio)];
    const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(String.fromCharCode(...bytes)), language: lang || 'he' });
    return { text: out.text || '', provider: 'cloudflare' };
  },
  // Future: ivrit: async (env, args) => {...}, groq: async (env, args) => {...}
};
