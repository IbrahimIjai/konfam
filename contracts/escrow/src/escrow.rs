use crate::*;

const REFERENCE_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

fn is_hex_digest(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit() && !c.is_uppercase())
}

#[near]
impl Contract {
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token_id,
            "Unsupported token"
        );
        require!(amount.0 > 0, "Amount must be positive");
        let message: DepositMsg =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Invalid deposit message"));
        match message {
            DepositMsg::CreateOffer {
                rate_kobo,
                min_amount,
                max_amount,
                bank_commitment,
            } => {
                require!(rate_kobo.0 > 0, "Rate must be positive");
                require!(
                    min_amount.0 >= 10u128.pow(self.token_decimals as u32)
                        && min_amount.0 <= max_amount.0,
                    "Invalid trade limits"
                );
                require!(amount.0 >= min_amount.0, "Offer smaller than its minimum trade");
                require!(is_hex_digest(&bank_commitment), "Invalid bank commitment");
                let offer_id = self.next_offer_id;
                self.next_offer_id += 1;
                self.offers.insert(
                    offer_id,
                    Offer {
                        seller: sender_id.clone(),
                        available: amount.0,
                        locked: 0,
                        min_amount: min_amount.0,
                        max_amount: max_amount.0,
                        rate_kobo: rate_kobo.0,
                        bank_commitment,
                        status: OfferStatus::Active,
                        created_ms: block_timestamp_ms(),
                    },
                );
                Event::OfferCreated {
                    offer_id: U64(offer_id),
                    seller: &sender_id,
                    amount,
                    rate_kobo,
                }
                .emit();
            }
            DepositMsg::TopUp { offer_id } => {
                let offer = self.offers.get_mut(&offer_id.0).expect("Offer not found");
                require!(offer.seller == sender_id, "Only the seller can top up");
                require!(offer.status != OfferStatus::Closed, "Offer is closed");
                offer.available += amount.0;
                Event::OfferFunded { offer_id, amount }.emit();
            }
        }
        PromiseOrValue::Value(U128(0))
    }

    #[payable]
    pub fn take_offer(&mut self, offer_id: U64, amount: U128) -> U64 {
        let buyer = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        require!(
            deposit >= TRADE_DEPOSIT,
            format!("Attach {} as a trade deposit", TRADE_DEPOSIT.exact_amount_display())
        );
        require!(
            !self.open_trade_by_buyer.contains_key(&buyer),
            "Finish your open trade first"
        );
        let decimals = self.token_decimals;
        let fee_bps = self.fee_bps;
        let offer = self.offers.get_mut(&offer_id.0).expect("Offer not found");
        require!(offer.status == OfferStatus::Active, "Offer is not active");
        require!(offer.seller != buyer, "Seller cannot take own offer");
        require!(
            amount.0 >= offer.min_amount && amount.0 <= offer.max_amount,
            "Amount outside offer limits"
        );
        require!(amount.0 <= offer.available, "Not enough liquidity");

        let unit = 10u128.pow(decimals as u32);
        let fiat_kobo = amount
            .0
            .checked_mul(offer.rate_kobo)
            .expect("Overflow")
            .div_ceil(unit);
        require!(fiat_kobo > 0, "Trade too small");
        let fee = amount.0 * fee_bps as u128 / 10_000;

        offer.available -= amount.0;
        offer.locked += amount.0;
        let seller = offer.seller.clone();

        let trade_id = self.next_trade_id;
        self.next_trade_id += 1;
        let now = block_timestamp_ms();
        let expires_ms = now + self.payment_window_ms;
        let reference = Self::make_reference(trade_id);

        Event::TradeOpened {
            trade_id: U64(trade_id),
            offer_id,
            buyer: &buyer,
            amount,
            fiat_kobo: U128(fiat_kobo),
            reference: &reference,
            expires_ms: U64(expires_ms),
        }
        .emit();

        self.trades.insert(
            trade_id,
            Trade {
                offer_id: offer_id.0,
                seller,
                buyer: buyer.clone(),
                amount: amount.0,
                fee,
                deposit: deposit.as_yoctonear(),
                fiat_kobo,
                reference,
                opened_ms: now,
                expires_ms,
                status: TradeStatus::AwaitingPayment,
                evidence_hash: None,
                verified_by: None,
                settled_ms: None,
            },
        );
        self.open_trade_by_buyer.insert(buyer, trade_id);
        U64(trade_id)
    }

    pub fn confirm_payment(&mut self, trade_id: U64, evidence_hash: String) -> PromiseOrValue<bool> {
        if let Some(failure) = self.require_valid_agent() {
            return PromiseOrValue::Promise(failure);
        }
        require!(is_hex_digest(&evidence_hash), "Invalid evidence hash");
        let agent = env::predecessor_account_id();
        let trade = self.trades.get_mut(&trade_id.0).expect("Trade not found");
        require!(
            trade.status == TradeStatus::AwaitingPayment,
            "Trade is not awaiting payment"
        );
        trade.status = TradeStatus::Verified;
        trade.evidence_hash = Some(evidence_hash.clone());
        trade.verified_by = Some(agent.clone());
        let offer_id = trade.offer_id;
        let amount = trade.amount;
        let buyer = trade.buyer.clone();

        if let Some(offer) = self.offers.get_mut(&offer_id) {
            offer.locked -= amount;
        }
        self.open_trade_by_buyer.remove(&buyer);

        Event::PaymentConfirmed {
            trade_id,
            agent: &agent,
            evidence_hash: &evidence_hash,
        }
        .emit();

        PromiseOrValue::Promise(self.internal_payout(trade_id.0))
    }

    pub fn retry_payout(&mut self, trade_id: U64) -> Promise {
        let trade = self.trades.get(&trade_id.0).expect("Trade not found");
        require!(
            trade.status == TradeStatus::Verified,
            "Trade has no pending payout"
        );
        self.internal_payout(trade_id.0)
    }

    pub fn cancel_trade(&mut self, trade_id: U64) {
        let caller = env::predecessor_account_id();
        let grace = self.release_grace_ms;
        let trade = self.trades.get_mut(&trade_id.0).expect("Trade not found");
        require!(
            trade.status == TradeStatus::AwaitingPayment,
            "Trade cannot be cancelled"
        );
        let is_buyer = caller == trade.buyer;
        let seller_may_reclaim =
            caller == trade.seller && block_timestamp_ms() >= trade.expires_ms + grace;
        require!(is_buyer || seller_may_reclaim, "Not allowed to cancel yet");

        trade.status = TradeStatus::Cancelled;
        trade.settled_ms = Some(block_timestamp_ms());
        let offer_id = trade.offer_id;
        let amount = trade.amount;
        let buyer = trade.buyer.clone();

        let offer = self.offers.get_mut(&offer_id).expect("Offer not found");
        offer.locked -= amount;
        offer.available += amount;
        self.open_trade_by_buyer.remove(&buyer);

        Event::TradeCancelled {
            trade_id,
            by: &caller,
        }
        .emit();
    }

    pub fn set_offer_status(&mut self, offer_id: U64, status: OfferStatus) {
        require!(status != OfferStatus::Closed, "Use withdraw_offer to close");
        let offer = self.offers.get_mut(&offer_id.0).expect("Offer not found");
        require!(
            offer.seller == env::predecessor_account_id(),
            "Only the seller can update"
        );
        require!(offer.status != OfferStatus::Closed, "Offer is closed");
        offer.status = status;
        Event::OfferUpdated { offer_id, status }.emit();
    }

    pub fn update_offer(
        &mut self,
        offer_id: U64,
        rate_kobo: Option<U128>,
        min_amount: Option<U128>,
        max_amount: Option<U128>,
        bank_commitment: Option<String>,
    ) {
        let offer = self.offers.get_mut(&offer_id.0).expect("Offer not found");
        require!(
            offer.seller == env::predecessor_account_id(),
            "Only the seller can update"
        );
        require!(offer.status != OfferStatus::Closed, "Offer is closed");
        if let Some(rate) = rate_kobo {
            require!(rate.0 > 0, "Rate must be positive");
            offer.rate_kobo = rate.0;
        }
        if let Some(min) = min_amount {
            require!(min.0 >= 10u128.pow(self.token_decimals as u32), "Invalid trade limits");
            offer.min_amount = min.0;
        }
        if let Some(max) = max_amount {
            offer.max_amount = max.0;
        }
        require!(
            offer.min_amount > 0 && offer.min_amount <= offer.max_amount,
            "Invalid trade limits"
        );
        if let Some(commitment) = bank_commitment {
            require!(is_hex_digest(&commitment), "Invalid bank commitment");
            offer.bank_commitment = commitment;
        }
        let status = offer.status;
        Event::OfferUpdated { offer_id, status }.emit();
    }

    pub fn withdraw_offer(&mut self, offer_id: U64, amount: Option<U128>) -> Promise {
        let offer = self.offers.get_mut(&offer_id.0).expect("Offer not found");
        let seller = env::predecessor_account_id();
        require!(offer.seller == seller, "Only the seller can withdraw");
        let value = amount.map(|a| a.0).unwrap_or(offer.available);
        require!(value > 0 && value <= offer.available, "Invalid withdraw amount");
        offer.available -= value;
        if amount.is_none() && offer.locked == 0 {
            offer.status = OfferStatus::Closed;
        }
        Event::OfferWithdrawn {
            offer_id,
            amount: U128(value),
        }
        .emit();
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(seller, U128(value), Some(format!("konfam offer {}", offer_id.0)))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_offer_withdrawn(offer_id, U128(value)),
            )
    }

    #[private]
    pub fn on_offer_withdrawn(
        &mut self,
        offer_id: U64,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        if result.is_ok() {
            let finished = self.offers.get(&offer_id.0).is_some_and(|offer| {
                offer.status == OfferStatus::Closed && offer.available == 0 && offer.locked == 0
            });
            if finished {
                self.offers.remove(&offer_id.0);
            }
            return true;
        }
        if let Some(offer) = self.offers.get_mut(&offer_id.0) {
            offer.available += amount.0;
            if offer.status == OfferStatus::Closed {
                offer.status = OfferStatus::Paused;
            }
        }
        false
    }

    #[private]
    pub fn on_payout(
        &mut self,
        trade_id: U64,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        let trade = self.trades.get_mut(&trade_id.0).expect("Trade not found");
        if result.is_err() {
            trade.status = TradeStatus::Verified;
            Event::PayoutFailed { trade_id }.emit();
            return false;
        }
        trade.status = TradeStatus::Released;
        trade.settled_ms = Some(block_timestamp_ms());
        let fee = trade.fee;
        let buyer = trade.buyer.clone();
        let net = trade.amount - fee;
        let deposit = trade.deposit;
        trade.deposit = 0;
        self.fees_collected += fee;
        Event::TradeReleased {
            trade_id,
            buyer: &buyer,
            amount: U128(net),
            fee: U128(fee),
        }
        .emit();
        if deposit > 0 {
            Promise::new(buyer).transfer(NearToken::from_yoctonear(deposit)).detach();
        }
        true
    }
}

impl Contract {
    fn internal_payout(&mut self, trade_id: u64) -> Promise {
        let trade = self.trades.get_mut(&trade_id).expect("Trade not found");
        trade.status = TradeStatus::Releasing;
        let net = trade.amount - trade.fee;
        let buyer = trade.buyer.clone();
        let memo = trade.reference.clone();
        ext_ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(buyer, U128(net), Some(memo))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_payout(U64(trade_id)),
            )
    }

    pub(crate) fn make_reference(trade_id: u64) -> String {
        let seed = env::random_seed();
        let mut reference = String::from("KF");
        for (i, byte) in seed.iter().take(6).enumerate() {
            let mixed = byte ^ ((trade_id >> (i * 5)) as u8) ^ (i as u8).wrapping_mul(37);
            reference.push(REFERENCE_ALPHABET[(mixed & 31) as usize] as char);
        }
        reference
    }
}
