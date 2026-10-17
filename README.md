# Voice Agent

A full-stack AI voice assistant. Speak, see the live transcript, and hear the answer read back while it is still being generated.

```text
Microphone ──▶ SpeechRecognition (browser) ──▶ text
                                                │
                              POST /api/chat (streamed) ──▶ Express ──▶ Gemini AI
                                                │
                       SpeechSynthesis (browser) ◀── reply, spoken sentence by sentence
```

- **Frontend:** React, Vite, plain CSS
- **Backend:** Node.js, Express (holds the API key and relays the streamed LLM reply)
- **LLM:** Google Gemini (`gemini-2.5-flash` by default)
- **Speech in / out:** The browser's Web Speech API (no extra service or cost)

## Features

- Real microphone capture and speech-to-text with a live interim transcript
- Streaming Gemini replies, spoken sentence by sentence so speech starts before the full answer exists
- Animated microphone, waveform (real mic levels while listening), and listening / thinking / speaking status
- Session conversation history, sent to the model as context
- Start, finish, cancel, and interrupt controls; talking over the assistant interrupts it
- Optional hands-free mode that listens again after each reply
- Error handling for blocked or missing microphones, no speech detected, offline status, server errors, invalid API keys, rate limits, and interrupted streams

## Quick start

Requires Node.js 20 or newer and a [Google Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone <your-repo-url> voice-ai-agent
cd voice-ai-agent
npm run install:all
```

Create `server/.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
```

Keep your actual API key private. Never commit `server/.env` to GitHub.

Start the application:

```bash
npm run dev
```

Open http://localhost:5173 in **Chrome or Edge**, allow microphone access, and tap the microphone.

## Controls

| Action | How |
| --- | --- |
| Start talking | Tap the microphone |
| Finish and send | Tap the microphone again (it may also end automatically after a pause) |
| Discard a recording | Cancel recording or press Esc |
| Interrupt the assistant | Tap the stop button, press Esc, or start talking again |
| Listen again automatically | Turn on Hands-free |

## Configuration

`server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | None | Required. Kept on the server |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for replies, if supported by the implementation |
| `PORT` | `8787` | API server port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origins, comma-separated |

`client/.env` (only when the API is hosted on another domain):

```env
VITE_API_URL=https://your-api.example.com
```

## Project structure

```text
server/src/
  index.js      Express app, validation, rate limiting, streaming endpoint
  gemini.js     Streaming call to Gemini and error handling
  prompt.js     System prompt tuned for spoken replies

client/src/
  hooks/useVoiceAgent.js   Voice loop and its state machine
  lib/api.js               Streaming fetch to the backend
  lib/tts.js                Sentence-by-sentence speech queue
  components/               MicButton, Waveform, StatusPill, Transcript
```

The actual filenames and features may differ depending on your current implementation.

## Deployment

1. **Backend:** Deploy to Render, Railway, Fly.io, or another Node.js host. Set the backend root directory to `server` if deploying the server separately. Configure `GEMINI_API_KEY`, `PORT` as required by the host, and `CLIENT_ORIGIN` with your frontend URL.
2. **Frontend:** Deploy to Vercel, Netlify, Cloudflare Pages, or another static host. Set the root directory to `client`, build command to `npm run build`, output directory to `dist`, and `VITE_API_URL` to your backend URL.
3. Serve the frontend over **HTTPS**. Browsers generally require HTTPS or localhost for microphone access.

## Browser support and limits

- Speech recognition support varies by browser. Chrome and Edge are generally the best starting points; verify support in your target browser.
- Browser speech recognition may send audio to a browser-provider service and may require an internet connection.
- The browser doesn't expose synthesized speech audio to the app, so the waveform during speaking may be animated rather than based on actual speaker output.
- Available voices vary by operating system and browser.

## Roadmap: persistent memory (Mem0 + Qdrant)

For persistent memory across sessions, a possible future approach is:

1. Run Qdrant using Docker.
2. Add Mem0 to the server and configure Qdrant as its vector store.
3. Before each reply, retrieve relevant memories and add them to the system prompt.
4. After each reply, store the exchange so useful facts can persist across sessions.
5. Add a user identifier so each user's memories remain separate.

Other potential upgrades include dedicated speech-to-text and text-to-speech services, support for additional browsers, and server-side conversation sessions.

## Troubleshooting

- **Nothing happens when I tap the microphone:** Check browser support and microphone permissions.
- **Can't reach the server:** Ensure the backend is running on the configured port.
- **API key rejected:** Verify `GEMINI_API_KEY` in `server/.env` and restart the backend.
- **No speech output:** Check that the tab isn't muted and that the browser has loaded its available voices.
- **Gemini errors or rate limits:** Check your API usage and the server logs.
