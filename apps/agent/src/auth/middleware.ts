import { createMiddleware } from "hono/factory";
import { AUTH_HEADER } from "@konfam/shared";
import type { EscrowChain } from "../chain/types";
import { authenticate } from "./nep413";

export type AuthEnv = { Variables: { accountId: string } };

export function requireAuth(chain: EscrowChain, network: string) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const outcome = await authenticate(c.req.header(AUTH_HEADER), {
      network,
      isFullAccessKey: (accountId, publicKey) => chain.isFullAccessKey(accountId, publicKey),
    });
    if (!outcome.ok) return c.json({ error: outcome.error }, 401);
    c.set("accountId", outcome.accountId);
    await next();
  });
}
