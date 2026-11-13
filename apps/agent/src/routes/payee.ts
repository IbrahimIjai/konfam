import { Hono } from "hono";
import { z } from "zod";
import { bytesToHex, payeeCommitment } from "@konfam/shared";
import { requireAuth, type AuthEnv } from "../auth/middleware";
import type { AppDeps } from "../deps";
import { HttpError } from "../errors";

const payeeSchema = z.object({
  bankName: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "Account number must be 10 digits"),
  accountName: z.string().trim().min(3).max(80),
});

export function payeeRoutes(deps: AppDeps) {
  const auth = requireAuth(deps.chain, deps.config.NETWORK_ID);
  return new Hono<AuthEnv>()
    .post("/payee", auth, async (c) => {
      const details = payeeSchema.parse(await c.req.json());
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const commitment = await payeeCommitment(details, salt);
      deps.store.savePayee({ commitment, accountId: c.get("accountId"), details, salt, createdAt: Date.now() });
      return c.json({ commitment, salt, details });
    })
    .get("/payee/me", auth, (c) => {
      const payee = deps.store.getLatestPayee(c.get("accountId"));
      return c.json(payee ? { commitment: payee.commitment, salt: payee.salt, details: payee.details } : null);
    })
    .get("/trades/:id/payee", auth, async (c) => {
      const trade = await deps.chain.getTrade(c.req.param("id"));
      if (!trade) throw new HttpError(404, "Trade not found");
      const caller = c.get("accountId");
      if (caller !== trade.buyer && caller !== trade.seller) throw new HttpError(403, "Not a party to this trade");
      if (caller === trade.buyer && trade.status !== "AwaitingPayment") {
        throw new HttpError(409, "Payout details are only shown while payment is pending");
      }
      const offer = await deps.chain.getOffer(trade.offer_id);
      const payee = offer ? deps.store.getPayeeByCommitment(offer.bank_commitment) : null;
      if (!offer || !payee || payee.accountId !== offer.seller) {
        throw new HttpError(404, "Seller payout details unavailable");
      }
      return c.json({ commitment: payee.commitment, salt: payee.salt, details: payee.details });
    });
}
