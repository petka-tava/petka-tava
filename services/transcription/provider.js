// Provider interface: transcribe({ audio: ArrayBuffer, mime, lang }) -> { text, provider }
// Swap providers by changing the 'transcription' flag config.provider. No other code depends on a vendor.
export const providers = {
  cloudflare: async (env, { audio, lang }) => {
    const u8 = new Uint8Array(audio); let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
    const out = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: btoa(bin), language: lang || 'he' });
    return { text: out.text || '', provider: 'cloudflare' };
  },
  // Future: ivrit: async (env, args) => {...}, groq: async (env, args) => {...}
};
