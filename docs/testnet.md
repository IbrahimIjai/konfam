# Deploying Konfam on NEAR testnet

This guide takes you from a fresh clone to a working market on testnet, with the verifier running locally against the sandbox bank. Then it moves the verifier into a TEE.

## What you need

- [Bun](https://bun.sh) 1.3 or newer
- [rustup](https://rustup.rs) (the pinned Rust 1.86 and wasm target install automatically from `contracts/rust-toolchain.toml`) and [cargo-near](https://github.com/near/cargo-near)
- [near-cli](https://github.com/near/near-cli) (`npm i -g near-cli`)
- The Shade Agent CLI (`npm i -g @neardefi/shade-agent-cli`)
- Docker and a [Phala Cloud](https://cloud.phala.network) API key, only for the TEE step

Replace `you` below with a name of your own.

## 1. Accounts

```bash
shade auth set all testnet create-new
```

The CLI creates and funds a testnet account and prints its id and private key. Put them into `.env` (copy `.env.example` first) as `SPONSOR_ACCOUNT_ID` and `SPONSOR_PRIVATE_KEY`.

## 2. Test USDT

```bash
cd contracts/test-token
cargo near build non-reproducible-wasm
cd ../..
near create-account tusdt-you.testnet --useFaucet
near deploy tusdt-you.testnet contracts/target/near/konfam_test_token.wasm \
  --initFunction new \
  --initArgs '{"name":"Konfam Test USDT","symbol":"USDT","decimals":6}'
```

If cargo-near prints a different `.wasm` path, use that one. Anyone can now mint up to 5,000 test USDT per call with `faucet`. The Sell page has a button for it.

## 3. Escrow contract

In `deployment.yaml`:

- set `agent_contract.contract_id` to `konfam-you.testnet`
- replace `REPLACE_WITH_TOKEN_ACCOUNT` with `tusdt-you.testnet`
- keep `environment: local`

Then:

```bash
shade deploy
```

This builds `contracts/escrow`, deploys it, initialises it with `requires_tee: false`, and approves the mock measurements used in local mode.

Register the escrow with the token so it can hold USDT. The web app also does this on the first offer, so this step is optional.

```bash
near call tusdt-you.testnet storage_deposit '{"account_id":"konfam-you.testnet"}' \
  --accountId "$SPONSOR_ACCOUNT_ID" --deposit 0.01
```

## 4. Verifier

In `.env` set `AGENT_CONTRACT_ID=konfam-you.testnet` and keep `BANK_PROVIDER=sandbox`. Then:

```bash
bun install
bun run dev:agent
```

The agent prints its account id and waits. In another terminal:

```bash
shade whitelist
```

Paste the agent account id. Within ten seconds the agent logs `agent registered` and starts serving on port 3001.

## 5. Web app

```bash
cp apps/web/.env.example apps/web/.env
```

Set `VITE_CONTRACT_ID=konfam-you.testnet`, then run:

```bash
bun run dev:web
```

Open http://localhost:5173.

## 6. A full trade

Use two wallets, for example two browser profiles.

As the seller:

1. Open **Test bank** and open an account. Note its account number.
2. Open **Sell USDT**, connect, sign the message, and press **Get 1,000 test USDT**.
3. Save your payout account using the test bank details, then lock 500 USDT at a price of 1600.

As the buyer:

1. Open **Bank** and open and link a test account.
2. Open **Buy USDT** and buy 100 USDT from the seller's offer. The wallet asks you to attach a 0.01 NEAR deposit.
3. On the trade page, press **Pay from the test bank**. The transfer form is filled in, so send it.
4. Go back to the trade and press **I've sent it, check my bank**.

The receipt fills in, the trade turns **Released**, 99.5 USDT lands in the buyer's wallet and the 0.01 NEAR deposit comes back. The evidence hash is visible on the trade page and on the explorer.

## 7. Move the verifier into a TEE

1. In `deployment.yaml`, set `environment: TEE` and set `build_docker_image.tag` to your Docker Hub repository.
2. Use a new `contract_id`, so the contract is initialised with `requires_tee: true`.
3. Run `shade deploy`. The CLI builds `apps/agent/Dockerfile`, pushes it, computes the image measurements, approves them and Phala's PPIDs in the contract, and deploys the compose file to Phala Cloud.
4. Set `VITE_AGENT_URL` to the URL the CLI prints, and `CORS_ORIGINS` in `.env` to your web origin.

The **How it's verified** page now shows "Running inside a TEE" and "Attestation required".

## Switching to Mono

1. Create a Mono app at https://app.mono.co and copy the public and secret keys.
2. Set `BANK_PROVIDER=mono` and `MONO_SECRET_KEY=...` in `.env`, and `VITE_MONO_PUBLIC_KEY=...` in `apps/web/.env`.
3. Redeploy the agent.

The Bank page now opens Mono Connect instead of the test bank.
