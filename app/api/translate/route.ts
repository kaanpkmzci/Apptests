import { errorResponse, resolveKey, transcribe, translate, type Turn } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const key = resolveKey(req);
    const form = await req.formData();
    const audio = form.get("audio");
    const from = String(form.get("from") || "");
    const to = String(form.get("to") || "");
    let context: Turn[] = [];
    try {
      context = JSON.parse(String(form.get("context") || "[]")).slice(-6);
    } catch {}

    if (!(audio instanceof Blob) || audio.size < 1000 || !from || !to) {
      return Response.json({ error: "no_speech" }, { status: 400 });
    }

    const name = audio instanceof File && audio.name ? audio.name : "speech.webm";
    const source = await transcribe(key, audio, name, from);
    if (!source) return Response.json({ error: "no_speech" }, { status: 422 });

    const translation = await translate(key, source, from, to, context);
    return Response.json({ source, translation });
  } catch (err) {
    return errorResponse(err);
  }
}
