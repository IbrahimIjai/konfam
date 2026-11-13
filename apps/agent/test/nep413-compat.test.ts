import { describe, expect, test } from "bun:test";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";
import { base64 } from "@scure/base";
import { AUTH_RECIPIENT, buildSessionMessage, encodeAuthToken } from "@konfam/shared";
import { authenticate, verifyNep413 } from "../src/auth/nep413";

async function signWithNearJs(accountId: string, recipient = AUTH_RECIPIENT) {
  const keyPair = KeyPair.fromRandom("ed25519");
  const signer = new KeyPairSigner(keyPair);
  const message = buildSessionMessage(accountId, "testnet");
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signed = await signer.signNep413Message(message, accountId, recipient, nonce);
  return {
    accountId,
    publicKey: signed.publicKey.toString(),
    signature: base64.encode(signed.signature),
    message,
    nonce: base64.encode(nonce),
  };
}

describe("NEP-413 compatibility with @near-js/signers", () => {
  test("verifies a signature produced by the official NEAR signer", async () => {
    const token = await signWithNearJs("ada.testnet");
    expect(verifyNep413(token)).toBe(true);
    const outcome = await authenticate(encodeAuthToken(token), { network: "testnet", isFullAccessKey: async () => true });
    expect(outcome).toEqual({ ok: true, accountId: "ada.testnet" });
  });

  test("rejects an official signature made for a different recipient", async () => {
    const token = await signWithNearJs("ada.testnet", "another-app");
    expect(verifyNep413(token)).toBe(false);
  });
});
