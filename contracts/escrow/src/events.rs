use crate::*;

const EVENT_STANDARD: &str = "konfam";
const EVENT_STANDARD_VERSION: &str = "1.0.0";
const MAX_ADVISORY_IDS: usize = 8;

pub fn summarize_advisory_ids(advisory_ids: &[String]) -> (Vec<String>, u16) {
    let total = u16::try_from(advisory_ids.len()).unwrap_or(u16::MAX);
    let truncated = advisory_ids.iter().take(MAX_ADVISORY_IDS).cloned().collect();
    (truncated, total)
}

#[derive(Serialize, Debug, Clone)]
#[serde(crate = "near_sdk::serde")]
#[serde(tag = "event", content = "data")]
#[serde(rename_all = "snake_case")]
#[must_use]
pub enum Event<'a> {
    AgentRegistered {
        account_id: &'a AccountId,
        measurements: &'a FullMeasurementsHex,
        ppid: &'a Ppid,
        advisory_ids_truncated: Vec<String>,
        number_of_advisory_ids: u16,
        valid_until_ms: U64,
    },
    AgentRemoved {
        account_id: &'a AccountId,
        reasons: Vec<AgentRemovalReason>,
    },
    OfferCreated {
        offer_id: U64,
        seller: &'a AccountId,
        amount: U128,
        rate_kobo: U128,
    },
    OfferFunded {
        offer_id: U64,
        amount: U128,
    },
    OfferUpdated {
        offer_id: U64,
        status: OfferStatus,
    },
    OfferWithdrawn {
        offer_id: U64,
        amount: U128,
    },
    TradeOpened {
        trade_id: U64,
        offer_id: U64,
        buyer: &'a AccountId,
        amount: U128,
        fiat_kobo: U128,
        reference: &'a str,
        expires_ms: U64,
    },
    PaymentConfirmed {
        trade_id: U64,
        agent: &'a AccountId,
        evidence_hash: &'a str,
    },
    TradeReleased {
        trade_id: U64,
        buyer: &'a AccountId,
        amount: U128,
        fee: U128,
    },
    PayoutFailed {
        trade_id: U64,
    },
    TradeCancelled {
        trade_id: U64,
        by: &'a AccountId,
    },
}

impl Event<'_> {
    pub fn emit(&self) {
        let data = serde_json::json!(self);
        let event_json = serde_json::json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_STANDARD_VERSION,
            "event": data["event"],
            "data": [data["data"]]
        });
        log!("EVENT_JSON:{}", event_json);
    }
}
