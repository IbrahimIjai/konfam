import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { payeeCommitment, type PayeeDetails, type VerifyResponse } from "@konfam/shared";
import { createMemoryStack, type MemoryStack } from "../src/dev/harness";

const USDT = 1_000_000n;

interface SandboxAccount {
  id: string;
  accountNumber: string;
  holderName: string;
  bankName: string;
}

async function setupMarket(stack: MemoryStack) {
  const seller = stack.wallet("seller.testnet");
  const buyer = stack.wallet("buyer.testnet");
  const sellerBank = (await stack.call<SandboxAccount>("POST", "/sandbox/accounts", { body: { holderName: "Tunde Bakare" } })).body;
  const buyerBank = (await stack.call<SandboxAccount>("POST", "/sandbox/accounts", { body: { holderName: "Ada Obi" } })).body;
  const payee = await stack.call<{ commitment: string; salt: string }>("POST", "/payee", {
    wallet: seller,
    body: { bankName: sellerBank.bankName, accountNumber: sellerBank.accountNumber, accountName: sellerBank.holderName },
  });
  expect(payee.status).toBe(200);
  stack.chain.mint(seller.accountId, 1_000n * USDT);
  const offer = stack.chain.createOffer({
    seller: seller.accountId,
    amount: 1_000n * USDT,
    rateKobo: 160_000n,
    minAmount: 10n * USDT,
    maxAmount: 500n * USDT,
    bankCommitment: payee.body.commitment,
  });
  const link = await stack.call("POST", "/bank/link", { wallet: buyer, body: { provider: "sandbox", accountId: buyerBank.id } });
  expect(link.status).toBe(200);
  return { seller, buyer, sellerBank, buyerBank, offer };
}

