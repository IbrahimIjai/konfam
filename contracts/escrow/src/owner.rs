use crate::*;

#[near]
impl Contract {
    pub fn update_attestation_expiration_time(&mut self, attestation_expiration_time_ms: U64) {
        self.require_owner();
        self.attestation_expiration_time_ms = attestation_expiration_time_ms.0;
    }

    pub fn update_owner_id(&mut self, owner_id: AccountId) {
        self.require_owner();
        self.owner_id = owner_id;
    }

    pub fn approve_measurements(&mut self, measurements: FullMeasurementsHex) {
        self.require_owner();
        self.approved_measurements.insert(measurements);
    }

    pub fn remove_measurements(&mut self, measurements: FullMeasurementsHex) {
        self.require_owner();
        require!(
            self.approved_measurements.remove(&measurements),
            "Measurements not in approved list"
        );
    }

    pub fn approve_ppids(&mut self, ppids: Vec<Ppid>) {
        self.require_owner();
        for ppid in ppids {
            self.approved_ppids.insert(ppid);
        }
    }

    pub fn remove_ppids(&mut self, ppids: Vec<Ppid>) {
        self.require_owner();
        for ppid in ppids {
            require!(self.approved_ppids.remove(&ppid), "PPID not in approved list");
        }
    }

    pub fn remove_agent(&mut self, account_id: AccountId) {
        self.require_owner();
        require!(
            self.agents.remove(&account_id).is_some(),
            "Agent not registered"
        );
        Event::AgentRemoved {
            account_id: &account_id,
            reasons: vec![AgentRemovalReason::ManualRemoval],
        }
        .emit();
    }

    pub fn whitelist_agent_for_local(&mut self, account_id: AccountId) {
        require!(!self.requires_tee, "Whitelisting is not supported for TEE");
        self.require_owner();
        self.whitelisted_agents_for_local.insert(account_id);
    }

    pub fn remove_agent_from_whitelist_for_local(&mut self, account_id: AccountId) {
        require!(!self.requires_tee, "Whitelisting is not supported for TEE");
        self.require_owner();
        require!(
            self.whitelisted_agents_for_local.remove(&account_id),
            "Agent not in whitelist for local"
        );
    }

    pub fn set_fee(&mut self, fee_bps: u16, fee_recipient: AccountId) {
        self.require_owner();
        require!(fee_bps <= MAX_FEE_BPS, "Fee too high");
        self.fee_bps = fee_bps;
        self.fee_recipient = fee_recipient;
    }

    pub fn set_windows(&mut self, payment_window_ms: U64, release_grace_ms: U64) {
        self.require_owner();
        require!(payment_window_ms.0 >= 60_000, "Payment window too short");
        self.payment_window_ms = payment_window_ms.0;
        self.release_grace_ms = release_grace_ms.0;
    }

    pub fn withdraw_fees(&mut self) -> Promise {
        self.require_owner();
        let amount = self.fees_collected;
        require!(amount > 0, "No fees to withdraw");
        self.fees_collected = 0;
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(self.fee_recipient.clone(), U128(amount), Some("konfam fees".into()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_fees_withdrawn(U128(amount)),
            )
    }

    #[private]
    pub fn on_fees_withdrawn(
        &mut self,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_err() {
            self.fees_collected += amount.0;
            return false;
        }
        true
    }
}
