use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};

use crate::EscrowState;

#[derive(Accounts)]
pub struct RefundOffer<'info> {
    #[account(mut)]
    user: Signer<'info>,

    #[account(
        mut,
        seeds =[b"escrow", escrow_state.index.to_le_bytes().as_ref()],
        bump=escrow_state.state_bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
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

    pub token_program: Interface<'info, TokenInterface>,

    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

impl<'info> RefundOffer<'info> {
    pub fn refund(&self) -> Result<()> {
        let index_bytes = self.escrow_state.index.to_le_bytes();
        let seeds = &[
            b"escrow",
            index_bytes.as_ref(),
            &[self.escrow_state.state_bump],
        ];

        let signer_seeds = &[&seeds[..]];

        let cpi_program = self.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: self.token_a_vault.to_account_info(),
            to: self.initializer_token_account_a.to_account_info(),
            mint: self.token_mint_a.to_account_info(),
            authority: self.escrow_state.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        transfer_checked(
            cpi_ctx,
            self.token_a_vault.amount,
            self.token_mint_a.decimals,
        )?;

        // Close vault ATA
        let close_accounts = CloseAccount {
            account: self.token_a_vault.to_account_info(),
            destination: self.user.to_account_info(),
            authority: self.escrow_state.to_account_info(),
        };
        let close_cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            close_accounts,
            signer_seeds,
        );
        close_account(close_cpi_ctx)?;

        // Close escrow pda
        self.escrow_state.close(self.user.to_account_info())?;
        Ok(())
    }
}
