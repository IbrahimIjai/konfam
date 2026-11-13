import { describe, expect, test } from "bun:test";
import { intentsRoutes } from "../src/routes/intents";

function recorder(responses: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(responses).find((path) => url.includes(path));
    return new Response(JSON.stringify(key ? responses[key] : { message: "missing" }), { status: key ? 200 : 404 });
  };
  return { calls, fetch };
}

const quoteBody = {
  dry: true,
  originAsset: "nep141:usdt.tether-token.near",
  destinationAsset: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",
  amount: "100000000",
  recipient: "TXYZabc123",
  refundTo: "ada.near",
};

describe("NEAR Intents proxy", () => {
  test("adds the JWT, referral and app fee to quotes", async () => {
    const { calls, fetch } = recorder({ "/v0/quote": { quote: { amountOutFormatted: "99.8" } } });
    const app = intentsRoutes({ baseUrl: "https://1click.test", jwt: "jwt-123", appFeeBps: 25, feeRecipient: "konfam.near", fetch });
    const response = await app.request("/intents/quote", { method: "POST", body: JSON.stringify(quoteBody) });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { quote: { amountOutFormatted: string } }).quote.amountOutFormatted).toBe("99.8");
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBe("Bearer jwt-123");
    expect(sent.referral).toBe("konfam");
    expect(sent.appFees).toEqual([{ recipient: "konfam.near", fee: 25 }]);
    expect(sent.swapType).toBe("EXACT_INPUT");
    expect(sent.recipientType).toBe("DESTINATION_CHAIN");
  });

  test("omits fees and auth when not configured", async () => {
    const { calls, fetch } = recorder({ "/v0/quote": { quote: {} } });
    const app = intentsRoutes({ baseUrl: "https://1click.test", jwt: "", appFeeBps: 0, feeRecipient: "", fetch });
    await app.request("/intents/quote", { method: "POST", body: JSON.stringify(quoteBody) });
    const sent = JSON.parse(String(calls[0]?.init?.body));
    expect(sent.appFees).toBeUndefined();
    expect((calls[0]?.init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  test("caches the token list", async () => {
    const { calls, fetch } = recorder({ "/v0/tokens": [{ assetId: "a", symbol: "USDT", blockchain: "tron", decimals: 6, price: 1 }] });
    const app = intentsRoutes({ baseUrl: "https://1click.test", jwt: "", appFeeBps: 0, feeRecipient: "", fetch });
    await app.request("/intents/tokens");
    await app.request("/intents/tokens");
    expect(calls.length).toBe(1);
  });

  test("rejects bad status queries before calling upstream", async () => {
    const { calls, fetch } = recorder({});
    const app = intentsRoutes({ baseUrl: "https://1click.test", jwt: "", appFeeBps: 0, feeRecipient: "", fetch });
    const response = await app.request("/intents/status?depositAddress=%3Cscript%3E");
    expect(response.status).toBe(400);
    expect(calls.length).toBe(0);
  });

  test("reports an unreachable upstream as 502", async () => {
    const app = intentsRoutes({
      baseUrl: "https://1click.test",
      jwt: "",
      appFeeBps: 0,
      feeRecipient: "",
      fetch: async () => {
        throw new Error("down");
      },
    });
    const response = await app.request("/intents/status?depositAddress=abc123");
    expect(response.status).toBe(502);
  });
});
