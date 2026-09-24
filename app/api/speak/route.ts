import { errorResponse, resolveKey, speak } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const key = resolveKey(req);
    const { text, lang } = await req.json();
    if (!text || !lang) return Response.json({ error: "bad_request" }, { status: 400 });
    const upstream = await speak(key, String(text).slice(0, 2000), lang);
    return new Response(upstream.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
