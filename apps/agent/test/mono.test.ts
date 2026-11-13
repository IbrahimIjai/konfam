import { describe, expect, test } from "bun:test";
import { MonoProvider, parseMonoTransaction } from "../src/bank/mono";

function fakeFetch(routes: Record<string, unknown>, calls: { url: string; init?: RequestInit }[] = []) {
  return async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((path) => url.includes(path));
    if (!key) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  };
}

describe("MonoProvider", () => {
  test("exchanges the Connect code and reads account details", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const mono = new MonoProvider({
      secretKey: "test_sk",
      baseUrl: "https://api.withmono.com",
      realtime: true,
      fetch: fakeFetch(
        {
          "/v2/accounts/auth": { status: "successful", data: { id: "acc_123" } },
          "/v2/accounts/acc_123": {
            data: { account: { name: "ADA OBI", account_number: "0123456789", institution: { name: "GTBank" } } },
          },
        },
        calls,
      ),
    });
    const linked = await mono.link({ provider: "mono", code: "code_abc" });
    expect(linked).toEqual({
      providerAccountId: "acc_123",
      institution: "GTBank",
      accountName: "ADA OBI",
      accountNumber: "0123456789",
    });
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>)["mono-sec-key"]).toBe("test_sk");
  });

  test("reads debit transactions in kobo", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const mono = new MonoProvider({
      secretKey: "test_sk",
      baseUrl: "https://api.withmono.com",
      realtime: true,
      fetch: fakeFetch(
        {
          "/transactions": {
            data: [
              { id: "t1", type: "debit", amount: 16000000, narration: "TRF KF7Q2M9X", date: "2026-11-12T10:05:00.000Z" },
              { _id: "t2", type: "CREDIT", amount: "5000", narration: "salary", date: "2026-11-12T09:00:00.000Z" },
              { id: "bad" },
            ],
          },
        },
        calls,
      ),
    });
    const txs = await mono.transactions("acc_123", {
      from: new Date("2026-11-11T00:00:00Z"),
      to: new Date("2026-11-12T12:00:00Z"),
    });
    expect(txs.map((t) => [t.id, t.type, t.amountKobo])).toEqual([
      ["t1", "debit", 16_000_000n],
      ["t2", "credit", 5_000n],
    ]);
    expect(calls[0]?.url).toContain("start=11-11-2026");
    expect(calls[0]?.url).toContain("end=12-11-2026");
    expect((calls[0]?.init?.headers as Record<string, string>)["x-realtime"]).toBe("true");
  });

  test("surfaces Mono errors", async () => {
    const mono = new MonoProvider({ secretKey: "x", baseUrl: "https://api.withmono.com", realtime: false, fetch: fakeFetch({}) });
    await expect(mono.link({ provider: "mono", code: "nope" })).rejects.toThrow();
  });

  test("parser rejects malformed rows", () => {
    expect(parseMonoTransaction({ id: 1 })).toBeNull();
    expect(parseMonoTransaction(null)).toBeNull();
  });
});
