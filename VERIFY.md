# Verifying the claims in the README

Every row lists a claim, the command that checks it, and what you should see. Run the commands from the repository root after `bun install`.

| # | Claim | Command | Expected |
| --- | --- | --- | --- |
| 1 | A full trade settles end to end through the verifier | `bun run demo` | Steps 1 to 8 print `✓`, step 8 shows `status Released; buyer balance 99.5 USDT` |
| 2 | A bank transfer can't settle two trades | `bun run demo` | Step 9 prints `✗ rejected: reference, unused` |
| 3 | The matcher rejects underpayment, late or early transfers, missing references, credits and reused transfers, and handles banks that report dates only | `bun test apps/agent/test/match.test.ts` | 13 pass, 0 fail |
| 4 | Agent auth uses NEP-413 and rejects tampered, expired, wrong-network and foreign-key sessions | `bun test apps/agent/test/auth.test.ts` | 6 pass, 0 fail |
| 5 | Signatures from NEAR's official signer (`@near-js/signers`) verify, so real wallets work | `bun test apps/agent/test/nep413-compat.test.ts` | 2 pass, 0 fail |
| 6 | The Mono integration exchanges the Connect code and reads debits in kobo with `mono-sec-key` | `bun test apps/agent/test/mono.test.ts` | 4 pass, 0 fail |
| 7 | Only the buyer can verify or see payout details, a bank link is required, and the watcher settles payments on its own with backoff | `bun test apps/agent/test/flow.test.ts` | 8 pass, 0 fail |
| 8 | The 1Click proxy adds the API key, referral and app fee, caches tokens and validates input | `bun test apps/agent/test/intents.test.ts` | 5 pass, 0 fail |
| 9 | Only a registered, attested agent can confirm a payment | `cd contracts && cargo test only_registered_agent_can_confirm` | 1 passed |
| 10 | An agent with an expired attestation is removed and can't confirm | `cd contracts && cargo test expired_agent_is_removed_on_use` | 1 passed |
| 11 | A payout in flight can't be duplicated, and a failed payout can be retried | `cd contracts && cargo test payout` | 2 passed |
| 12 | Sellers reclaim unpaid USDT only after the window plus grace | `cd contracts && cargo test reclaim` | 2 passed |
| 13 | Reserving requires the 0.01 NEAR deposit | `cd contracts && cargo test take_offer_requires_deposit` | 1 passed |
| 14 | Dust offers are rejected and withdrawn offers are deleted | `cd contracts && cargo test offer` | 8 passed |
| 15 | Fees are capped at 2% | `cd contracts && cargo test fee_is_capped` | 1 passed |
| 16 | Naira amounts are computed in kobo and rounded in the seller's favour | `cd contracts && cargo test take_offer_locks_liquidity_and_prices_in_kobo` | 1 passed |
| 17 | All contract tests pass | `cd contracts && cargo test` | 24 passed for the escrow and 2 for the test token |
| 18 | The whole TypeScript codebase typechecks | `bun run typecheck` | No errors |
| 19 | The web app builds | `bun run build:web` | `built in` with no errors |
| 20 | The agent serves its attestation and sandbox bank without a NEAR contract | `bun run dev:agent:memory`, then `curl localhost:3001/attestation` | JSON with `"bankProvider":"sandbox"` and `"inTee":false` |

Where the code for each piece lives:

- Escrow and agent gating: `contracts/escrow/src/escrow.rs`, `contracts/escrow/src/agents.rs`
- Payment matching: `apps/agent/src/verify/match.ts`
- Evidence hashing: `apps/agent/src/verify/evidence.ts`
- Verification service and watcher: `apps/agent/src/verify/service.ts`
- Mono client: `apps/agent/src/bank/mono.ts`
- NEP-413 verification: `apps/agent/src/auth/nep413.ts`
- Payee commitment, shared by the agent and the browser: `packages/shared/src/commitment.ts`
