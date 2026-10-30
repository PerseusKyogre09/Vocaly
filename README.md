# VoxFlow

**Describe it. Build it. Talk to it. Ship it.**

VoxFlow is a hackathon MVP for building, configuring, testing and deploying conversational voice agents. It uses Astro + Svelte 5, Groq for structured agent generation and Reality Lab evaluation, and ElevenLabs Agents for the actual voice agent and browser conversation.

## What's included

- **Agent generator:** turn a plain-language business brief into a structured agent blueprint with Groq.
- **Agent setup:** edit the name, business, language, first message, voice and system instructions.
- **Visual flow builder:** drag, connect, select and configure workflow nodes using Svelte Flow.
- **ElevenLabs connection:** validate an API key, fetch voices, create an agent and request a signed conversation URL.
- **Voice studio:** start a real browser conversation with the created ElevenLabs agent.
- **Reality Lab:** run Groq-powered instruction-level simulations against six caller scenarios, inspect findings and apply proposed prompt patches.
- **Model settings:** choose the approved primary and fast Groq models, save the preference locally and test the server-side Groq connection.
- **Local-first credentials:** encrypt the user's ElevenLabs key in IndexedDB with AES-GCM and a non-extractable Web Crypto key. The key is only sent to the server when an API operation is requested; the API routes do not persist it.
- **Account isolation:** Better Auth email/password sessions protect the dashboard, while Neon Postgres stores each user's workspace and Reality Lab runs with user ownership enforced server-side. GitHub and Google are opt-in when their credentials are configured.
- **Vercel deployment:** Astro server output with the Vercel adapter.

## Requirements

- Node.js 20.3+ (Node 22 LTS recommended)
- npm
- A Groq API key
- An ElevenLabs API key with Conversational AI / Agents permissions
- Microphone access for live browser testing (HTTPS or localhost)

## Run locally

```bash
cp .env.example .env
# Fill the required server-side values described below
npm install
npm run dev
```

Open <http://localhost:4321>.

### Environment variables

```env
GROQ_API_KEY=gsk_...
PUBLIC_APP_URL=http://localhost:4321
```

`GROQ_API_KEY` is server-only. Do not rename it with a `PUBLIC_` prefix. ElevenLabs keys are entered by each user in the app and are not configured in `.env`.
Model IDs and task defaults are centralized in [`src/lib/groq.ts`](./src/lib/groq.ts). The primary model is `openai/gpt-oss-120b` for agent/workflow generation, Reality Lab and prompt repair; the fast model is `openai/gpt-oss-20b` for caller simulations, quick edits and lightweight tasks.

### Neon and Better Auth setup

The authenticated dashboard requires a Neon database and a Better Auth secret. Copy the complete template from `.env.example`; do not commit `.env`.

1. In Neon Console, open the project and select **Connect**.
2. Copy the **Pooled connection** string into `DATABASE_URL`. This is the runtime connection used by the serverless app.
3. Open the connection options again and copy the **Direct / Unpooled connection** string into `DATABASE_URL_UNPOOLED`. This is used only by Drizzle migrations.
4. Generate `BETTER_AUTH_SECRET` locally with `openssl rand -base64 32`.
5. Keep `BETTER_AUTH_URL` and `PUBLIC_APP_URL` equal to the exact app origin. For local development both are `http://localhost:4321`.
6. Apply the checked-in migration with `npm run db:migrate`.
7. Start the app and create an account at `/auth`.

GitHub and Google buttons remain unavailable unless the corresponding client ID and secret are both configured. OAuth callback URLs are `/api/auth/callback/github` and `/api/auth/callback/google` on the configured `BETTER_AUTH_URL`.

## Deploy to Vercel

1. Push this project to a Git repository.
2. Import the repository into Vercel.
3. Keep the framework preset as Astro (or allow Vercel to detect it).
4. Add `GROQ_API_KEY` in Vercel Project Settings → Environment Variables.
5. Deploy.
6. Open the deployment over HTTPS, connect an ElevenLabs key and create an agent.

## Demo path

1. Open **Integrations & keys** and connect an ElevenLabs API key.
2. Open **Agent setup** and use the Sunrise Clinic example brief.
3. Generate the blueprint with Groq and review the generated instructions.
4. Choose an available ElevenLabs voice and create the agent.
5. Open **Flow builder** and drag/connect nodes. Add or edit a node to demonstrate no-code orchestration.
6. Open **Voice studio** and start a live conversation.
7. Open **Reality Lab** and run the six scenario simulations. Apply a suggested prompt patch and rerun.

## Security model and limitations

- The browser vault uses IndexedDB and AES-GCM encryption. Its non-extractable CryptoKey is also held in IndexedDB. This is useful protection for stored credentials at rest, but it is **not a defence against same-origin XSS, malicious browser extensions, or a compromised device**. A script executing on the VoxFlow origin can potentially ask the browser to decrypt and use the key.
- When an API operation is requested, the key is sent over HTTPS in the POST body to a VoxFlow serverless endpoint, which forwards it to ElevenLabs. The endpoint does not intentionally persist or log it. The server necessarily handles the plaintext key in memory during that request.
- Use a dedicated, least-privilege ElevenLabs API key; rotate it if exposed. Disconnect removes the encrypted key from this browser.
- A localStorage draft remains as a local fallback, while authenticated agent, workflow and Reality Lab state is synchronized to the user's Neon workspace.
- Groq is a platform-side service and its key must be configured by the deployer. Never commit `.env`.
- Reality Lab is explicitly an **LLM-based configuration simulation**. It does not execute calls against the actual ElevenLabs runtime and must not be represented as a live-agent benchmark. Verify with real voice tests before production use.
- The clinic calendar is a demonstration workflow concept; no real clinic calendar is connected. Do not use it for real patient data or healthcare operations.
- The current demo has no multi-user authentication or server-side tenant isolation. It is a single-browser hackathon prototype, not a production SaaS yet.

## API routes

- `POST /api/generate` — Groq structured agent generation.
- `POST /api/reality-lab` — Groq scenario evaluation.
- `POST /api/groq` — server-side Groq connection test.
- `GET|POST /api/workspace` — authenticated user workspace persistence.
- `GET|POST /api/test-runs` — authenticated, user-scoped Reality Lab history.
- `POST /api/elevenlabs` — validates key, fetches voices, creates agent, lists agents and gets signed conversation URLs.

## Project structure

```text
src/
  components/App.svelte       Main application workspace
  layouts/BaseLayout.astro   Global document shell
  lib/api.ts                 JSON API helper
  lib/types.ts               Agent types and starter blueprint
  lib/vault.ts                Browser-side encrypted credential vault
  pages/index.astro          Application entry point
  pages/api/generate.ts      Groq agent generation endpoint
  pages/api/reality-lab.ts   Scenario evaluator endpoint
  pages/api/elevenlabs.ts    ElevenLabs proxy endpoint
```

## Next steps before production

- Add real authentication and per-user authorization.
- Replace the local credential vault with a reviewed credential/session architecture if server-side automation is required.
- Add persistent database storage with tenant isolation and audit logs that never contain secrets.
- Connect real business tools (calendar, CRM) using explicit confirmation and idempotency.
- Add evaluation traces from actual ElevenLabs conversations and regression tests.
- Add rate limiting, request size limits, CSRF/origin protections and a CSP.
- Have security and privacy reviewed before handling real healthcare or personal data.

## Team

Team ZenithCode · VoxFlow
