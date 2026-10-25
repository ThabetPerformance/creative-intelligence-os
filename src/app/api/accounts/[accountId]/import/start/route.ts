import { StartBody, startImport, jsonRoute } from "@/server/chunked-import";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return jsonRoute(req, StartBody, (body) => startImport(accountId, body));
}
