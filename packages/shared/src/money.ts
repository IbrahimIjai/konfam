export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt(value);
}

export function formatUnits(value: string | bigint, decimals: number, maxFraction = decimals): string {
  const amount = toBigInt(value);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeText}${fraction ? `.${fraction}` : ""}`;
}

export function parseUnits(text: string, decimals: number): bigint {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(clean) || clean === "" || clean === ".") {
    throw new Error("Invalid amount");
  }
  const [whole = "0", fraction = ""] = clean.split(".");
  if (fraction.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export function formatToken(value: string | bigint, decimals: number, symbol = "USDT"): string {
  return `${formatUnits(value, decimals, 2) || "0"} ${symbol}`;
}

export function formatNaira(kobo: string | bigint): string {
  const amount = toBigInt(kobo);
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `₦${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

export function nairaToKobo(naira: string): bigint {
  return parseUnits(naira, 2);
}

export function fiatForAmount(amount: bigint, rateKobo: bigint, decimals: number): bigint {
  const unit = 10n ** BigInt(decimals);
  return (amount * rateKobo + unit - 1n) / unit;
}

export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s+/g, "");
  if (digits.length <= 4) return digits;
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
