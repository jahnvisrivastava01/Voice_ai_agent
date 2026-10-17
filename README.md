# Voice Agent

A full-stack AI voice assistant. Speak, see the live transcript, and hear the answer read back while it is still being generated.

```text
Microphone ──▶ SpeechRecognition (browser) ──▶ text
                                                │
                              POST /api/chat (streamed)
                                                │
                                                ▼
                                      Express Backend
                                                │
                                                ▼
                                             Gemini
                                                │
                       SpeechSynthesis (browser) ◀── streamed reply
```

## Features

- **Real-time voice interaction:** Capture microphone input and display live speech-to-text transcripts.
- **Streaming AI responses:** Gemini replies stream into the interface, with speech playback starting sentence by sentence.
- **Live weather forecasts:** Retrieve current conditions and forecasts using the Open-Meteo API, without requiring a separate API key.
- **Animated interface:** Microphone animation, waveform visualization, and listening, thinking, and speaking status indicators.
- **Conversation context:** Session conversation history is sent to Gemini.
- **Voice controls:** Start, finish, cancel, and interrupt interactions.
- **Hands-free mode:** Automatically resumes listening after the assistant finishes speaking.
- **Error handling:** Handles microphone permissions, missing speech recognition, network failures, invalid API keys, rate limits, and interrupted streams.

## Tech Stack

- **Frontend:** React, Vite, plain CSS
- **Backend:** Node.js, Express
- **AI model:** Google Gemini API (`gemini-2.5-flash` by default)
- **Weather:** Open-Meteo geocoding and forecast APIs
- **Speech input/output:** Browser Web Speech API
- **Streaming:** Server-Sent Events (SSE)

## Quick Start

### Requirements

- Node.js 20 or newer
- A [Google Gemini API key](https://aistudio.google.com/apikey)
- Chrome, Edge, or Safari for supported speech recognition

### Installation

Clone your repository and install dependencies:

```bash
git clone <your-repo-url> voice-agent
cd voice-agent
npm run install:all
```

Create your server environment file by copying the example:

```bash
cp server/.env.example server/.env
```

On Windows Command Prompt, use:

```cmd
copy server\.env.example server\.env
```

Edit `server/.env` and add your Gemini API key:

```dotenv
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=8787
CLIENT_ORIGIN=http://localhost:5173
```

Replace the placeholder with your actual API key. Never commit your real `.env` file to GitHub.

Start the application:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser, allow microphone access, and tap the microphone to begin.

## Controls

| Action | How |
| --- | --- |
| Start talking | Tap the microphone |
| Finish and send | Tap the microphone again or let the pause detection finish |
| Discard a recording | Cancel recording or press Esc |
| Interrupt the assistant | Tap Stop, press Esc, or start speaking again |
| Enable automatic listening | Turn on Hands-free mode |

## Configuration

### Server environment

Configure these variables in `server/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | None | Required for Gemini. Keep it private on the server. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used to generate replies. |
| `PORT` | `8787` | Backend server port. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed frontend origin or comma-separated origins. |

### Frontend environment

When the frontend and backend are deployed to different domains, configure `client/.env`:

```dotenv
VITE_API_URL=https://your-backend-url.example.com
```

Use the actual deployed backend URL. The frontend must be configured to use this variable in its API client.

## Project Structure

```text
voice-agent/
├── client/
│   └── src/
│       ├── hooks/
│       │   └── useVoiceAgent.js
│       ├── lib/
│       │   ├── api.js
│       │   └── tts.js
│       ├── components/
│       └── App.jsx
├── server/
│   └── src/
│       ├── index.js
│       ├── gemini.js
│       └── prompt.js
├── package.json
└── README.md
```

- `server/src/index.js` — Express API, input validation, rate limiting, SSE streaming, and weather routing.
- `server/src/gemini.js` — Gemini API integration and streaming response handling.
- `server/src/prompt.js` — System prompt optimized for spoken responses.
- `client/src/hooks/useVoiceAgent.js` — Voice interaction loop and state management.
- `client/src/lib/api.js` — Streaming requests to the backend.
- `client/src/lib/tts.js` — Sentence-by-sentence speech synthesis.
- `client/src/components/` — Microphone, waveform, status, and transcript components.

> If your integration file is still named `mistral.js`, rename it to `gemini.js` and update its import in `server/src/index.js`.

## Deployment

### 1. Deploy the backend

You can use Render, Railway, Fly.io, or another Node.js hosting provider.

Configure:

- **Root directory:** `server`
- **Build/install command:** `npm install`
- **Start command:** `npm start`

Add these environment variables in your hosting dashboard:

```dotenv
GEMINI_API_KEY=your_actual_key
GEMINI_MODEL=gemini-2.5-flash
CLIENT_ORIGIN=https://your-frontend-domain.example.com
```

Set `PORT` only if your hosting provider requires it; otherwise, let the platform supply it.

### 2. Deploy the frontend

You can use Vercel, Netlify, or Cloudflare Pages.

Configure:

- **Root directory:** `client`
- **Build command:** `npm run build`
- **Output directory:** `dist`

Add this environment variable:

```dotenv
VITE_API_URL=https://your-backend-url.example.com
```

Make sure the frontend API client uses `VITE_API_URL` when configured and falls back to the local backend during development.

### 3. Verify deployment

- Open the deployed frontend over HTTPS.
- Grant microphone permission.
- Test a normal AI question.
- Test a weather question, such as "What's the weather in Mumbai today?"
- Confirm that the backend allows requests from the deployed frontend domain.

## Browser Support and Limitations

- Speech recognition support varies by browser. Chrome and Edge generally support it; Safari support depends on version and platform. Firefox does not currently provide the same built-in Web Speech recognition support.
- Browser speech recognition may send audio to a browser-provider service and requires an internet connection.
- The browser does not expose synthesized speech audio for direct waveform analysis, so speaking animations may be simulated.
- Available voices vary by operating system and browser.
- Gemini API usage is subject to Google's quotas, model availability, and pricing.
- Open-Meteo provides weather data; availability and forecast accuracy depend on its service and underlying weather models.

## Roadmap: Persistent Memory

Potential future improvements include Mem0 and Qdrant for persistent conversational memory.

1. Run Qdrant locally or use a hosted instance.
2. Integrate a memory service with the backend.
3. Retrieve relevant memories before generating a reply.
4. Store useful conversation facts after each interaction.
5. Add authentication or anonymous user identifiers to keep memories separated between users.

Other planned improvements include dedicated speech-to-text and text-to-speech services, user accounts, persistent sessions, and expanded weather capabilities.

## Troubleshooting

- **Microphone does nothing:** Check browser support and microphone permissions.
- **Can't reach the server:** Verify the backend is running and listening on the configured port.
- **Gemini API key rejected:** Check `GEMINI_API_KEY` in `server/.env` and restart the server.
- **Weather lookup fails:** Check your internet connection and the Open-Meteo service.
- **No speech output:** Check browser audio settings and try again after voices load.
- **CORS error after deployment:** Ensure `CLIENT_ORIGIN` matches your deployed frontend origin.
- **Frontend cannot reach deployed backend:** Check `VITE_API_URL` and rebuild the frontend after changing it.

## Security

- Never commit `.env` files or API keys.
- Keep `GEMINI_API_KEY` on the backend; never prefix it with `VITE_`.
- Use environment variables for production secrets.
- Keep dependencies updated and apply appropriate API rate limits.
