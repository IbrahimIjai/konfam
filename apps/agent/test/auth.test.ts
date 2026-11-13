import { describe, expect, test } from "bun:test";
import { decodeAuthToken } from "@konfam/shared";
import { authenticate, nep413Digest, verifyNep413 } from "../src/auth/nep413";
import { createDevWallet } from "../src/dev/wallet";

const alwaysKey = async () => true;

describe("NEP-413 auth", () => {
  test("digest is deterministic and 32 bytes", () => {
    const nonce = new Uint8Array(32).fill(7);
    const a = nep413Digest({ message: "hello", nonce, recipient: "konfam" });
    const b = nep413Digest({ message: "hello", nonce, recipient: "konfam" });
    expect(a.length).toBe(32);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  test("accepts a valid signed session", async () => {
    const wallet = createDevWallet("ada.testnet");
    const outcome = await authenticate(wallet.authHeader(), { network: "testnet", isFullAccessKey: alwaysKey });
    expect(outcome).toEqual({ ok: true, accountId: "ada.testnet" });
  });

  test("rejects a tampered message", async () => {
    const wallet = createDevWallet("ada.testnet");
    const token = decodeAuthToken(wallet.authHeader())!;
    token.message = token.message.replace("ada.testnet", "eve.testnet");
    token.accountId = "eve.testnet";
    expect(verifyNep413(token)).toBe(false);
  });

  test("rejects a signature for another recipient", async () => {
    const wallet = createDevWallet("ada.testnet");
    const header = wallet.authHeader({ recipient: "evil-app" });
    const outcome = await authenticate(header, { network: "testnet", isFullAccessKey: alwaysKey });
    expect(outcome.ok).toBe(false);
  });

  test("rejects expired sessions and wrong networks", async () => {
    const wallet = createDevWallet("ada.testnet");
    const stale = wallet.authHeader({ issuedAt: Date.now() - 2 * 60 * 60 * 1000 });
    expect((await authenticate(stale, { network: "testnet", isFullAccessKey: alwaysKey })).ok).toBe(false);
    const mainnet = wallet.authHeader({ network: "mainnet" });
    expect((await authenticate(mainnet, { network: "testnet", isFullAccessKey: alwaysKey })).ok).toBe(false);
  });

  test("rejects keys that do not belong to the account", async () => {
    const wallet = createDevWallet("ada.testnet");
    const outcome = await authenticate(wallet.authHeader(), { network: "testnet", isFullAccessKey: async () => false });
    expect(outcome).toEqual({ ok: false, error: "Key does not belong to account" });
  });
});
