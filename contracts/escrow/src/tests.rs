#![allow(unused_must_use)]

use crate::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::testing_env;
use shade_attestation::attestation::create_mock_dstack_attestation;

const USDT: u128 = 1_000_000;
const RATE_KOBO: u128 = 160_000;
const WINDOW_MS: u64 = 30 * 60 * 1000;
const GRACE_MS: u64 = 15 * 60 * 1000;
const COMMITMENT: &str = "a3f1c2d4e5b6a7980112233445566778899aabbccddeeff00112233445566778";
const EVIDENCE: &str = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";

fn owner() -> AccountId {
    accounts(0)
}
fn seller() -> AccountId {
    accounts(1)
}
fn buyer() -> AccountId {
    accounts(2)
}
fn agent() -> AccountId {
    accounts(3)
}
fn token() -> AccountId {
    "usdt.test.near".parse().unwrap()
}
fn contract_account() -> AccountId {
    "konfam.test.near".parse().unwrap()
}

fn context(predecessor: AccountId, now_ms: u64) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(contract_account())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .block_timestamp(now_ms * 1_000_000)
        .attached_deposit(NearToken::from_millinear(10));
    builder
}

fn as_caller(predecessor: AccountId, now_ms: u64) {
    testing_env!(context(predecessor, now_ms).build());
}

fn setup() -> Contract {
    as_caller(contract_account(), 1_000);
    let mut contract = Contract::new(
        false,
        U64(7 * 24 * 60 * 60 * 1000),
        owner(),
        token(),
        6,
        50,
        owner(),
        U64(WINDOW_MS),
        U64(GRACE_MS),
    );
    as_caller(owner(), 1_000);
    contract.approve_measurements(create_mock_full_measurements_hex());
    contract.approve_ppids(vec![Ppid::default()]);
    contract.whitelist_agent_for_local(agent());
    as_caller(agent(), 1_000);
    assert!(contract.register_agent(create_mock_dstack_attestation()));
    contract
}

fn create_offer(contract: &mut Contract, amount: u128) -> u64 {
    as_caller(token(), 2_000);
    let msg = serde_json::json!({
        "action": "create_offer",
        "rate_kobo": RATE_KOBO.to_string(),
        "min_amount": (10 * USDT).to_string(),
        "max_amount": (500 * USDT).to_string(),
        "bank_commitment": COMMITMENT,
    })
    .to_string();
    let result = contract.ft_on_transfer(seller(), U128(amount), msg);
    assert!(matches!(result, PromiseOrValue::Value(U128(0))));
    contract.next_offer_id - 1
}

fn open_trade(contract: &mut Contract, offer_id: u64, amount: u128) -> u64 {
    as_caller(buyer(), 3_000);
    contract.take_offer(U64(offer_id), U128(amount)).0
}

#[test]
fn creates_offer_from_token_deposit() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let offer = contract.get_offer(U64(offer_id)).unwrap();
    assert_eq!(offer.seller, seller());
    assert_eq!(offer.available.0, 1_000 * USDT);
    assert_eq!(offer.status, OfferStatus::Active);
}

#[test]
#[should_panic(expected = "Unsupported token")]
fn rejects_deposit_from_unknown_token() {
    let mut contract = setup();
    as_caller(accounts(4), 2_000);
    contract.ft_on_transfer(seller(), U128(USDT), "{}".into());
}

#[test]
#[should_panic(expected = "Invalid deposit message")]
fn rejects_malformed_deposit_message() {
    let mut contract = setup();
    as_caller(token(), 2_000);
    contract.ft_on_transfer(seller(), U128(USDT), "not json".into());
}

