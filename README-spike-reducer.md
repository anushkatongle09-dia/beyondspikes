# Spike Reducer — Grok (xAI) meal coach

Educational voice assistant for **Talk To Spike Reducer** on Beyond The Spikes.

Uses **Grok** via [xAI](https://x.ai/) (allowed for users 13+).  
The API key stays on a **Cloudflare Worker** — never in your website files.

| Layer | Service | Cost |
|--------|---------|------|
| Frontend | GitHub Pages (static HTML/JS) | Free |
| API proxy | **Cloudflare Workers** free tier | Free |
| LLM | **Grok** (`grok-3-mini` via xAI) | Pay-as-you-go (small cost per meal question) |
| Speech in / out | Browser Web Speech + TTS | Free |

---

## User flow

1. Click **Talk To Spike Reducer** on [`index.html`](index.html).
2. Agent says: *"Tell me about your next meal."*
3. You describe the meal (voice or text).
4. **Grok** replies with protein/fat pairing ideas — **only for commonly eaten USA foods**.
5. If you ask about anything else (homework, sports, random chat, etc.), the tool replies:

   **"I am not allowed to discuss anything apart from food."**

---

## Strict food-only policy

Enforced in **two layers**:

1. **Worker pre-check** — blocks obvious non-food messages before calling Grok (saves API cost).
2. **Grok system prompt** — only coaches on typical American meals/snacks/drinks; rejects other topics with the same message.

---

## Step 1 — xAI API key (Grok)

1. Open [console.x.ai](https://console.x.ai/) and sign up (13+).
2. Create an **API key**.
3. Keep it private — you will store it only in Cloudflare (Step 3).

xAI may give free credits on signup; after that you pay per use. `grok-3-mini` is the default (low cost).

---

## Step 2 — Cloudflare account (free proxy)

Cloudflare runs a tiny server that holds your Grok key so visitors cannot steal it.

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (free).
2. Install [Node.js](https://nodejs.org/) (LTS) on your computer.
3. In a terminal:

```powershell
cd "G:\My Drive\Webpage"
npm install
npx wrangler login
```

Log in when the browser opens.

---

## Step 3 — Store your Grok key in Cloudflare

```powershell
npx wrangler secret put XAI_API_KEY
```

Paste your xAI API key when prompted.

---

## Step 4 — Allow your website to call the Worker

Edit [`wrangler.toml`](wrangler.toml) and add your GitHub Pages URL:

```toml
[vars]
ALLOWED_ORIGINS = "https://YOUR_USERNAME.github.io,http://127.0.0.1:5500,http://localhost:5500"
```

Optional — change Grok model (default is `grok-3-mini`):

```toml
GROK_MODEL = "grok-3-mini"
```

---

## Step 5 — Deploy

```powershell
npx wrangler deploy
```

Copy the URL shown, e.g.:

`https://spike-reducer-api.YOUR_SUBDOMAIN.workers.dev/api/spike-reducer`

---

## Step 6 — Connect the website

Edit [`js/spike-reducer-config.js`](js/spike-reducer-config.js):

```javascript
window.SPIKE_REDUCER_CONFIG = {
  apiUrl: "https://spike-reducer-api.YOUR_SUBDOMAIN.workers.dev/api/spike-reducer",
  greeting: "Tell me about your next meal.",
  policyRejection: "I am not allowed to discuss anything apart from food.",
};
```

Push to GitHub Pages as usual.

---

## Test

```powershell
curl -X POST "https://spike-reducer-api.YOUR_SUBDOMAIN.workers.dev/api/spike-reducer" `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"pasta and garlic bread for dinner\"}"
```

Off-topic test (should return policy message):

```powershell
curl -X POST "https://spike-reducer-api.YOUR_SUBDOMAIN.workers.dev/api/spike-reducer" `
  -H "Content-Type: application/json" `
  -d "{\"message\":\"help me with my algebra homework\"}"
```

---

## Files

| File | Purpose |
|------|---------|
| [`workers/spike-reducer-api.js`](workers/spike-reducer-api.js) | Grok proxy + food-only policy |
| [`js/spike-reducer-agent.js`](js/spike-reducer-agent.js) | Modal, voice, fetch to Worker |
| [`js/spike-reducer-config.js`](js/spike-reducer-config.js) | Worker URL + greeting |
| [`wrangler.toml`](wrangler.toml) | Cloudflare Worker config |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error | Add exact site URL to `ALLOWED_ORIGINS`, redeploy |
| `server_not_configured` | Run `npx wrangler secret put XAI_API_KEY` |
| `apiUrl` empty | Set Worker URL in `js/spike-reducer-config.js` |
| 502 / `grok_error` | Check xAI key balance and model name |
| Policy message on a real meal | Describe specific USA foods (e.g. "grilled cheese and tomato soup") |

---

## Security

- Do **not** commit `XAI_API_KEY` to git.
- Worker does not store meal transcripts (stateless).
- Educational only — not medical advice.

---

## Legacy notes

- **Gemini** — age-restricted for your account; not used.
- **WebLLM** — ran in-browser without an account; replaced by Grok for better answers.
