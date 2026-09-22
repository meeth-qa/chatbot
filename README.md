# Chatbot

A minimal chatbot web app backed by Google's Gemini API, with session-based conversation history.

## Features

- Express server with a static frontend (`public/`)
- Session-based chat history (in-memory, keyed by `sessionId`)
- Automatic fallback across a pool of Gemini models if one is rate-limited or unavailable

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Create a `.env` file in the project root:
   ```
   API_KEY=your_gemini_api_key
   PORT=3000
   MODEL_POOL=gemini-flash-latest,gemini-3.6-flash,gemini-3.1-flash-lite
   ```
   Only `API_KEY` is required; `PORT` and `MODEL_POOL` are optional.
3. Start the server:
   ```
   npm start
   ```
4. Open `http://localhost:3000` in your browser.

## API

- `POST /api/session` — starts a new chat session, returns `{ sessionId }`
- `POST /api/chat` — sends a message
  - Body: `{ message, sessionId, history? }`
  - Response: `{ reply }`
