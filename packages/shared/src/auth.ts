export const AUTH_HEADER = "x-konfam-auth";
export const AUTH_RECIPIENT = "konfam";
export const AUTH_TTL_MS = 30 * 60 * 1000;

export interface AuthToken {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  nonce: string;
}

export interface SessionMessage {
  app: "konfam";
  accountId: string;
  issuedAt: number;
  network: string;
}

export function buildSessionMessage(accountId: string, network: string, issuedAt = Date.now()): string {
  const message: SessionMessage = { app: "konfam", accountId, issuedAt, network };
  return JSON.stringify(message);
}

export function parseSessionMessage(message: string): SessionMessage | null {
  try {
    const parsed = JSON.parse(message) as Partial<SessionMessage>;
    if (parsed.app !== "konfam" || typeof parsed.accountId !== "string" || typeof parsed.issuedAt !== "number") {
      return null;
    }
    return {
      app: "konfam",
      accountId: parsed.accountId,
      issuedAt: parsed.issuedAt,
      network: typeof parsed.network === "string" ? parsed.network : "",
    };
  } catch {
    return null;
  }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeAuthToken(token: AuthToken): string {
  return toBase64(JSON.stringify(token));
}

export function decodeAuthToken(header: string): AuthToken | null {
  try {
    const parsed = JSON.parse(fromBase64(header)) as Partial<AuthToken>;
    const fields = ["accountId", "publicKey", "signature", "message", "nonce"] as const;
    if (!fields.every((field) => typeof parsed[field] === "string")) return null;
    return parsed as AuthToken;
  } catch {
    return null;
  }
}
