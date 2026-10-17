
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { SYSTEM_PROMPT } from './prompt.js';
import { streamCompletion, UpstreamError } from './gemini.js';
import mongoose from "mongoose";
import Conversation from './models/Conversation.js';
import multer from 'multer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const app = express();
const PORT = process.env.PORT || 8787;
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((error) => {
    console.error('❌ MongoDB connection failed:', error.message);
  });

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

app.use(cors({ origin: origins }));
app.use(express.json({ limit: '100kb' }));

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new Error('Only PDF files are allowed.'));
    }

    callback(null, true);
  },
});


const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.' },
});

// Validate and limit conversation history.
function sanitize(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const validMessages = messages
    .filter(
      (message) =>
        message &&
        ['user', 'assistant'].includes(message.role) &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
    )
    .slice(-MAX_TURNS)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_CHARS),
    }));

  if (
    validMessages.length === 0 ||
    validMessages[validMessages.length - 1].role !== 'user'
  ) {
    return null;
  }

  return validMessages;
}

// Convert Open-Meteo weather codes into readable descriptions.
function describeWeather(code) {
  const descriptions = {
    0: 'clear sky',
    1: 'mainly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'foggy',
    48: 'foggy with frost',
    51: 'light drizzle',
    53: 'moderate drizzle',
    55: 'dense drizzle',
    56: 'light freezing drizzle',
    57: 'dense freezing drizzle',
    61: 'light rain',
    63: 'moderate rain',
    65: 'heavy rain',
    66: 'light freezing rain',
    67: 'heavy freezing rain',
    71: 'light snow',
    73: 'moderate snow',
    75: 'heavy snow',
    77: 'snow grains',
    80: 'light rain showers',
    81: 'moderate rain showers',
    82: 'heavy rain showers',
    85: 'light snow showers',
    86: 'heavy snow showers',
    95: 'thunderstorm',
    96: 'thunderstorm with light hail',
    99: 'thunderstorm with heavy hail',
  };

  return descriptions[code] || 'variable conditions';
}

// Send a normal answer through the same SSE format as Gemini.
function sendStreamAnswer(res, answer) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ delta: answer })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

// Get current weather and the next day's forecast from Open-Meteo.
async function getWeather(city) {
  const geoUrl = new URL(
    'https://geocoding-api.open-meteo.com/v1/search'
  );

  geoUrl.search = new URLSearchParams({
    name: city,
    count: '1',
    language: 'en',
    format: 'json',
  }).toString();

  const geoResponse = await fetch(geoUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!geoResponse.ok) {
    throw new Error('Weather location lookup failed.');
  }

  const geoData = await geoResponse.json();
  const place = geoData.results?.[0];

  if (!place) {
    return `I couldn't find the city "${city}". Please try another city name.`;
  }

  const weatherUrl = new URL(
    'https://api.open-meteo.com/v1/forecast'
  );

  weatherUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    forecast_days: '2',
    timezone: 'auto',
  }).toString();

  const weatherResponse = await fetch(weatherUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!weatherResponse.ok) {
    throw new Error('Weather forecast request failed.');
  }

  const data = await weatherResponse.json();
  const current = data.current;
  const daily = data.daily;

  if (!current || !daily || daily.time.length < 2) {
    throw new Error('Weather data was incomplete.');
  }

  const todayRain = daily.precipitation_probability_max?.[0];
  const tomorrowRain = daily.precipitation_probability_max?.[1];

  return [
    `Weather for ${place.name}, ${place.country}.`,
    `Current conditions: ${describeWeather(current.weather_code)}.`,
    `Temperature: ${current.temperature_2m}°C, feels like ${current.apparent_temperature}°C.`,
    `Humidity: ${current.relative_humidity_2m}%.`,
    `Wind speed: ${current.wind_speed_10m} km/h.`,
    `Current precipitation: ${current.precipitation} mm.`,
    `Today's forecast: ${describeWeather(daily.weather_code[0])}, with temperatures from ${daily.temperature_2m_min[0]}°C to ${daily.temperature_2m_max[0]}°C.`,
    `Today's maximum precipitation probability: ${todayRain ?? 'unavailable'}%.`,
    `Tomorrow's forecast: ${describeWeather(daily.weather_code[1])}, with temperatures from ${daily.temperature_2m_min[1]}°C to ${daily.temperature_2m_max[1]}°C.`,
    `Tomorrow's maximum precipitation probability: ${tomorrowRain ?? 'unavailable'}%.`,
    'Weather data provided by Open-Meteo.',
  ].join(' ');
}

// Extract a city name from questions such as:
// "What's the weather in Mumbai today?"
// "Will it rain in Delhi tomorrow?"
// "Give me the forecast for London"

function extractCity(message) {
  const match = message.match(
    /\b(?:in|for|at)\s+([a-zA-Z][a-zA-Z .'-]*?)(?=\s+(?:and|&|today|tomorrow|tonight|this week|this weekend|right now|currently)\b|[?!.,]|$)/i
  );

  if (!match) return null;

  const city = match[1].trim();

  if (/^(today|tomorrow|there|here|me|my location)$/i.test(city)) {
    return null;
  }

  return city;
}


// Health check.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

const getUserId = (value) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9-]{1,100}$/.test(value)
    ? value
    : null;

// List conversations for one browser user.
app.get('/api/conversations', async (req, res) => {
  const userId = getUserId(req.query.userId);

  if (!userId) {
    return res.status(400).json({ error: 'Valid userId required.' });
  }

  try {
    const conversations = await Conversation.find({ userId })
      .select('title createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    res.json(conversations);
  } catch (err) {
    console.error('List conversations failed:', err.message);
    res.status(500).json({ error: 'Could not load conversations.' });
  }
});

// Create a new conversation.
app.post('/api/conversations', async (req, res) => {
  const userId = getUserId(req.body?.userId);

  if (!userId) {
    return res.status(400).json({ error: 'Valid userId required.' });
  }

  try {
    const conversation = await Conversation.create({
      userId,
      title: 'New chat',
      messages: [],
    });

    res.status(201).json(conversation);
  } catch (err) {
    console.error('Create conversation failed:', err.message);
    res.status(500).json({ error: 'Could not create conversation.' });
  }
});

// Open a conversation.
app.get('/api/conversations/:id', async (req, res) => {
  const userId = getUserId(req.query.userId);

  if (!userId || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid conversation request.' });
  }

  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId,
    }).lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json(conversation);
  } catch (err) {
    console.error('Open conversation failed:', err.message);
    res.status(500).json({ error: 'Could not open conversation.' });
  }
});