describe("end-to-end verification flow", () => {
  let stack: MemoryStack;
  beforeEach(() => {
    stack = createMemoryStack();
  });

  test("buyer pays in the sandbox bank and the agent releases USDT", async () => {
    const { buyer, sellerBank, buyerBank, offer } = await setupMarket(stack);
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 100n * USDT });

    const payee = await stack.call<{ details: PayeeDetails; salt: string; commitment: string }>(
      "GET",
      `/trades/${trade.id}/payee`,
      { wallet: buyer },
    );
    expect(payee.status).toBe(200);
    expect(await payeeCommitment(payee.body.details, payee.body.salt)).toBe(offer.bank_commitment);

    const early = await stack.call<VerifyResponse>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    expect(early.body.status).toBe("not_found");

    const transfer = await stack.call("POST", "/sandbox/transfer", {
      body: {
        fromAccountId: buyerBank.id,
        toAccountNumber: sellerBank.accountNumber,
        amountKobo: trade.fiat_kobo,
        narration: trade.reference,
      },
    });
    expect(transfer.status).toBe(200);

    const verified = await stack.call<VerifyResponse>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    expect(verified.body.status).toBe("confirmed");

    const onChain = await stack.chain.getTrade(trade.id);
    expect(onChain?.status).toBe("Released");
    expect(stack.chain.balanceOf(buyer.accountId)).toBe(100n * USDT - BigInt(trade.fee));

    const evidence = await stack.call<{ matchesChain: boolean; evidence: { reference: string } }>(
      "GET",
      `/trades/${trade.id}/evidence`,
      { wallet: buyer },
    );
    expect(evidence.body.matchesChain).toBe(true);
    expect(evidence.body.evidence.reference).toBe(trade.reference);
  });

  test("one bank transfer cannot settle two trades", async () => {
    const { buyer, sellerBank, buyerBank, offer } = await setupMarket(stack);
    const first = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 50n * USDT });
    await stack.call("POST", "/sandbox/transfer", {
      body: { fromAccountId: buyerBank.id, toAccountNumber: sellerBank.accountNumber, amountKobo: first.fiat_kobo, narration: first.reference },
    });
    expect((await stack.call<VerifyResponse>("POST", `/trades/${first.id}/verify`, { wallet: buyer })).body.status).toBe("confirmed");

    const second = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 50n * USDT });
    const reuse = await stack.call<VerifyResponse>("POST", `/trades/${second.id}/verify`, { wallet: buyer });
    expect(reuse.body.status).toBe("not_found");
    expect((await stack.chain.getTrade(second.id))?.status).toBe("AwaitingPayment");
  });

  test("wrong amount is not accepted", async () => {
    const { buyer, sellerBank, buyerBank, offer } = await setupMarket(stack);
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 100n * USDT });
    await stack.call("POST", "/sandbox/transfer", {
      body: {
        fromAccountId: buyerBank.id,
        toAccountNumber: sellerBank.accountNumber,
        amountKobo: (BigInt(trade.fiat_kobo) - 100_00n).toString(),
        narration: trade.reference,
      },
    });
    const result = await stack.call<VerifyResponse>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    expect(result.body.status).toBe("not_found");
    expect(stack.verifier.watched()).toContain(trade.id);
  });

  test("only the buyer can trigger verification and see payout details", async () => {
    const { seller, buyer, offer } = await setupMarket(stack);
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 20n * USDT });
    const stranger = stack.wallet("eve.testnet");
    expect((await stack.call("POST", `/trades/${trade.id}/verify`, { wallet: seller })).status).toBe(403);
    expect((await stack.call("GET", `/trades/${trade.id}/payee`, { wallet: stranger })).status).toBe(403);
    expect((await stack.call("POST", `/trades/${trade.id}/verify`)).status).toBe(401);
  });

  test("buyer must link a bank account first", async () => {
    const seller = stack.wallet("seller.testnet");
    const buyer = stack.wallet("buyer.testnet");
    stack.chain.mint(seller.accountId, 100n * USDT);
    const offer = stack.chain.createOffer({
      seller: seller.accountId,
      amount: 100n * USDT,
      rateKobo: 160_000n,
      minAmount: USDT,
      maxAmount: 100n * USDT,
      bankCommitment: "0".repeat(64),
    });
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 10n * USDT });
    const result = await stack.call<{ error: string }>("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    expect(result.status).toBe(409);
  });

  test("the watcher backs off instead of polling the bank every interval", async () => {
    const { buyer, offer } = await setupMarket(stack);
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 20n * USDT });
    const reads = spyOn(stack.bank, "transactions");
    await stack.call("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(await stack.verifier.sweep()).toBe(0);
    expect(await stack.verifier.sweep(Date.now() + 2 * 60_000)).toBe(1);
    expect(await stack.verifier.sweep(Date.now() + 90_000)).toBe(0);
    expect(await stack.verifier.sweep(Date.now() + 10 * 60_000)).toBe(1);
    expect(reads).toHaveBeenCalledTimes(3);
  });

  test("the watcher settles a payment on its own", async () => {
    const { buyer, sellerBank, buyerBank, offer } = await setupMarket(stack);
    const trade = stack.chain.takeOffer({ buyer: buyer.accountId, offerId: offer.id, amount: 20n * USDT });
    await stack.call("POST", `/trades/${trade.id}/verify`, { wallet: buyer });
    await stack.call("POST", "/sandbox/transfer", {
      body: { fromAccountId: buyerBank.id, toAccountNumber: sellerBank.accountNumber, amountKobo: trade.fiat_kobo, narration: trade.reference },
    });
    await stack.verifier.sweep(Date.now() + 10 * 60_000);
    expect((await stack.chain.getTrade(trade.id))?.status).toBe("Released");
    expect(stack.verifier.watched()).not.toContain(trade.id);
  });

  test("attestation endpoint describes the agent", async () => {
    const result = await stack.call<{ agentAccountId: string; bankProvider: string; inTee: boolean }>("GET", "/attestation");
    expect(result.body.agentAccountId).toBe("konfam-agent.memory");
    expect(result.body.bankProvider).toBe("sandbox");
    expect(result.body.inTee).toBe(false);
  });
});
