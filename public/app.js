const chatWindow = document.getElementById("chatWindow");
const emptyState = document.getElementById("emptyState");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

const STORAGE_KEY = "chatbot_session";

let sessionId = null;
let history = []; // [{ role: "user"|"model", text }] - mirrors what's shown on screen

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, history }));
}

async function startNewSession() {
  const res = await fetch("/api/session", { method: "POST" });
  const data = await res.json();
  sessionId = data.sessionId;
  history = [];
  saveHistory();
}

async function initSession() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.sessionId && Array.isArray(parsed.history)) {
        sessionId = parsed.sessionId;
        history = parsed.history;
        renderHistory();
        return;
      }
    } catch (err) {
      // fall through to a fresh session on malformed storage
    }
  }
  await startNewSession();
}

function renderHistory() {
  clearChatUI();
  for (const m of history) {
    addMessage(m.role === "model" ? "assistant" : "user", m.text);
  }
}

function clearChatUI() {
  chatWindow.innerHTML = "";
  emptyState.style.display = "block";
  chatWindow.appendChild(emptyState);
}

function addMessage(role, text) {
  emptyState.style.display = "none";

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "user" ? "U" : "A";

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;

  row.appendChild(avatar);
  row.appendChild(content);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return content;
}

function autoResize() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
}

messageInput.addEventListener("input", autoResize);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  autoResize();
  addMessage("user", text);

  sendBtn.disabled = true;
  const thinkingEl = addMessage("assistant", "Thinking...");
  thinkingEl.classList.add("thinking");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `history` lets the backend rehydrate this session if it lost its
      // in-memory copy (e.g. a server restart) while the browser stayed open.
      body: JSON.stringify({ message: text, sessionId, history }),
    });
    const data = await res.json();

    thinkingEl.classList.remove("thinking");
    if (!res.ok) {
      thinkingEl.textContent = data.error || "Something went wrong.";
    } else {
      thinkingEl.textContent = data.reply;
      history.push({ role: "user", text });
      history.push({ role: "model", text: data.reply });
      saveHistory();
    }
  } catch (err) {
    thinkingEl.classList.remove("thinking");
    thinkingEl.textContent = "Network error. Please try again.";
  } finally {
    sendBtn.disabled = false;
  }
});

newChatBtn.addEventListener("click", async () => {
  await startNewSession();
  clearChatUI();
  messageInput.focus();
});

initSession();