// Save messages and update the conversation title.
app.patch('/api/conversations/:id/messages', async (req, res) => {
  const userId = getUserId(req.body?.userId);
  const messages = req.body?.messages;

  if (!userId || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid conversation request.' });
  }

  if (
    !Array.isArray(messages) ||
    messages.length > 200 ||
    messages.some(
      (m) =>
        !m ||
        !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' ||
        !m.content.trim() ||
        m.content.length > 20000
    )
  ) {
    return res.status(400).json({ error: 'Invalid messages.' });
  }

  try {
    const title =
      messages.find((m) => m.role === 'user')?.content
        ?.trim()
        .slice(0, 60) || 'New chat';

    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { messages, title } },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json(conversation);
  } catch (err) {
    console.error('Save messages failed:', err.message);
    res.status(500).json({ error: 'Could not save messages.' });
  }
});

// Rename a conversation.
app.patch('/api/conversations/:id', async (req, res) => {
  const userId = getUserId(req.body?.userId);
  const title = req.body?.title;

  if (
    !userId ||
    !mongoose.isValidObjectId(req.params.id) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 100
  ) {
    return res.status(400).json({ error: 'Invalid rename request.' });
  }

  try {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { title: title.trim() } },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json(conversation);
  } catch (err) {
    console.error('Rename conversation failed:', err.message);
    res.status(500).json({ error: 'Could not rename conversation.' });
  }
});

// Delete a conversation.
app.delete('/api/conversations/:id', async (req, res) => {
  const userId = getUserId(req.query.userId);

  if (!userId || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid conversation request.' });
  }

  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId,
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete conversation failed:', err.message);
    res.status(500).json({ error: 'Could not delete conversation.' });
  }
});

app.post('/api/documents/upload', (req, res, next) => {
  uploadPdf.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.message || 'PDF upload failed.',
      });
    }

    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Please select a PDF file.',
    });
  }

  // Check the PDF signature rather than trusting its filename.
  if (req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({
      error: 'The uploaded file is not a valid PDF.',
    });
  }

  try {
    const loadingTask = getDocument({
  data: new Uint8Array(req.file.buffer),
  useSystemFonts: true,
});

const parsed = await loadingTask.promise;
const pageTexts = [];

for (let pageNumber = 1; pageNumber <= parsed.numPages; pageNumber++) {
  const page = await parsed.getPage(pageNumber);
  const content = await page.getTextContent();

  pageTexts.push(
    content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
  );
}

const text = pageTexts.join('\n').trim();

    if (!text) {
      return res.status(422).json({
        error: 'No readable text found. This PDF may be scanned or image-only.',
      });
    }

    if (text.length > 150000) {
      return res.status(422).json({
        error: 'This PDF is too long. Please upload a shorter document.',
      });
    }

    return res.json({
      filename: req.file.originalname.replace(/[^\w.-]/g, '_').slice(0, 150),
      pages: parsed.numPages,
      text,
    });
  } catch (err) {
    console.error('PDF extraction failed:', err.message);

    return res.status(422).json({
      error: 'Could not read this PDF. Try another text-based PDF.',
    });
  }
});


// Chat endpoint.
app.post('/api/chat', limiter, async (req, res) => {
  const history = sanitize(req.body?.messages);

  if (!history) {
    return res.status(400).json({
      error: 'Send a messages array that ends with a user message.',
    });
  }

  const latestMessage = history[history.length - 1].content;

  // Handle weather questions directly using live Open-Meteo data.
  const asksWeather =
    /\b(weather|forecast|temperature|will it rain|rain today|rain tomorrow|humidity|wind speed|weather like)\b/i.test(
      latestMessage
    );

  if (asksWeather) {
    const city = extractCity(latestMessage);

    if (!city) {
      return sendStreamAnswer(
        res,
        'Which city should I check the weather for? For example, you can ask: "What is the weather in Mumbai today?"'
      );
    }

    try {
      const answer = await getWeather(city);
      return sendStreamAnswer(res, answer);
    } catch (err) {
      console.error('Weather lookup failed:', err.message);

      return res.status(502).json({
        error:
          'I could not retrieve weather data right now. Please try again.',
      });
    }
  }

  // Handle all non-weather questions with Gemini.
  const controller = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const stream = await streamCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
      ],
      signal: controller.signal,
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    for await (const delta of stream) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.end();
    }

    const message =
      err instanceof UpstreamError
        ? err.message
        : 'Something went wrong on the server.';

    if (!(err instanceof UpstreamError)) {
      console.error(err);
    }

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      return res.end();
    }

    return res
      .status(err instanceof UpstreamError ? err.status : 500)
      .json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Voice agent server listening on http://localhost:${PORT}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      'Warning: GEMINI_API_KEY is not set. Check server/.env.'
    );
  }
});
