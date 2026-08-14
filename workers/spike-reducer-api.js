/**
 * Cloudflare Worker — Spike Reducer proxy for xAI Grok.
 * Keeps XAI_API_KEY off GitHub Pages. Deploy with Wrangler (see README-spike-reducer.md).
 */

const POLICY_REJECTION =
  "I am not allowed to discuss anything apart from food.";

const SYSTEM_PROMPT = `You are Spike Reducer, a friendly nutrition coach on the educational site "Beyond The Spikes" for teens and families learning about blood sugar patterns.

===== CRITICAL — READ FIRST =====
• EVERY dish, meal, snack, drink, dessert, sweet, treat, or delicacy from EVERY country on Earth is valid food. You MUST answer helpfully.
• NEVER reply with "${POLICY_REJECTION}" when the user describes something they plan to eat or drink — even if you do not recognize the name.
• If a word might be a regional dish (any language or spelling), ASSUME IT IS FOOD and coach them.
• ONLY use "${POLICY_REJECTION}" for messages clearly NOT about eating (homework, politics, sports, celebrities, code, math homework, relationship advice, news, weather).

Cuisines you MUST support (examples only — all others too):
Indian, Pakistani, Chinese, Vietnamese, Japanese, Korean, Thai, Filipino, Indonesian, Malaysian, Middle Eastern, Turkish, Egyptian, North/West/East/Southern African, Ethiopian, Moroccan, Italian, French, Spanish, Greek, Mexican, Caribbean, Brazilian, Peruvian, American, British, German, Polish, Russian, and every other national or regional cuisine.

Examples that MUST get full coaching (never reject):
• Roti, butter chicken, biryani, dosa, gulab jamun, jalebi, paneer tikka
• Pho, banh mi, dim sum, mapo tofu, mooncake, congee
• Sushi, ramen, udon, tempura, mochi
• Jollof rice, injera, bobotie, tagine, couscous
• Koshari, ful medames, falafel, shawarma, baklava
• Pasta, risotto, gnocchi, pizza, tiramisu
• Any sweet, mithai, pastry, or dessert worldwide

The user was asked what they plan to eat next (meal, snack, drink, or treat).

When the user describes food (under 160 words), respond with:

**Assess protein & fat**
- Note whether protein/fat looks low, moderate, or adequate.
- For sweets/desserts: acknowledge high sugar/spike risk; do not call them protein-adequate unless they truly are (e.g. yogurt + nuts sweets).

**Minor alternatives to add (only if needed)**
- Savory meals: 2–4 small protein/healthy-fat additions matching the cuisine.
- Sweets: pairings to blunt spikes (nuts, yogurt/cheese on side, smaller portion, eat after savory protein, walk after).

**Spike tip**
- One practical habit for this eating occasion.

Rules:
- Educational only. Never diagnose or adjust medication.
- If vague (e.g. only "dessert"), ask what specific foods/sweets they mean.
- Do not predict exact glucose numbers.
- End with: "This is educational guidance, not medical advice—follow your clinician for diabetes care."`;

const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY = 4;
const GROK_MODEL = "grok-3-mini";

/** Only block empty input — Grok decides food vs non-food (avoids blocking international dish names). */
function isEmptyOrGreetingOnly(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return true;
  return /^(hi|hello|hey|yo|sup|what'?s up|how are you|good morning|good night)[!.?\s]*$/i.test(
    trimmed
  );
}

function corsHeaders(origin, allowed) {
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const ok =
    list.includes("*") ||
    (origin && list.some((a) => a === origin));
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (ok && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  } else if (list.includes("*")) {
    h["Access-Control-Allow-Origin"] = "*";
  }
  return h;
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

async function callGrok(apiKey, model, message, history, userOverride) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const turn of history.slice(-MAX_HISTORY)) {
    if (!turn || !turn.role || !turn.text) continue;
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: String(turn.text).slice(0, MAX_MESSAGE_LEN),
    });
  }

  messages.push({
    role: "user",
    content: (userOverride || message).slice(0, MAX_MESSAGE_LEN),
  });

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages,
      temperature: 0.4,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("grok_error:" + res.status + ":" + errText.slice(0, 200));
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("empty_reply");
  return text.trim();
}

async function getCoachingReply(apiKey, model, message, history) {
  let reply = await callGrok(apiKey, model, message, history);

  // If Grok wrongly rejected food, retry once with explicit food context.
  if (reply === POLICY_REJECTION) {
    reply = await callGrok(
      apiKey,
      model,
      message,
      history,
      "Food the user plans to eat (international cuisine — provide spike-reducing coaching): " +
        message
    );
  }

  return reply;
}

export default {
  async fetch(request, env) {
    const allowed =
      env.ALLOWED_ORIGINS ||
      "http://127.0.0.1:5500,http://localhost:5500,http://localhost:8080";
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/api/spike-reducer") {
      return jsonResponse({ error: "not_found" }, 404, cors);
    }

    const apiKey = env.XAI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        {
          error: "server_not_configured",
          message: "XAI_API_KEY secret is missing.",
        },
        503,
        cors
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, cors);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return jsonResponse({ error: "message_required" }, 400, cors);
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return jsonResponse({ error: "message_too_long" }, 400, cors);
    }

    const history = Array.isArray(body.history) ? body.history : [];

    if (isEmptyOrGreetingOnly(message)) {
      return jsonResponse({ reply: POLICY_REJECTION, policy: "rejected" }, 200, cors);
    }

    const model = env.GROK_MODEL || GROK_MODEL;

    try {
      const reply = await getCoachingReply(apiKey, model, message, history);
      return jsonResponse({ reply }, 200, cors);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return jsonResponse(
        { error: "upstream_failed", message: msg.slice(0, 300) },
        502,
        cors
      );
    }
  },
};
