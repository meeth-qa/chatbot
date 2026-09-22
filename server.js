require("dotenv").config();
const express = require("express");
const crypto = require("crypto");

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("Missing API_KEY in .env file");
  process.exit(1);
}

// Pool of models to try in order. If one is out of quota / rate-limited,
// the next one in the list is used automatically.
const MODEL_POOL = (
  process.env.MODEL_POOL || "gemini-flash-latest,gemini-3.6-flash,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function buildSystemPrompt() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return (
    `Today's date is ${today}. ` +
    "You are a helpful, friendly assistant. Answer clearly and concisely. " +
    "Use the prior conversation to understand follow-up questions and references " +
    "like 'it', 'that', or 'the second one'."
  );
}

const app = express();
app.use(express.json());
app.use(express.static("public"));

// In-memory store: sessionId -> [{ role: "user"|"model", text }]
const sessions = new Map();

function getHistory(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  return sessions.get(sessionId);
}

async function callGemini(model, contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt() }] },
      contents,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`Gemini request failed (${res.status}): ${errText}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) {
    const err = new Error("Empty response from model");
    err.status = 502;
    throw err;
  }
  return text;
}

// Try each model in the pool until one succeeds.
async function generateReply(contents) {
  let lastError;
  for (const model of MODEL_POOL) {
    try {
      return await callGemini(model, contents);
    } catch (err) {
      lastError = err;
      // Quota/rate-limit (429), server errors (5xx), or a model that no
      // longer exists/was renamed (404) -> try the next model in the pool.
      const retryable = err.status === 429 || err.status === 404 || err.status >= 500;
      console.warn(`Model "${model}" failed: ${err.message}`);
      if (!retryable) throw err;
    }
  }
  throw lastError || new Error("All models in the pool failed");
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId, history: clientHistory } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const history = getHistory(sessionId);

    // The server keeps history in memory only, so a restart loses it while
    // the browser (which caches it in localStorage) still has it. If this
    // session is unknown to us but the client sent its cached history,
    // trust it to rehydrate the session instead of losing context.
    if (
      history.length === 0 &&
      Array.isArray(clientHistory) &&
      clientHistory.every(
        (m) =>
          m &&
          (m.role === "user" || m.role === "model") &&
          typeof m.text === "string"
      )
    ) {
      history.push(...clientHistory);
    }

    history.push({ role: "user", text: message });

    const contents = history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const reply = await generateReply(contents);
    history.push({ role: "model", text: reply });

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate a response. Please try again." });
  }
});

// Start a brand new session (fresh history, no memory of previous ones).
app.post("/api/session", (req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, []);
  res.json({ sessionId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chatbot server running at http://localhost:${PORT}`);
});
