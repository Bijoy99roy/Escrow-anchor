use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Invalid token amount")]
    InvalidAmount,

    #[msg("Insufficient token balance in initiator's account")]
    InsufficientInitiatorBalance,

    #[msg("Insufficient token balance in taker's account")]
    InsufficientTakerBalance,

    #[msg("Offered token mint must not be the same as asked token mint")]
    InvalidTokenMint,
}
