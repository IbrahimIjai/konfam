use crate::*;

#[near(serializers = [borsh])]
pub struct Agent {
    pub measurements: FullMeasurementsHex,
    pub ppid: Ppid,
    pub valid_until_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OfferStatus {
    Active,
    Paused,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradeStatus {
    AwaitingPayment,
    Releasing,
    Verified,
    Released,
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Offer {
    pub seller: AccountId,
    pub available: u128,
    pub locked: u128,
    pub min_amount: u128,
    pub max_amount: u128,
    pub rate_kobo: u128,
    pub bank_commitment: String,
    pub status: OfferStatus,
    pub created_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Trade {
    pub offer_id: u64,
    pub seller: AccountId,
    pub buyer: AccountId,
    pub amount: u128,
    pub fee: u128,
    pub deposit: u128,
    pub fiat_kobo: u128,
    pub reference: String,
    pub opened_ms: u64,
    pub expires_ms: u64,
    pub status: TradeStatus,
    pub evidence_hash: Option<String>,
    pub verified_by: Option<AccountId>,
    pub settled_ms: Option<u64>,
}

#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum DepositMsg {
    CreateOffer {
        rate_kobo: U128,
        min_amount: U128,
        max_amount: U128,
        bank_commitment: String,
    },
    TopUp {
        offer_id: U64,
    },
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AgentRemovalReason {
    ManualRemoval,
    ExpiredAttestation,
    InvalidMeasurements,
    InvalidPpid,
    NotWhitelistedForLocal,
}

#[near(serializers = [json])]
pub enum AgentValidity {
    Valid,
    Invalid(Vec<AgentRemovalReason>),
}

#[near(serializers = [json])]
pub struct AgentView {
    pub account_id: AccountId,
    pub measurements: FullMeasurementsHex,
    pub ppid: Ppid,
    pub valid_until_ms: U64,
    pub validity: AgentValidity,
}

#[near(serializers = [json])]
pub struct ContractInfo {
    pub requires_tee: bool,
    pub trade_deposit: U128,
    pub attestation_expiration_time_ms: U64,
    pub owner_id: AccountId,
    pub token_id: AccountId,
    pub token_decimals: u8,
    pub fee_bps: u16,
    pub fee_recipient: AccountId,
    pub payment_window_ms: U64,
    pub release_grace_ms: U64,
    pub fees_collected: U128,
    pub offer_count: u64,
    pub trade_count: u64,
}

#[near(serializers = [json])]
pub struct OfferView {
    pub id: U64,
    pub seller: AccountId,
    pub available: U128,
    pub locked: U128,
    pub min_amount: U128,
    pub max_amount: U128,
    pub rate_kobo: U128,
    pub bank_commitment: String,
    pub status: OfferStatus,
    pub created_ms: U64,
}

#[near(serializers = [json])]
pub struct TradeView {
    pub id: U64,
    pub offer_id: U64,
    pub seller: AccountId,
    pub buyer: AccountId,
    pub amount: U128,
    pub fee: U128,
    pub deposit: U128,
    pub fiat_kobo: U128,
    pub reference: String,
    pub opened_ms: U64,
    pub expires_ms: U64,
    pub reclaimable_after_ms: U64,
    pub status: TradeStatus,
    pub evidence_hash: Option<String>,
    pub verified_by: Option<AccountId>,
    pub settled_ms: Option<U64>,
}

impl Offer {
    pub fn to_view(&self, id: u64) -> OfferView {
        OfferView {
            id: U64(id),
            seller: self.seller.clone(),
            available: U128(self.available),
            locked: U128(self.locked),
            min_amount: U128(self.min_amount),
            max_amount: U128(self.max_amount),
            rate_kobo: U128(self.rate_kobo),
            bank_commitment: self.bank_commitment.clone(),
            status: self.status,
            created_ms: U64(self.created_ms),
        }
    }
}

impl Trade {
    pub fn to_view(&self, id: u64, release_grace_ms: u64) -> TradeView {
        TradeView {
            id: U64(id),
            offer_id: U64(self.offer_id),
            seller: self.seller.clone(),
            buyer: self.buyer.clone(),
            amount: U128(self.amount),
            fee: U128(self.fee),
            deposit: U128(self.deposit),
            fiat_kobo: U128(self.fiat_kobo),
            reference: self.reference.clone(),
            opened_ms: U64(self.opened_ms),
            expires_ms: U64(self.expires_ms),
            reclaimable_after_ms: U64(self.expires_ms + release_grace_ms),
            status: self.status,
            evidence_hash: self.evidence_hash.clone(),
            verified_by: self.verified_by.clone(),
            settled_ms: self.settled_ms.map(U64),
        }
    }
}
