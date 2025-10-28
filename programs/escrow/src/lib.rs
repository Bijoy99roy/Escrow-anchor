use anchor_lang::prelude::*;
pub mod errors;
pub mod instructions;
pub mod states;
pub use errors::*;
pub use instructions::*;
pub use states::*;
declare_id!("F4UtSPjeDfKf5qyRWv6CqAUf5Ua4VY6euot4tTiQ8cYo");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<InitializeEscrow>,
        index: u64,
        token_a_offered_amount: u64,
        token_b_ask_amount: u64,
    ) -> Result<()> {
        let escrow_state_bump = &ctx.bumps.escrow_state;

        ctx.accounts.create_offer(
            index,
            token_a_offered_amount,
            token_b_ask_amount,
            *escrow_state_bump,
        )?;
        Ok(())
    }

    pub fn refund(ctx: Context<RefundOffer>) -> Result<()> {
        ctx.accounts.refund()?;
        Ok(())
    }

    pub fn complete_escrow(ctx: Context<CompleteEscrow>) -> Result<()> {
        ctx.accounts.execute_offer()?;
        Ok(())
    }
}
