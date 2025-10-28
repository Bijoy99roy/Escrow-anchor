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

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
