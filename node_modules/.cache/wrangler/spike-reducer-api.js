/**
 * Cloudflare Worker — Spike Reducer proxy for xAI Grok.
 * Keeps XAI_API_KEY off GitHub Pages. Deploy with Wrangler (see README-spike-reducer.md).
 */

const POLICY_REJECTION =
  "I am not allowed to discuss anything apart from food.";

const SYSTEM_PROMPT = `You are Spike Reducer, a friendly nutrition coach on the educational site "Beyond The Spikes" for teens and families learning about blood sugar patterns.

STRICT POLICY (never break):
- You ONLY discuss commonly consumed foods in the United States (typical American meals, snacks, and drinks).
- The user was asked: "Tell me about your next meal."
- If the message is NOT about a meal, snack, or drink commonly eaten in the USA, reply with EXACTLY: "${POLICY_REJECTION}"
- If the message is about homework, politics, sports, celebrities, code, math, relationships, news, or any non-food topic, reply with EXACTLY: "${POLICY_REJECTION}"
- Do not discuss exotic or region-specific cuisines outside typical USA eating patterns unless the user clearly describes an American-style meal.

When the user DOES describe a valid USA meal/snack/drink (under 160 words):

**Assess protein & fat**
- Briefly note whether this meal looks low, moderate, or already rich in protein/fat.
- If the meal already has plenty of protein (and some fat), say clearly that the meal looks adequate and appropriate for steadier energy — congratulate them, then offer at most one optional fine-tune (fiber, vinegar, meal order, or a short walk). Do NOT pile on add-ons.

**Minor alternatives to add (only if needed)**
- Suggest 2–4 small, easy additions or swaps of protein and/or healthy fat (e.g. eggs, Greek yogurt, cheese, nuts, seeds, peanut butter, avocado, olive oil, beans, lean meat, tofu).
- Keep ideas minor and practical — not a full meal rewrite.
- Prefer additions that pair with what they already chose.

**Spike tip**
- One short habit for this meal (eat protein/veg first, add vinegar, walk 10 minutes after, etc.).

Rules:
- Educational only. Never diagnose, prescribe, or adjust insulin/medication.
- If the meal is too vague (e.g. just "lunch"), ask one short clarifying question about what USA foods they plan to eat.
- Do not claim to predict exact blood sugar numbers.
- End food answers with: "This is educational guidance, not medical advice—follow your clinician for diabetes care."`;

const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY = 4;
const GROK_MODEL = "grok-3-mini";

const FOOD_WORDS = new Set([
  "meal", "meals", "breakfast", "lunch", "dinner", "snack", "snacks", "brunch",
  "food", "eat", "eating", "ate", "drink", "drinks", "beverage", "plate", "bowl",
  "sandwich", "burger", "pizza", "pasta", "rice", "bread", "toast", "bagel",
  "cereal", "oatmeal", "pancake", "pancakes", "waffle", "waffles", "egg", "eggs",
  "bacon", "sausage", "chicken", "beef", "steak", "pork", "turkey", "fish",
  "salmon", "tuna", "shrimp", "salad", "soup", "taco", "tacos", "burrito",
  "quesadilla", "nachos", "hotdog", "hot dog", "fries", "chips", "cookie",
  "cookies", "cake", "donut", "doughnut", "muffin", "yogurt", "milk", "cheese",
  "butter", "peanut butter", "jelly", "jam", "apple", "banana", "orange",
  "grapes", "fruit", "fruits", "vegetable", "vegetables", "veggies", "broccoli",
  "carrot", "carrots", "potato", "potatoes", "mashed", "mac and cheese",
  "macaroni", "noodles", "ramen", "sushi", "smoothie", "shake", "milkshake",
  "juice", "soda", "pop", "coffee", "latte", "tea", "water", "protein",
  "granola", "bar", "bars", "wrap", "tortilla", "beans", "corn", "peas",
  "avocado", "nuts", "almonds", "cashews", "ice cream", "frozen", "leftovers",
  "microwave", "grilled", "fried", "baked", "roasted", "pbj", "pb&j",
  "chick-fil-a", "mcdonalds", "starbucks", "subway", "chipotle", "wendys",
  "taco bell", "kfc", "dunkin", "panera", "in-n-out", "five guys",
]);

const OFF_TOPIC_PATTERNS = [
  /\b(homework|algebra|calculus|equation|essay|exam|test|school project)\b/i,
  /\b(president|election|politic|democrat|republican|war|government)\b/i,
  /\b(bitcoin|crypto|stock market|invest|trading)\b/i,
  /\b(write (me )?(a )?(story|poem|song|code|script|essay))\b/i,
  /\b(who is|what is the capital|when was|tell me about (?!my|the meal|breakfast|lunch|dinner|food))\b/i,
  /\b(python|javascript|html|css|programming|debug|function\s+\w+\s*\()\b/i,
  /\b(girlfriend|boyfriend|dating|crush|relationship advice)\b/i,
  /\b(nba|nfl|mlb|soccer game|football game|basketball game)\b/i,
  /\b(movie|netflix|tiktok|instagram|celebrity|influencer)\b/i,
  /\b(weather forecast|temperature tomorrow|news today)\b/i,
  /\b(hack|password|credit card|social security)\b/i,
];

function normalize(text) {
  return String(text).toLowerCase().replace(/[^\w\s&'-]/g, " ").replace(/\s+/g, " ").trim();
}

function countFoodSignals(text) {
  const norm = normalize(text);
  let hits = 0;
  for (const word of FOOD_WORDS) {
    if (norm.includes(word)) hits++;
  }
  return hits;
}

function looksOffTopic(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return true;

  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  const foodHits = countFoodSignals(trimmed);

  if (foodHits >= 1) return false;

  if (/^(hi|hello|hey|yo|sup|what'?s up|how are you|good morning|good night)\b/i.test(trimmed)) {
    return true;
  }

  if (/\?\s*$/.test(trimmed)) return true;

  if (trimmed.length < 12) return true;

  // Longer free-text might describe food without keywords — let Grok decide.
  if (trimmed.length >= 40) return false;

  return true;
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

async function callGrok(apiKey, model, message, history) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const turn of history.slice(-MAX_HISTORY)) {
    if (!turn || !turn.role || !turn.text) continue;
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: String(turn.text).slice(0, MAX_MESSAGE_LEN),
    });
  }

  messages.push({ role: "user", content: message.slice(0, MAX_MESSAGE_LEN) });

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: model,
      messages,
      temperature: 0.5,
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

    if (looksOffTopic(message)) {
      return jsonResponse({ reply: POLICY_REJECTION, policy: "rejected" }, 200, cors);
    }

    const model = env.GROK_MODEL || GROK_MODEL;

    try {
      const reply = await callGrok(apiKey, model, message, history);
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
