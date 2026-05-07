import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;

    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- In-memory LRU cache for generated TTS clips ---
// Identical narration text never hits ElevenLabs twice.
const VOICE_CACHE_MAX = 256;
const voiceCache = new Map();

function cacheKey({ voiceId, modelId, text }) {
  return createHash("sha1").update(`${voiceId}|${modelId}|${text}`).digest("hex");
}

function cacheGet(key) {
  if (!voiceCache.has(key)) return null;
  const buf = voiceCache.get(key);
  voiceCache.delete(key);
  voiceCache.set(key, buf); // bump to most-recent
  return buf;
}

function cacheSet(key, buf) {
  if (voiceCache.has(key)) voiceCache.delete(key);
  voiceCache.set(key, buf);
  while (voiceCache.size > VOICE_CACHE_MAX) {
    const oldest = voiceCache.keys().next().value;
    voiceCache.delete(oldest);
  }
}

async function handleVoice(req, res) {
  if (req.method !== "POST") {
    send(res, 405, "Method not allowed");
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    send(res, 503, "ELEVENLABS_API_KEY is not configured.");
    return;
  }

  let parsed;
  try {
    parsed = await readJson(req);
  } catch {
    send(res, 400, "Invalid JSON.");
    return;
  }

  const input = String(parsed.text || "").slice(0, 1800).trim();
  if (!input) {
    send(res, 400, "Missing narration text.");
    return;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "19STyYD15bswVz51nqLf";
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_v3";
  const key = cacheKey({ voiceId, modelId, text: input });

  // Cache hit — serve immediately.
  const cached = cacheGet(key);
  if (cached) {
    res.writeHead(200, {
      "content-type": "audio/mpeg",
      "content-length": String(cached.length),
      "cache-control": "public, max-age=31536000, immutable",
      "x-cache": "HIT",
    });
    res.end(cached);
    return;
  }

  // Use ElevenLabs streaming endpoint so the browser can begin decoding
  // before the upstream finishes generating the entire clip.
  let upstream;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      upstream = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: input,
            model_id: modelId,
            voice_settings: {
              stability: 0.52,
              similarity_boost: 0.85,
              style: 0.18,
              use_speaker_boost: true,
              speed: 1.05,
            },
          }),
        }
      );
    } catch (error) {
      if (attempt === 1) {
        console.error("ElevenLabs network error:", error);
        send(res, 502, "Voice upstream unreachable.");
        return;
      }
      await wait(800);
      continue;
    }

    if (upstream.status !== 429) break;
    await wait(800 * (attempt + 1));
  }

  if (!upstream || !upstream.ok) {
    const status = upstream?.status ?? 502;
    const errorText = upstream ? await upstream.text().catch(() => "") : "";
    if (errorText) console.error(`ElevenLabs error ${status}: ${errorText}`);
    send(res, status, "Voice generation failed.");
    return;
  }

  res.writeHead(200, {
    "content-type": "audio/mpeg",
    "cache-control": "public, max-age=31536000, immutable",
    "x-cache": "MISS",
  });

  // Tee the upstream stream: pipe to the client AND collect into a buffer
  // so the next request for the same text is a cache hit.
  const reader = upstream.body.getReader();
  const chunks = [];
  let clientGone = false;

  res.on("close", () => {
    if (!res.writableEnded) clientGone = true;
  });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      chunks.push(buf);
      if (clientGone) continue; // keep draining upstream so cache still populates
      const ok = res.write(buf);
      if (!ok) await new Promise((r) => res.once("drain", r));
    }
  } catch (error) {
    console.error("Voice stream error:", error);
  } finally {
    if (!res.writableEnded) res.end();
    if (chunks.length) {
      const full = Buffer.concat(chunks);
      if (full.length > 0) cacheSet(key, full);
    }
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);

  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/voice") {
    await handleVoice(req, res);
    return;
  }

  if (url.pathname === "/sor") {
    const sorPath = join(root, "sor.html");
    if (existsSync(sorPath)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      createReadStream(sorPath).pipe(res);
      return;
    }
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolved = normalize(join(root, decodeURIComponent(pathname)));

  if (!resolved.startsWith(root) || !existsSync(resolved) || !statSync(resolved).isFile()) {
    send(res, 404, "Not found");
    return;
  }

  res.writeHead(200, { "content-type": types[extname(resolved)] || "application/octet-stream" });
  createReadStream(resolved).pipe(res);
}).listen(port, host, () => {
  console.log(`Income Growth Bucket Diagram running at http://${host}:${port}`);
});
