import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { base58, base64 } from "@scure/base";
import {
  AUTH_RECIPIENT,
  AUTH_TTL_MS,
  decodeAuthToken,
  parseSessionMessage,
  type AuthToken,
} from "@konfam/shared";

const NEP413_TAG = 2 ** 31 + 413;

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function borshString(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  return concat(u32(bytes.length), bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function nep413Digest(input: { message: string; nonce: Uint8Array; recipient: string; callbackUrl?: string }): Uint8Array {
  if (input.nonce.length !== 32) throw new Error("Nonce must be 32 bytes");
  const callback = input.callbackUrl === undefined ? new Uint8Array([0]) : concat(new Uint8Array([1]), borshString(input.callbackUrl));
  const payload = concat(borshString(input.message), input.nonce, borshString(input.recipient), callback);
  return sha256(concat(u32(NEP413_TAG), payload));
}

export function decodePublicKey(publicKey: string): Uint8Array {
  const [curve, encoded] = publicKey.includes(":") ? publicKey.split(":") : ["ed25519", publicKey];
  if (curve !== "ed25519" || !encoded) throw new Error("Only ed25519 keys are supported");
  const bytes = base58.decode(encoded);
  if (bytes.length !== 32) throw new Error("Invalid public key length");
  return bytes;
}

function decodeSignature(signature: string): Uint8Array {
  const trimmed = signature.replace(/^ed25519:/, "");
  try {
    const bytes = base64.decode(trimmed);
    if (bytes.length === 64) return bytes;
  } catch {}
  return base58.decode(trimmed);
}

export function verifyNep413(token: AuthToken, recipient = AUTH_RECIPIENT): boolean {
  try {
    const digest = nep413Digest({ message: token.message, nonce: base64.decode(token.nonce), recipient });
    return ed25519.verify(decodeSignature(token.signature), digest, decodePublicKey(token.publicKey));
  } catch {
    return false;
  }
}

export type AuthOutcome = { ok: true; accountId: string } | { ok: false; error: string };

export async function authenticate(
  header: string | undefined,
  options: {
    network: string;
    now?: number;
    ttlMs?: number;
    isFullAccessKey: (accountId: string, publicKey: string) => Promise<boolean>;
  },
): Promise<AuthOutcome> {
  if (!header) return { ok: false, error: "Missing auth header" };
  const token = decodeAuthToken(header);
  if (!token) return { ok: false, error: "Malformed auth header" };
  const session = parseSessionMessage(token.message);
  if (!session || session.accountId !== token.accountId) return { ok: false, error: "Invalid session message" };
  if (session.network && session.network !== options.network) return { ok: false, error: "Wrong network" };
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? AUTH_TTL_MS;
  if (session.issuedAt > now + 60_000 || now - session.issuedAt > ttl) return { ok: false, error: "Session expired" };
  if (!verifyNep413(token)) return { ok: false, error: "Bad signature" };
  if (!(await options.isFullAccessKey(token.accountId, token.publicKey))) {
    return { ok: false, error: "Key does not belong to account" };
  }
  return { ok: true, accountId: token.accountId };
}
