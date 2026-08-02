import {
  handleRealtimeSession,
  type AssistantRuntimeEnv,
} from "../../../api/_shared/realtime-session";

type Env = AssistantRuntimeEnv;

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  return handleRealtimeSession(request, {
    env,
    clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
  });
};
