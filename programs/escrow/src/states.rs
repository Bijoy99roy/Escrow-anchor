use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub token_mint_a: Pubkey,
    pub token_mint_b: Pubkey,
    pub token_b_ask_amount: u64,
    pub index: u64,
    pub state_bump: u8,
}
