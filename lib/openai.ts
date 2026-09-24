import { getLang } from "./languages";

const OPENAI = "https://api.openai.com/v1";

export const MODELS = {
  transcribe: process.env.TRANSCRIBE_MODEL || "gpt-4o-transcribe",
  translate: process.env.TRANSLATE_MODEL || "gpt-4.1",
  tts: process.env.TTS_MODEL || "gpt-4o-mini-tts",
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Server key wins; otherwise fall back to a key the user saved in the app's settings. */
export function resolveKey(req: Request): string {
  const key = process.env.OPENAI_API_KEY || req.headers.get("x-openai-key") || "";
  if (!key) throw new ApiError(401, "missing_key");
  return key;
}

async function check(res: Response) {
  if (res.ok) return;
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? "";
  } catch {}
  if (res.status === 401) throw new ApiError(401, "invalid_key");
  if (res.status === 429) throw new ApiError(429, "rate_limited");
  throw new ApiError(502, detail || `upstream_${res.status}`);
}

export async function transcribe(key: string, audio: Blob, filename: string, lang: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", MODELS.transcribe);
  form.append("language", lang);
  form.append("response_format", "json");
  // A short prompt nudges the model toward conversational, everyday speech.
  form.append(
    "prompt",
    `Casual spoken ${getLang(lang).name} between a traveler and a local (taxi, restaurant, bar, directions, prices, addresses).`
  );
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  await check(res);
  const data = await res.json();
  return (data.text ?? "").trim();
}

export type Turn = { from: string; text: string };

export async function translate(
  key: string,
  text: string,
  from: string,
  to: string,
  context: Turn[] = []
): Promise<string> {
  const src = getLang(from).name;
  const dst = getLang(to).name;
  const system = [
    `You are a live interpreter helping a traveler talk face to face with a local. Translate from ${src} into ${dst}.`,
    "Rules:",
    "- Output ONLY the translation. No quotes, notes, romanization or explanations.",
    "- Sound like a native speaker talking out loud: natural, warm, polite, concise.",
    "- Keep names, addresses, street numbers, prices, times and phone numbers exact.",
    "- Fix obvious speech-recognition slips using context, but never add information.",
    "- If the input is already in the target language, return it unchanged.",
  ].join("\n");

  const ctx = context.length
    ? "Recent conversation for context (do not translate this):\n" +
      context.map((t) => `[${getLang(t.from).name}] ${t.text}`).join("\n") +
      "\n\n"
    : "";

  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELS.translate,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${ctx}Translate this:\n${text}` },
      ],
    }),
  });
  await check(res);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function speak(key: string, text: string, lang: string): Promise<Response> {
  const res = await fetch(`${OPENAI}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELS.tts,
      voice: "coral",
      input: text,
      response_format: "mp3",
      instructions: `Speak in natural, native ${getLang(lang).name}. Friendly and clear, a moderate pace, like a helpful local. Pronounce numbers and addresses carefully.`,
    }),
  });
  await check(res);
  return res;
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "server_error" }, { status: 500 });
}
