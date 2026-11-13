import { Hono } from "hono";
import { requireAuth, type AuthEnv } from "../auth/middleware";
import type { AppDeps } from "../deps";
import { HttpError } from "../errors";

function tradeId(raw: string): string {
  if (!/^\d{1,18}$/.test(raw)) throw new HttpError(400, "Invalid trade id");
  return raw;
}

export function tradeRoutes(deps: AppDeps) {
  const auth = requireAuth(deps.chain, deps.config.NETWORK_ID);
  return new Hono<AuthEnv>()
    .post("/trades/:id/verify", auth, async (c) => {
      const result = await deps.verifier.verify(tradeId(c.req.param("id")), c.get("accountId"));
      return c.json(result);
    })
    .get("/trades/:id/evidence", auth, async (c) => {
      const id = tradeId(c.req.param("id"));
      const trade = await deps.chain.getTrade(id);
      if (!trade) throw new HttpError(404, "Trade not found");
      const caller = c.get("accountId");
      if (caller !== trade.buyer && caller !== trade.seller) throw new HttpError(403, "Not a party to this trade");
      const record = deps.store.getVerification(id);
      if (!record) throw new HttpError(404, "No evidence recorded for this trade");
      return c.json({
        evidence: JSON.parse(record.evidence),
        evidenceHash: record.evidenceHash,
        onChainHash: trade.evidence_hash,
        matchesChain: trade.evidence_hash === record.evidenceHash,
      });
    });
}
