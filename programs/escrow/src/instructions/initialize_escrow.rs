use crate::{EscrowError, EscrowState};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + EscrowState::INIT_SPACE,
        seeds =[b"escrow", index.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        init,
        payer = user,
        associated_token::mint = token_mint_a,
        associated_token::authority = escrow_state,
        associated_token::token_program = token_program
    )]
    token_a_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint_a,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub initializer_token_account_a: InterfaceAccount<'info, TokenAccount>,

    #[account(mint::token_program = token_program)]
    pub token_mint_a: InterfaceAccount<'info, Mint>,

    #[account(mint::token_program = token_program)]
    pub token_mint_b: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl<'info> InitializeEscrow<'info> {
    pub fn create_offer(
        &mut self,
        index: u64,
        token_a_mint: Pubkey,
        token_b_mint: Pubkey,
        token_a_offered_amount: u64,
        token_b_ask_amount: u64,
        escrow_state_bump: u8,
    ) -> Result<()> {
        require!(token_a_offered_amount > 0, EscrowError::InvalidAmount);
        require!(token_b_ask_amount > 0, EscrowError::InvalidAmount);

        require!(
            self.initializer_token_account_a.amount > token_a_offered_amount,
            EscrowError::InsufficientInitiatorBalance
        );

        require!(
            self.token_mint_a.key() != self.token_mint_b.key(),
            EscrowError::InvalidTokenMint
        );

        let cpi_program = self.token_program.to_account_info();

        let cpi_account = TransferChecked {
            from: self.initializer_token_account_a.to_account_info(),
            to: self.token_a_vault.to_account_info(),
            mint: self.token_mint_a.to_account_info(),
            authority: self.user.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_account);

        transfer_checked(cpi_ctx, token_a_offered_amount, self.token_mint_a.decimals)?;

        self.escrow_state.token_mint_a = token_a_mint;
        self.escrow_state.token_mint_b = token_b_mint;
        self.escrow_state.token_b_ask_amount = token_b_ask_amount;
        self.escrow_state.state_bump = escrow_state_bump;
        self.escrow_state.index = index;
        Ok(())
    }
}
