# Voice Agent

A full-stack AI voice assistant. Speak, see the live transcript, and hear the answer read back while it is still being generated.

```
Microphone ──▶ SpeechRecognition (browser) ──▶ text
                                                │
                              POST /api/chat (streamed) ──▶ Express ──▶Gemini
                                                │
                       SpeechSynthesis (browser) ◀── reply, spoken sentence by sentence
```

- **Frontend:** React, Vite, plain CSS
- **Backend:** Node.js, Express (holds the API key, relays the streamed LLM reply)
- **LLM:** Mistral AI (`mistral-small-latest` by default)
- **Speech in / out:** the browser's Web Speech API (no extra service or cost)

## Features

- Real microphone capture and speech-to-text with a live interim transcript
- Streaming LLM replies, spoken sentence by sentence so speech starts before the full answer exists
- Animated mic, waveform (real mic levels while listening), and listening / thinking / speaking status
- Session conversation history, sent to the model as context
- Start, finish, cancel, and interrupt controls; talking over the assistant interrupts it
- Optional hands-free mode that listens again after each reply
- Handled errors: blocked or missing microphone, no speech heard, offline, server down, bad API key, rate limits, dropped streams

## Quick start

Requires Node.js 20 or newer and a [Mistral API key](https://console.mistral.ai/).

```bash
git clone <your-repo-url> voice-ai-agent
cd voice-ai-agent
npm run install:all

cp server/.env.example server/.env
# edit server/.env and set MISTRAL_API_KEY

npm run dev
```

Open http://localhost:5173 in **Chrome, Edge or Safari**, allow microphone access, and tap the microphone.

## Controls

| Action | How |
| --- | --- |
| Start talking | Tap the microphone |
| Finish and send | Tap the microphone again (it also ends on its own after a pause) |
| Discard a recording | Cancel recording, or Esc |
| Interrupt the assistant | Tap the stop button, press Esc, or tap the mic and start talking |
| Listen again automatically | Turn on Hands-free |

## Configuration

`server/.env`

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISTRAL_API_KEY` | none | Required. Stays on the server. |
| `MISTRAL_MODEL` | `mistral-small-latest` | Any Mistral chat model |
| `PORT` | `8787` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origins, comma-separated |

`client/.env` (only for production when the API is on another domain): `VITE_API_URL=https://your-api.example.com`

## Project structure

```
server/src
  index.js      Express app, validation, rate limiting, SSE relay
  mistral.js    Streaming call to Mistral and error mapping
  prompt.js     System prompt tuned for spoken replies
client/src
  hooks/useVoiceAgent.js   The whole voice loop and its state machine
  lib/api.js               Streaming fetch to the backend
  lib/tts.js               Sentence-by-sentence speech queue
  components/              MicButton, Waveform, StatusPill, Transcript
```

## Deployment

1. **Backend** (Render, Railway, Fly.io, any Node host): root `server`, start command `npm start`, set `MISTRAL_API_KEY` and `CLIENT_ORIGIN` (your frontend URL).
2. **Frontend** (Vercel, Netlify, Cloudflare Pages): root `client`, build command `npm run build`, output `dist`, set `VITE_API_URL` to the backend URL.
3. Serve the frontend over **HTTPS**. Browsers only allow microphone access on HTTPS (or localhost).

## Browser support and limits

- Speech recognition works in Chrome, Edge and Safari. Firefox does not implement it, and the app shows a notice instead.
- In Chrome, recognition sends audio to Google's servers, so it needs an internet connection.
- The browser doesn't expose synthesized audio, so the waveform during speaking is an animation. While listening it reflects real microphone input.
- Voices differ by operating system and browser.

## Roadmap: persistent memory (Mem0 + Qdrant)

The backend has a marked hook in `server/src/index.js` before the model call. Plan:

1. Run Qdrant (`docker run -p 6333:6333 qdrant/qdrant`).
2. Add Mem0 to the server configured with Qdrant as its vector store.
3. Before each reply: search memories for the user's message and add the results to the system prompt.
4. After each reply: store the exchange so facts persist across sessions.
5. Add a simple user identifier (sign-in or an anonymous id) so memories are per person.

Other upgrades: a dedicated STT/TTS service for consistent voices and non-Chrome support, and server-side sessions.

## Troubleshooting

- **Nothing happens when I tap the mic:** check the browser supports speech recognition, and that the site has microphone permission.
- **"Can't reach the server":** make sure `npm run dev` started the backend on port 8787.
- **"API key was rejected":** re-check `MISTRAL_API_KEY` in `server/.env` and restart.
- **No speech output:** some browsers load voices late; try again, and check the tab isn't muted.
