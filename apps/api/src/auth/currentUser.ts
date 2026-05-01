import type { IncomingMessage } from "node:http";

import { getBearerToken } from "../http/request.js";
import type { ApiContext } from "../types.js";

export type CurrentUser = {
  id: string;
  email: string;
};

export const getCurrentUser = async (
  request: IncomingMessage,
  context: ApiContext,
): Promise<CurrentUser | null> => {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const { data, error } = await context.supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
};
