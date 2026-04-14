import { json } from "@/server/responses";
import {
  badRequest,
  type IdentityProfileRouteHandler,
  readJsonBody,
} from "../profiles-shared";

type UserNoteBody = {
  userId: string;
  note: string;
  source?: string;
};

async function readUserNoteBody(
  request: Request,
): Promise<UserNoteBody | null> {
  const body = await readJsonBody<Partial<UserNoteBody>>(request);
  if (!body.userId || !body.note) {
    return null;
  }

  return {
    userId: body.userId,
    note: body.note,
    source: body.source,
  };
}

export const handleUserNote: IdentityProfileRouteHandler = async ({
  context,
  request,
  nativeServices,
}) => {
  const body = await readUserNoteBody(request);
  if (!body) {
    return badRequest("userId and note are required");
  }

  return json({
    profile:
      nativeServices.rolodex?.remember(
        body.userId,
        "note",
        body.note,
        body.source,
      ) ??
      context.services.userProfiles.addNote(
        body.userId,
        body.note,
        body.source,
      ),
  });
};
