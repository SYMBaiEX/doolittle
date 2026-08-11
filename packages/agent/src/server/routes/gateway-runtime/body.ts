import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

export async function readJsonBody<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const parsed = await readJsonObjectBody(request);
  return parsed.ok
    ? { ok: true, value: parsed.value as T }
    : {
        ok: false,
        response: json({ error: "Invalid JSON body." }, 400),
      };
}
