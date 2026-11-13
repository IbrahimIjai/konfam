import { Hono } from "hono";
import { z } from "zod";
import { toSandboxView, type SandboxBank } from "../bank/sandbox";

const createSchema = z.object({ holderName: z.string().trim().min(3).max(80) });
const transferSchema = z.object({
  fromAccountId: z.string().regex(/^sbx_[a-z0-9]{20}$/),
  toAccountNumber: z.string().trim().regex(/^\d{10}$/),
  amountKobo: z.string().regex(/^\d{1,15}$/),
  narration: z.string().trim().max(100).default(""),
});

export function sandboxRoutes(sandbox: SandboxBank) {
  return new Hono()
    .post("/sandbox/accounts", async (c) => {
      const { holderName } = createSchema.parse(await c.req.json());
      return c.json(toSandboxView(sandbox.createAccount(holderName)), 201);
    })
    .get("/sandbox/accounts/:id", (c) => {
      const account = sandbox.getAccount(c.req.param("id"));
      const transactions = sandbox.history(account.id).map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountKobo: tx.amountKobo.toString(),
        narration: tx.narration,
        counterparty: tx.counterparty,
        createdAt: tx.createdAt,
      }));
      return c.json({ account: toSandboxView(account), transactions });
    })
    .post("/sandbox/transfer", async (c) => {
      const input = transferSchema.parse(await c.req.json());
      const { debit } = sandbox.transfer({ ...input, amountKobo: BigInt(input.amountKobo) });
      return c.json({ id: debit.id, narration: debit.narration, amountKobo: debit.amountKobo.toString(), createdAt: debit.createdAt });
    });
}
