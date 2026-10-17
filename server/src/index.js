
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { SYSTEM_PROMPT } from './prompt.js';
import { streamCompletion, UpstreamError } from './mistral.js';

const app = express();
const PORT = process.env.PORT || 8787;
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', 1);

app.use(cors({ origin: origins }));
app.use(express.json({ limit: '100kb' }));

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
    /\b(?:in|for|at)\s+([a-zA-Z][a-zA-Z .'-]*?)(?=\s+(?:today|tomorrow|tonight|this week|this weekend|right now|currently)\b|[?!.,]|$)/i
  );

  if (!match) {
    return null;
  }

  const city = match[1].trim();

  // Avoid treating common question words as a city.
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
