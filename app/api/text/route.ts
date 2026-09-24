import { errorResponse, resolveKey, translate } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const key = resolveKey(req);
    const { text, from, to } = await req.json();
    if (!text || !from || !to) return Response.json({ error: "bad_request" }, { status: 400 });
    const translation = await translate(key, String(text).slice(0, 2000), from, to);
    return Response.json({ source: text, translation });
  } catch (err) {
    return errorResponse(err);
  }
}
