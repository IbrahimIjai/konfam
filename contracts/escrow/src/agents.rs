use crate::*;

#[near]
impl Contract {
    #[payable]
    pub fn register_agent(&mut self, attestation: DstackAttestation) -> bool {
        let predecessor = env::predecessor_account_id();
        if self.agents.get(&predecessor).is_none() {
            let storage_cost = env::storage_byte_cost()
                .checked_mul(STORAGE_BYTES_TO_REGISTER)
                .unwrap();
            require!(
                env::attached_deposit() >= storage_cost,
                format!(
                    "Attached deposit must be greater than storage cost {}",
                    storage_cost.exact_amount_display()
                )
            );
        }

        let (measurements, ppid, advisory_ids) = self.verify_attestation(attestation);
        let valid_until_ms = block_timestamp_ms() + self.attestation_expiration_time_ms;
        let (advisory_ids_truncated, number_of_advisory_ids) =
            events::summarize_advisory_ids(&advisory_ids);

        Event::AgentRegistered {
            account_id: &predecessor,
            measurements: &measurements,
            ppid: &ppid,
            advisory_ids_truncated,
            number_of_advisory_ids,
            valid_until_ms: U64(valid_until_ms),
        }
        .emit();

        self.agents.insert(
            predecessor,
            Agent {
                measurements,
                ppid,
                valid_until_ms,
            },
        );
        true
    }

    #[private]
    pub fn fail_on_invalid_agent(reasons: Vec<AgentRemovalReason>) {
        env::panic_str(&format!("Invalid agent: {:?}", reasons));
    }
}

impl Contract {
    pub(crate) fn verify_attestation(
        &self,
        attestation: DstackAttestation,
    ) -> (FullMeasurementsHex, Ppid, Vec<String>) {
        if self.requires_tee {
            let account_id_str = env::predecessor_account_id().to_string();
            require!(
                account_id_str.len() == 64
                    && account_id_str
                        .chars()
                        .all(|c| c.is_ascii_hexdigit() && !c.is_uppercase()),
                "Account ID must be implicit account"
            );
            let account_id_bytes = hex::decode(&account_id_str).expect("Invalid account ID");
            let mut report_data_bytes = [0u8; 64];
            report_data_bytes[..32].copy_from_slice(&account_id_bytes);
            let expected_report_data = ReportData::from(report_data_bytes);
            let expected_measurements: Vec<FullMeasurements> = self
                .approved_measurements
                .iter()
                .cloned()
                .map(Into::into)
                .collect();
            let approved_ppids: Vec<Ppid> = self.approved_ppids.iter().cloned().collect();
            match attestation.verify(
                expected_report_data,
                block_timestamp_ms() / 1000,
                &expected_measurements,
                &approved_ppids,
            ) {
                Ok(AcceptedDstackAttestation {
                    measurements,
                    ppid,
                    advisory_ids,
                }) => (measurements.into(), ppid, advisory_ids),
                Err(e) => env::panic_str(&format!("Attestation verification failed: {}", e)),
            }
        } else {
            require!(
                self.whitelisted_agents_for_local
                    .contains(&env::predecessor_account_id()),
                "Agent needs to be whitelisted for local mode"
            );
            let default_measurements = create_mock_full_measurements_hex();
            require!(
                self.approved_measurements.contains(&default_measurements),
                "Default measurements must be approved for local mode"
            );
            require!(
                self.approved_ppids.contains(&Ppid::default()),
                "Default PPID must be approved for local mode"
            );
            (default_measurements, Ppid::default(), Vec::new())
        }
    }

    pub(crate) fn require_valid_agent(&mut self) -> Option<Promise> {
        let account_id = env::predecessor_account_id();
        let agent = self.agents.get(&account_id).expect("Agent not registered");
        let reasons = self.check_invalid_reasons(&account_id, agent);
        if reasons.is_empty() {
            return None;
        }
        self.agents.remove(&account_id);
        Event::AgentRemoved {
            account_id: &account_id,
            reasons: reasons.clone(),
        }
        .emit();
        let args = serde_json::json!({ "reasons": reasons });
        Some(Promise::new(env::current_account_id()).function_call(
            "fail_on_invalid_agent".to_string(),
            serde_json::to_vec(&args).expect("Failed to serialize reasons"),
            NearToken::from_near(0),
            Gas::from_tgas(10),
        ))
    }

    pub(crate) fn check_invalid_reasons(
        &self,
        account_id: &AccountId,
        agent: &Agent,
    ) -> Vec<AgentRemovalReason> {
        let mut reasons = Vec::new();
        if agent.valid_until_ms < block_timestamp_ms() {
            reasons.push(AgentRemovalReason::ExpiredAttestation);
        }
        if !self.approved_measurements.contains(&agent.measurements) {
            reasons.push(AgentRemovalReason::InvalidMeasurements);
        }
        if !self.approved_ppids.contains(&agent.ppid) {
            reasons.push(AgentRemovalReason::InvalidPpid);
        }
        if !self.requires_tee && !self.whitelisted_agents_for_local.contains(account_id) {
            reasons.push(AgentRemovalReason::NotWhitelistedForLocal);
        }
        reasons
    }

    pub(crate) fn require_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Caller is not the owner"
        );
    }
}
