import { Hono } from "hono";
import { z } from "zod";
import { maskAccountNumber, type LinkedBank } from "@konfam/shared";
import { requireAuth, type AuthEnv } from "../auth/middleware";
import type { AppDeps } from "../deps";
import { HttpError } from "../errors";
import type { BankLinkRow } from "../store/db";

const linkSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("mono"), code: z.string().min(4).max(200) }),
  z.object({ provider: z.literal("sandbox"), accountId: z.string().regex(/^sbx_[a-z0-9]{20}$/) }),
]);

function toLinkedBank(row: BankLinkRow): LinkedBank {
  return {
    provider: row.provider,
    institution: row.institution,
    accountName: row.accountName,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    linkedAt: row.linkedAt,
  };
}

export function bankRoutes(deps: AppDeps) {
  return new Hono<AuthEnv>()
    .use("/bank/*", requireAuth(deps.chain, deps.config.NETWORK_ID))
    .post("/bank/link", async (c) => {
      const request = linkSchema.parse(await c.req.json());
      if (request.provider !== deps.bank.name) {
        throw new HttpError(400, `This agent verifies payments with ${deps.bank.name}`);
      }
      const linked = await deps.bank.link(request);
      const row: BankLinkRow = {
        accountId: c.get("accountId"),
        provider: deps.bank.name,
        providerAccountId: linked.providerAccountId,
        institution: linked.institution,
        accountName: linked.accountName,
        accountNumber: linked.accountNumber,
        linkedAt: Date.now(),
      };
      deps.store.saveBankLink(row);
      return c.json(toLinkedBank(row));
    })
    .get("/bank/me", (c) => {
      const row = deps.store.getBankLink(c.get("accountId"));
      return c.json(row ? toLinkedBank(row) : null);
    })
    .delete("/bank/me", (c) => {
      deps.store.deleteBankLink(c.get("accountId"));
      return c.json({ ok: true });
    });
}
