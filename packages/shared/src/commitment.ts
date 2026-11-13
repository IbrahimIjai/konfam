import type { PayeeDetails } from "./types";

export function canonicalPayee(details: PayeeDetails): string {
  return JSON.stringify({
    bankName: details.bankName.trim().toUpperCase(),
    accountNumber: details.accountNumber.replace(/\s+/g, ""),
    accountName: details.accountName.trim().replace(/\s+/g, " ").toUpperCase(),
  });
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

export async function payeeCommitment(details: PayeeDetails, saltHex: string): Promise<string> {
  return sha256Hex(`konfam-payee-v1|${saltHex}|${canonicalPayee(details)}`);
}

export function normalizeReference(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
