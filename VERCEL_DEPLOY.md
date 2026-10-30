# Vercel quick deploy

- Build command: `npm run build`
- Output: managed by `@astrojs/vercel`
- Node runtime: 20.3+ (22 recommended)
- Required environment variable: `GROQ_API_KEY`
- Model IDs are managed in `src/lib/groq.ts`; no public or client-side Groq key/model environment variable is required.

After deployment, use the HTTPS URL to connect ElevenLabs. Browser microphone access requires a secure context.
