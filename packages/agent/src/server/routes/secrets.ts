import type { AppContext } from "../../runtime/bootstrap/index";
import {
  getEffectiveSecret,
  listEffectiveSecretKeys,
  setEffectiveSecret,
} from "../../runtime/native/service-bridge/autocoder/index";
import { readJsonObjectBody } from "../request-body";
import { json } from "../responses";

async function readSecretBody(request: Request) {
  const parsed = await readJsonObjectBody(request);
  return parsed.ok ? parsed.value : undefined;
}

export async function handleSecretsRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/secrets") {
    return json({
      keys: await listEffectiveSecretKeys(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/secrets/get") {
    const body = await readSecretBody(request);
    if (!body || typeof body.key !== "string" || !body.key) {
      return json({ error: "key is required" }, 400);
    }
    return json({
      key: body.key,
      value: await getEffectiveSecret(context.runtime, body.key),
    });
  }

  if (request.method === "POST" && url.pathname === "/secrets/set") {
    const body = await readSecretBody(request);
    if (
      !body ||
      typeof body.key !== "string" ||
      !body.key ||
      typeof body.value !== "string"
    ) {
      return json({ error: "key and value are required" }, 400);
    }
    // Settings credentials are app-global, not conversation workspace tasks.
    try {
      if (await setEffectiveSecret(context.runtime, body.key, body.value)) {
        return json({ key: body.key, valueSet: true });
      }
    } catch (error) {
      // SDK diagnostics can contain secrets; return only product-safe guidance.
      if (
        error instanceof Error &&
        /master key unavailable|OS keychain/iu.test(error.message)
      ) {
        return json(
          {
            error:
              "Secure storage is locked or unavailable. Unlock your system keychain (or install GNOME Keyring/KWallet on Linux), then restart Doolittle and save again.",
          },
          503,
        );
      }
    }
    return json(
      {
        error:
          "Could not securely save this key. Try again. If it still fails, restart Doolittle.",
      },
      503,
    );
  }

  return null;
}
