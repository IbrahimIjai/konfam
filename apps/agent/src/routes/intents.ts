import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface IntentsOptions {
  baseUrl: string;
  jwt: string;
  appFeeBps: number;
  feeRecipient: string;
  fetch?: Fetch;
}

const TOKENS_TTL_MS = 5 * 60 * 1000;

const quoteSchema = z.object({
  dry: z.boolean(),
  originAsset: z.string().min(3).max(200),
  destinationAsset: z.string().min(3).max(200),
  amount: z.string().regex(/^\d{1,40}$/),
  recipient: z.string().min(2).max(200),
  refundTo: z.string().min(2).max(200),
  slippageTolerance: z.number().int().min(10).max(500).default(100),
});

const depositSchema = z.object({
  txHash: z.string().min(10).max(100),
  depositAddress: z.string().min(2).max(200),
  nearSenderAccount: z.string().min(2).max(100),
});

function upstreamStatus(status: number): ContentfulStatusCode {
  return (status >= 200 && status < 600 ? status : 502) as ContentfulStatusCode;
}

export function intentsRoutes(options: IntentsOptions) {
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  let tokensCache: { at: number; body: unknown } | null = null;

  async function call(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (options.jwt) headers.authorization = `Bearer ${options.jwt}`;
    try {
      const response = await fetchImpl(`${options.baseUrl}${path}`, { ...init, headers });
      const body = await response.json().catch(() => ({ message: "Invalid response from NEAR Intents" }));
      return { status: upstreamStatus(response.status), body };
    } catch {
      return { status: 502 as ContentfulStatusCode, body: { message: "NEAR Intents is unreachable" } };
    }
  }

  return new Hono()
    .get("/intents/tokens", async (c) => {
      if (tokensCache && Date.now() - tokensCache.at < TOKENS_TTL_MS) return c.json(tokensCache.body as object);
      const { status, body } = await call("/v0/tokens");
      if (status === 200) tokensCache = { at: Date.now(), body };
      return c.json(body as object, status);
    })
    .post("/intents/quote", async (c) => {
      const input = quoteSchema.parse(await c.req.json());
      const request: Record<string, unknown> = {
        dry: input.dry,
        swapType: "EXACT_INPUT",
        slippageTolerance: input.slippageTolerance,
        originAsset: input.originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: input.destinationAsset,
        amount: input.amount,
        refundTo: input.refundTo,
        refundType: "ORIGIN_CHAIN",
        recipient: input.recipient,
        recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        referral: "konfam",
        quoteWaitingTimeMs: 3000,
      };
      if (options.appFeeBps > 0 && options.feeRecipient) {
        request.appFees = [{ recipient: options.feeRecipient, fee: options.appFeeBps }];
      }
      const { status, body } = await call("/v0/quote", { method: "POST", body: JSON.stringify(request) });
      return c.json(body as object, status);
    })
    .post("/intents/deposit", async (c) => {
      const input = depositSchema.parse(await c.req.json());
      const { status, body } = await call("/v0/deposit/submit", { method: "POST", body: JSON.stringify(input) });
      return c.json(body as object, status);
    })
    .get("/intents/status", async (c) => {
      const depositAddress = c.req.query("depositAddress") ?? "";
      if (!/^[A-Za-z0-9._:-]{2,200}$/.test(depositAddress)) return c.json({ message: "Invalid deposit address" }, 400);
      const { status, body } = await call(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`);
      return c.json(body as object, status);
    });
}
