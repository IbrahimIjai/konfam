use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue,
    env::{self, block_timestamp_ms},
    ext_contract,
    json_types::{U64, U128},
    log, near, require,
    serde::Serialize,
    serde_json,
    store::{IterableMap, IterableSet, LookupMap},
};
use shade_attestation::{
    attestation::{AcceptedDstackAttestation, DstackAttestation},
    measurements::{FullMeasurements, FullMeasurementsHex, create_mock_full_measurements_hex},
    report_data::ReportData,
    tcb_info::HexBytes,
};

mod agents;
mod escrow;
mod events;
mod owner;
mod types;
mod views;

#[cfg(test)]
mod tests;

pub use events::Event;
pub use types::*;

pub type Ppid = HexBytes<16>;

pub const MAX_FEE_BPS: u16 = 200;
pub const TRADE_DEPOSIT: NearToken = NearToken::from_millinear(10);
pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(15);
const STORAGE_BYTES_TO_REGISTER: u128 = 486;

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[derive(BorshStorageKey)]
#[near]
pub enum StorageKey {
    ApprovedMeasurements,
    ApprovedPpids,
    Agents,
    WhitelistedAgentsForLocal,
    Offers,
    Trades,
    OpenTradeByBuyer,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub requires_tee: bool,
    pub attestation_expiration_time_ms: u64,
    pub owner_id: AccountId,
    pub token_id: AccountId,
    pub token_decimals: u8,
    pub fee_bps: u16,
    pub fee_recipient: AccountId,
    pub payment_window_ms: u64,
    pub release_grace_ms: u64,
    pub fees_collected: u128,
    pub next_offer_id: u64,
    pub next_trade_id: u64,
    pub approved_measurements: IterableSet<FullMeasurementsHex>,
    pub approved_ppids: IterableSet<Ppid>,
    pub agents: IterableMap<AccountId, Agent>,
    pub whitelisted_agents_for_local: IterableSet<AccountId>,
    pub offers: IterableMap<u64, Offer>,
    pub trades: IterableMap<u64, Trade>,
    pub open_trade_by_buyer: LookupMap<AccountId, u64>,
}

#[near]
impl Contract {
    #[init]
    #[private]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        requires_tee: bool,
        attestation_expiration_time_ms: U64,
        owner_id: AccountId,
        token_id: AccountId,
        token_decimals: u8,
        fee_bps: u16,
        fee_recipient: AccountId,
        payment_window_ms: U64,
        release_grace_ms: U64,
    ) -> Self {
        require!(fee_bps <= MAX_FEE_BPS, "Fee too high");
        Self {
            requires_tee,
            attestation_expiration_time_ms: attestation_expiration_time_ms.0,
            owner_id,
            token_id,
            token_decimals,
            fee_bps,
            fee_recipient,
            payment_window_ms: payment_window_ms.0,
            release_grace_ms: release_grace_ms.0,
            fees_collected: 0,
            next_offer_id: 1,
            next_trade_id: 1,
            approved_measurements: IterableSet::new(StorageKey::ApprovedMeasurements),
            approved_ppids: IterableSet::new(StorageKey::ApprovedPpids),
            agents: IterableMap::new(StorageKey::Agents),
            whitelisted_agents_for_local: IterableSet::new(StorageKey::WhitelistedAgentsForLocal),
            offers: IterableMap::new(StorageKey::Offers),
            trades: IterableMap::new(StorageKey::Trades),
            open_trade_by_buyer: LookupMap::new(StorageKey::OpenTradeByBuyer),
        }
    }
}
