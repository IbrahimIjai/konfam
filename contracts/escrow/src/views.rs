use crate::*;

fn page(from_index: Option<u32>, limit: Option<u32>, total: usize) -> (usize, usize) {
    let from = from_index.unwrap_or(0) as usize;
    let limit = limit.map(|l| l as usize).unwrap_or(total).min(100);
    (from, limit)
}

#[near]
impl Contract {
    pub fn get_contract_info(&self) -> ContractInfo {
        ContractInfo {
            requires_tee: self.requires_tee,
            trade_deposit: U128(TRADE_DEPOSIT.as_yoctonear()),
            attestation_expiration_time_ms: U64(self.attestation_expiration_time_ms),
            owner_id: self.owner_id.clone(),
            token_id: self.token_id.clone(),
            token_decimals: self.token_decimals,
            fee_bps: self.fee_bps,
            fee_recipient: self.fee_recipient.clone(),
            payment_window_ms: U64(self.payment_window_ms),
            release_grace_ms: U64(self.release_grace_ms),
            fees_collected: U128(self.fees_collected),
            offer_count: self.next_offer_id - 1,
            trade_count: self.next_trade_id - 1,
        }
    }

    pub fn get_approved_measurements(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<FullMeasurementsHex> {
        let (from, limit) = page(from_index, limit, self.approved_measurements.len() as usize);
        self.approved_measurements
            .iter()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_approved_ppids(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Ppid> {
        let (from, limit) = page(from_index, limit, self.approved_ppids.len() as usize);
        self.approved_ppids
            .iter()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    pub fn get_agent(&self, account_id: AccountId) -> Option<AgentView> {
        self.agents
            .get(&account_id)
            .map(|agent| self.agent_view(&account_id, agent))
    }

    pub fn get_agents(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<AgentView> {
        let (from, limit) = page(from_index, limit, self.agents.len() as usize);
        self.agents
            .iter()
            .skip(from)
            .take(limit)
            .map(|(account_id, agent)| self.agent_view(account_id, agent))
            .collect()
    }

    pub fn get_whitelisted_agents_for_local(&self) -> Vec<AccountId> {
        require!(!self.requires_tee, "Whitelist is not used in TEE mode");
        self.whitelisted_agents_for_local.iter().cloned().collect()
    }

    pub fn get_offer(&self, offer_id: U64) -> Option<OfferView> {
        self.offers.get(&offer_id.0).map(|o| o.to_view(offer_id.0))
    }

    pub fn get_offers(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
        active_only: Option<bool>,
    ) -> Vec<OfferView> {
        let (from, limit) = page(from_index, limit, self.offers.len() as usize);
        let active_only = active_only.unwrap_or(false);
        self.offers
            .iter()
            .filter(|(_, o)| !active_only || (o.status == OfferStatus::Active && o.available > 0))
            .skip(from)
            .take(limit)
            .map(|(id, o)| o.to_view(*id))
            .collect()
    }

    pub fn get_offers_by_seller(&self, seller: AccountId) -> Vec<OfferView> {
        self.offers
            .iter()
            .filter(|(_, o)| o.seller == seller)
            .map(|(id, o)| o.to_view(*id))
            .collect()
    }

    pub fn get_trade(&self, trade_id: U64) -> Option<TradeView> {
        self.trades
            .get(&trade_id.0)
            .map(|t| t.to_view(trade_id.0, self.release_grace_ms))
    }

    pub fn get_trades(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<TradeView> {
        let (from, limit) = page(from_index, limit, self.trades.len() as usize);
        self.trades
            .iter()
            .skip(from)
            .take(limit)
            .map(|(id, t)| t.to_view(*id, self.release_grace_ms))
            .collect()
    }

    pub fn get_trades_for(&self, account_id: AccountId) -> Vec<TradeView> {
        self.trades
            .iter()
            .filter(|(_, t)| t.buyer == account_id || t.seller == account_id)
            .map(|(id, t)| t.to_view(*id, self.release_grace_ms))
            .collect()
    }

    pub fn get_open_trade(&self, buyer: AccountId) -> Option<TradeView> {
        self.open_trade_by_buyer
            .get(&buyer)
            .and_then(|id| self.get_trade(U64(*id)))
    }
}

impl Contract {
    fn agent_view(&self, account_id: &AccountId, agent: &Agent) -> AgentView {
        let reasons = self.check_invalid_reasons(account_id, agent);
        AgentView {
            account_id: account_id.clone(),
            measurements: agent.measurements.clone(),
            ppid: agent.ppid.clone(),
            valid_until_ms: U64(agent.valid_until_ms),
            validity: if reasons.is_empty() {
                AgentValidity::Valid
            } else {
                AgentValidity::Invalid(reasons)
            },
        }
    }
}
