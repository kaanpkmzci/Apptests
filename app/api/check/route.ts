import { errorResponse, resolveKey } from "@/lib/openai";

export const runtime = "nodejs";

/** Verifies that the key (server env or the one saved in the app) is accepted by OpenAI. */
export async function POST(req: Request) {
  try {
    const key = resolveKey(req);
    const res = await fetch("https://api.openai.com/v1/models/gpt-4o-transcribe", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) return Response.json({ error: "invalid_key" }, { status: 401 });
    if (res.status === 404) return Response.json({ error: "no_model_access" }, { status: 403 });
    if (!res.ok) return Response.json({ error: `upstream_${res.status}` }, { status: 502 });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
