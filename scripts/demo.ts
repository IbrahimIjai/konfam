import { formatNaira, formatToken, payeeCommitment, type PayeeDetails, type VerifyResponse } from "@konfam/shared";
import { createMemoryStack } from "../apps/agent/src/dev/harness";

const USDT = 1_000_000n;
const stack = createMemoryStack();
const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);
const ok = (text: string) => console.log(`   ✓ ${text}`);
const fail = (text: string) => console.log(`   ✗ ${text}`);

interface SandboxAccount {
  id: string;
  accountNumber: string;
  holderName: string;
  bankName: string;
}

console.log("Konfam offline demo: memory escrow + sandbox bank + real verifier code");

const seller = stack.wallet("tunde.testnet");
const buyer = stack.wallet("ada.testnet");
const sellerBank = (await stack.call<SandboxAccount>("POST", "/sandbox/accounts", { body: { holderName: "Tunde Bakare" } })).body;
const buyerBank = (await stack.call<SandboxAccount>("POST", "/sandbox/accounts", { body: { holderName: "Ada Obi" } })).body;

step(1, "Seller registers a payout bank account with the agent (kept off-chain)");
const payee = await stack.call<{ commitment: string }>("POST", "/payee", {
  wallet: seller,
  body: { bankName: sellerBank.bankName, accountNumber: sellerBank.accountNumber, accountName: sellerBank.holderName },
});
ok(`commitment ${payee.body.commitment.slice(0, 16)}… goes on-chain, bank details do not`);

step(2, "Seller locks USDT in escrow at ₦1,600 per USDT");
stack.chain.mint(seller.accountId, 1_000n * USDT);
const offer = stack.chain.createOffer({
  seller: seller.accountId,
  amount: 1_000n * USDT,
  rateKobo: 160_000n,
  minAmount: 10n * USDT,
  maxAmount: 500n * USDT,
  bankCommitment: payee.body.commitment,
});
ok(`offer #${offer.id}: ${formatToken(offer.available, 6)} available`);

step(3, "Buyer links their bank account (sandbox stands in for Mono Connect)");
await stack.call("POST", "/bank/link", { wallet: buyer, body: { provider: "sandbox", accountId: buyerBank.id } });
ok(`${buyerBank.holderName} at ${buyerBank.bankName} linked; token held only by the agent`);

step(4, "Buyer takes 100 USDT from the offer");
const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 100n * USDT });
ok(`trade #${trade.id}: pay ${formatNaira(trade.fiat_kobo)} with reference ${trade.reference}`);

const reveal = await stack.call<{ details: PayeeDetails; salt: string }>("GET", `/trades/${trade.id}/payee`, { wallet: buyer });
const matches = (await payeeCommitment(reveal.body.details, reveal.body.salt)) === offer.bank_commitment;
ok(`seller account revealed to buyer only: ${reveal.body.details.accountName} ${reveal.body.details.accountNumber} (commitment ${matches ? "matches" : "MISMATCH"})`);

step(5, "Agent checks before any money moves");
const early = await stack.call<VerifyResponse>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
if (early.body.status === "not_found") fail(`no matching transfer yet, agent keeps watching (${early.body.watching})`);

step(6, "Buyer sends naira from their bank with the reference in the narration");
await stack.call("POST", "/sandbox/transfer", {
  body: { fromAccountId: buyerBank.id, toAccountNumber: sellerBank.accountNumber, amountKobo: trade.fiat_kobo, narration: trade.reference },
});
ok(`${formatNaira(trade.fiat_kobo)} sent to ${sellerBank.holderName}`);

step(7, "Agent reads the bank feed inside the TEE and confirms on-chain");
const verified = await stack.call<VerifyResponse>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
if (verified.body.status === "confirmed") {
  for (const check of verified.body.checks) (check.passed ? ok : fail)(`${check.name}: ${check.detail ?? ""}`);
  ok(`evidence hash ${verified.body.evidenceHash.slice(0, 16)}… written to the contract`);
}

step(8, "Escrow released USDT to the buyer");
const settled = await stack.chain.getTrade(trade.id);
ok(`status ${settled?.status}; buyer balance ${formatToken(stack.chain.balanceOf(buyer.accountId), 6)} (fee ${formatToken(trade.fee, 6)})`);

step(9, "Replay attempt: reuse the same transfer for a second trade");
const second = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 100n * USDT });
const replay = await stack.call<VerifyResponse>("POST", `/trades/${second.id}/verify`, { wallet: buyer });
if (replay.body.status === "not_found") {
  fail(`rejected: ${replay.body.checks.filter((c) => !c.passed && c.required).map((c) => c.name).join(", ")}`);
}

stack.verifier.stop();
console.log("\nDone. Every step above ran the same verifier, matcher and API code the TEE agent runs.");
