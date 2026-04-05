import { json } from "@/server/responses";

export async function readJsonBody<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return {
      ok: true,
      value: (await request.json()) as T,
    };
  } catch {
    return {
      ok: false,
      response: json({ error: "Invalid JSON body." }, 400),
    };
  }
}