#[test]
fn take_offer_locks_liquidity_and_prices_in_kobo() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 100 * USDT);
    let trade = contract.get_trade(U64(trade_id)).unwrap();
    assert_eq!(trade.fiat_kobo.0, 100 * RATE_KOBO);
    assert_eq!(trade.fee.0, 100 * USDT * 50 / 10_000);
    assert_eq!(trade.status, TradeStatus::AwaitingPayment);
    assert_eq!(trade.expires_ms.0, 3_000 + WINDOW_MS);
    assert!(trade.reference.starts_with("KF") && trade.reference.len() == 8);
    let offer = contract.get_offer(U64(offer_id)).unwrap();
    assert_eq!(offer.available.0, 900 * USDT);
    assert_eq!(offer.locked.0, 100 * USDT);
    assert_eq!(contract.get_open_trade(buyer()).unwrap().id.0, trade_id);
}

#[test]
#[should_panic(expected = "Amount outside offer limits")]
fn take_offer_enforces_limits() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    open_trade(&mut contract, offer_id, 5 * USDT);
}

#[test]
#[should_panic(expected = "Seller cannot take own offer")]
fn seller_cannot_take_own_offer() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    as_caller(seller(), 3_000);
    contract.take_offer(U64(offer_id), U128(20 * USDT));
}

#[test]
#[should_panic(expected = "Finish your open trade first")]
fn buyer_limited_to_one_open_trade() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    open_trade(&mut contract, offer_id, 20 * USDT);
    open_trade(&mut contract, offer_id, 20 * USDT);
}

#[test]
#[should_panic(expected = "Agent not registered")]
fn only_registered_agent_can_confirm() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(buyer(), 4_000);
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
}

#[test]
fn agent_confirmation_releases_to_buyer() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(agent(), 4_000);
    let result = contract.confirm_payment(U64(trade_id), EVIDENCE.into());
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    let trade = contract.get_trade(U64(trade_id)).unwrap();
    assert_eq!(trade.status, TradeStatus::Releasing);
    assert_eq!(trade.evidence_hash.as_deref(), Some(EVIDENCE));
    assert_eq!(trade.verified_by, Some(agent()));
    assert!(contract.get_open_trade(buyer()).is_none());
    assert_eq!(contract.get_offer(U64(offer_id)).unwrap().locked.0, 0);

    assert_eq!(trade.deposit.0, TRADE_DEPOSIT.as_yoctonear());

    as_caller(contract_account(), 5_000);
    assert!(contract.on_payout(U64(trade_id), Ok(())));
    let trade = contract.get_trade(U64(trade_id)).unwrap();
    assert_eq!(trade.status, TradeStatus::Released);
    assert_eq!(trade.deposit.0, 0);
    assert_eq!(contract.get_contract_info().fees_collected.0, trade.fee.0);
}

#[test]
#[should_panic(expected = "as a trade deposit")]
fn take_offer_requires_deposit() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let mut builder = context(buyer(), 3_000);
    builder.attached_deposit(NearToken::from_yoctonear(0));
    testing_env!(builder.build());
    contract.take_offer(U64(offer_id), U128(20 * USDT));
}

#[test]
#[should_panic(expected = "Offer smaller than its minimum trade")]
fn offer_must_fill_its_minimum() {
    let mut contract = setup();
    create_offer(&mut contract, 5 * USDT);
}

#[test]
#[should_panic(expected = "Invalid trade limits")]
fn dust_minimum_is_rejected() {
    let mut contract = setup();
    as_caller(token(), 2_000);
    let msg = serde_json::json!({
        "action": "create_offer",
        "rate_kobo": RATE_KOBO.to_string(),
        "min_amount": "1",
        "max_amount": "1",
        "bank_commitment": COMMITMENT,
    })
    .to_string();
    contract.ft_on_transfer(seller(), U128(1), msg);
}

#[test]
fn closed_offer_is_removed_after_successful_withdrawal() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    as_caller(seller(), 4_000);
    contract.withdraw_offer(U64(offer_id), None);
    as_caller(contract_account(), 5_000);
    assert!(contract.on_offer_withdrawn(U64(offer_id), U128(1_000 * USDT), Ok(())));
    assert!(contract.get_offer(U64(offer_id)).is_none());
}

