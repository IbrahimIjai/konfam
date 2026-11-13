import { ed25519 } from "@noble/curves/ed25519";
import { base58, base64 } from "@scure/base";
import { AUTH_RECIPIENT, buildSessionMessage, encodeAuthToken } from "@konfam/shared";
import { nep413Digest } from "../auth/nep413";

export interface DevWallet {
  accountId: string;
  publicKey: string;
  authHeader(options?: { network?: string; issuedAt?: number; recipient?: string }): string;
}

export function createDevWallet(accountId: string): DevWallet {
  const secretKey = ed25519.utils.randomPrivateKey();
  const publicKey = `ed25519:${base58.encode(ed25519.getPublicKey(secretKey))}`;
  return {
    accountId,
    publicKey,
    authHeader(options = {}) {
      const message = buildSessionMessage(accountId, options.network ?? "testnet", options.issuedAt ?? Date.now());
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const digest = nep413Digest({ message, nonce, recipient: options.recipient ?? AUTH_RECIPIENT });
      const signature = base64.encode(ed25519.sign(digest, secretKey));
      return encodeAuthToken({ accountId, publicKey, signature, message, nonce: base64.encode(nonce) });
    },
  };
}
