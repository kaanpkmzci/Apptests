export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ serverKey: Boolean(process.env.OPENAI_API_KEY) });
}