#[test]
fn failed_payout_can_be_retried() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(agent(), 4_000);
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
    as_caller(contract_account(), 5_000);
    assert!(!contract.on_payout(U64(trade_id), Err(PromiseError::Failed)));
    assert_eq!(
        contract.get_trade(U64(trade_id)).unwrap().status,
        TradeStatus::Verified
    );
    as_caller(accounts(5), 6_000);
    contract.retry_payout(U64(trade_id));
    assert_eq!(
        contract.get_trade(U64(trade_id)).unwrap().status,
        TradeStatus::Releasing
    );
}

#[test]
#[should_panic(expected = "Trade has no pending payout")]
fn payout_in_flight_cannot_be_doubled() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(agent(), 4_000);
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
    contract.retry_payout(U64(trade_id));
}

#[test]
#[should_panic(expected = "Trade is not awaiting payment")]
fn cannot_confirm_twice() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(agent(), 4_000);
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
}

#[test]
fn buyer_can_cancel_and_liquidity_returns() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(buyer(), 4_000);
    contract.cancel_trade(U64(trade_id));
    let offer = contract.get_offer(U64(offer_id)).unwrap();
    assert_eq!(offer.available.0, 1_000 * USDT);
    assert_eq!(offer.locked.0, 0);
    assert_eq!(
        contract.get_trade(U64(trade_id)).unwrap().status,
        TradeStatus::Cancelled
    );
}

#[test]
#[should_panic(expected = "Not allowed to cancel yet")]
fn seller_cannot_reclaim_before_grace() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(seller(), 3_000 + WINDOW_MS + 1);
    contract.cancel_trade(U64(trade_id));
}

#[test]
fn seller_reclaims_after_grace() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(seller(), 3_000 + WINDOW_MS + GRACE_MS);
    contract.cancel_trade(U64(trade_id));
    assert_eq!(contract.get_offer(U64(offer_id)).unwrap().available.0, 1_000 * USDT);
}

#[test]
#[should_panic(expected = "Trade is not awaiting payment")]
fn cancelled_trade_cannot_be_confirmed() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(buyer(), 4_000);
    contract.cancel_trade(U64(trade_id));
    as_caller(agent(), 5_000);
    contract.confirm_payment(U64(trade_id), EVIDENCE.into());
}

#[test]
fn expired_agent_is_removed_on_use() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    let trade_id = open_trade(&mut contract, offer_id, 50 * USDT);
    as_caller(agent(), 8 * 24 * 60 * 60 * 1000);
    let result = contract.confirm_payment(U64(trade_id), EVIDENCE.into());
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    assert!(contract.get_agent(agent()).is_none());
    assert_eq!(
        contract.get_trade(U64(trade_id)).unwrap().status,
        TradeStatus::AwaitingPayment
    );
}

#[test]
fn seller_can_pause_and_withdraw() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    as_caller(seller(), 4_000);
    contract.set_offer_status(U64(offer_id), OfferStatus::Paused);
    assert!(contract.get_offers(None, None, Some(true)).is_empty());
    contract.withdraw_offer(U64(offer_id), None);
    let offer = contract.get_offer(U64(offer_id)).unwrap();
    assert_eq!(offer.available.0, 0);
    assert_eq!(offer.status, OfferStatus::Closed);
    as_caller(contract_account(), 5_000);
    assert!(!contract.on_offer_withdrawn(U64(offer_id), U128(1_000 * USDT), Err(PromiseError::Failed)));
    let offer = contract.get_offer(U64(offer_id)).unwrap();
    assert_eq!(offer.available.0, 1_000 * USDT);
    assert_eq!(offer.status, OfferStatus::Paused);
}

#[test]
#[should_panic(expected = "Only the seller can withdraw")]
fn others_cannot_withdraw_offer() {
    let mut contract = setup();
    let offer_id = create_offer(&mut contract, 1_000 * USDT);
    as_caller(buyer(), 4_000);
    contract.withdraw_offer(U64(offer_id), None);
}

#[test]
#[should_panic(expected = "Fee too high")]
fn fee_is_capped() {
    let mut contract = setup();
    as_caller(owner(), 4_000);
    contract.set_fee(500, owner());
}
