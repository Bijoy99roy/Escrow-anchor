import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { createMint, createAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("escrow", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.escrow as Program<Escrow>;
  const provider = anchor.getProvider();

  const maker = anchor.web3.Keypair.generate()
  const taker = anchor.web3.Keypair.generate()

  const escrowParams = {};

  async function getPda(seeds) {
    const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      seeds,
      program.programId
    );

    return {pda, bump}
  }

  async function mintToken(user: anchor.web3.Keypair, mintZero: boolean){
    const mint = await createMint(
    provider.connection,
    user,
    user.publicKey, 
    null,           
    6               
  );

  const userAta = await createAssociatedTokenAccount(
    provider.connection,
    user,
    mint,
    user.publicKey
  );

  if (!mintZero){
    await mintTo( 
        provider.connection,
        user,
        mint,
        userAta,
        user,
        1_000_000_000
      );

  }
  
  return { mint, userAta };
  }

  async function collectEscrowParams(index: anchor.BN, mintZeroAccountList=[]) {

    if (!(index.toNumber() in escrowParams)){
      const mintZeroMaker = mintZeroAccountList.includes("maker");
      const mintZeroTaker = mintZeroAccountList.includes("taker");

      const tokenMint_a = await mintToken(maker, mintZeroMaker)
      const tokenMint_b = await mintToken(taker, mintZeroTaker)

      const mint_a = tokenMint_a.mint
      const makerAta_token_a = tokenMint_a.userAta

      const {pda: vault_state_pda} = await getPda([Buffer.from("escrow"), index.toArrayLike(Buffer, "le", 8)])

      const vaultAta_token_a = getAssociatedTokenAddressSync(mint_a, vault_state_pda, true, TOKEN_PROGRAM_ID);

      const takerAta_token_a = getAssociatedTokenAddressSync(mint_a, taker.publicKey, false, TOKEN_PROGRAM_ID);

      const mint_b = tokenMint_b.mint
      const takerAta_token_b = tokenMint_b.userAta

      const makerAta_token_b = getAssociatedTokenAddressSync(mint_b, maker.publicKey, false, TOKEN_PROGRAM_ID);


      escrowParams[index.toNumber()] = {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      }
    }
      return escrowParams[index.toNumber()]
  }

  async function getAirdrop(
    publicKey: anchor.web3.PublicKey,
    amount: number = 100 * anchor.web3.LAMPORTS_PER_SOL
  ){
    const airdropTxn = await provider.connection.requestAirdrop(
      publicKey,
      amount
    );

    await provider.connection.confirmTransaction(airdropTxn);
  }

   before(async ()=>{
    await getAirdrop(maker.publicKey);
    await getAirdrop(taker.publicKey);
    
  })

  it("Initiate Escrow Offer", async () => {
    const index = new anchor.BN(1)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)

    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(5_000_000);
    await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();
    
    const accountState = await program.account.escrowState.fetch(vault_state_pda);

    assert.equal(accountState.tokenMintA.toString(), mint_a.toString());
    assert.equal(accountState.tokenMintB.toString(), mint_b.toString());
    assert.equal(accountState.tokenBAskAmount.toString(), token_b_ask_amount.toString());


    const vaultAccount = await getAccount(provider.connection, vaultAta_token_a);

    assert.equal(vaultAccount.amount.toString(), token_a_offered_amount.toString());
  });

  it("Initiate Escrow Offer, Fail for invalid offered amount", async () => {
    const index = new anchor.BN(2)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)

    const token_a_offered_amount = new anchor.BN(0);
    const token_b_ask_amount = new anchor.BN(5_000_000);
    try{
      await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();
    }catch(err){
      const anchorError = err as anchor.AnchorError;

      assert.equal(anchorError.error.errorCode.code, "InvalidAmount")
      assert.equal(anchorError.error.errorMessage, "Invalid token amount")
    }
    
  });

  it("Initiate Escrow Offer, Fail for invalid asked amount", async () => {
    const index = new anchor.BN(3)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)

    const token_a_offered_amount = new anchor.BN(5_000_000);
    const token_b_ask_amount = new anchor.BN(0);
    try{
      await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();
    }catch(err){
      const anchorError = err as anchor.AnchorError;

      assert.equal(anchorError.error.errorCode.code, "InvalidAmount")
      assert.equal(anchorError.error.errorMessage, "Invalid token amount")
    }
    
  });

  it("Initiate Escrow Offer, Fail for insufficient initiator's balance", async () => {
    const index = new anchor.BN(4)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index, ["maker"])

    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(5_000_000);
    try{
      await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();
    }catch(err){
      const anchorError = err as anchor.AnchorError;

      assert.equal(anchorError.error.errorCode.code, "InsufficientInitiatorBalance")
      assert.equal(anchorError.error.errorMessage, "Insufficient token balance in initiator's account")
    }
    
  });

  it("Initiate Escrow Offer, Fail for invalid token mint", async () => {
    const index = new anchor.BN(5)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)

    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(5_000_000);
    try{
      await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_a,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();
    }catch(err){
      const anchorError = err as anchor.AnchorError;

      assert.equal(anchorError.error.errorCode.code, "InvalidTokenMint")
      assert.equal(anchorError.error.errorMessage, "Offered token mint must not be the same as asked token mint")
    }
    
  });

  it("Refund Offer", async () => {
    const index = new anchor.BN(6)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)
    
    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(5_000_000);
    await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
    .accounts({
      user: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountA: makerAta_token_a,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([maker])
    .rpc();

    await program.methods.refund()
      .accounts({
        user: maker.publicKey,
        escrowState: vault_state_pda,
        tokenAVault: vaultAta_token_a,
        initializerTokenAccountA: makerAta_token_a,
        tokenMintA: mint_a,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
      })
      .signers([maker])
      .rpc();
    const accountStateAccountInfo = await provider.connection.getAccountInfo(vault_state_pda);
    assert.equal(accountStateAccountInfo, null);

    const vaultAccountInfo = await provider.connection.getAccountInfo(vaultAta_token_a);
    assert.equal(vaultAccountInfo, null);
 
  });

  it("Take offer, Fail for insufficient taker's balance", async () => {
    const index = new anchor.BN(7)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index, ["taker"])

    try{
      const token_a_offered_amount = new anchor.BN(10_000_000);
      const token_b_ask_amount = new anchor.BN(5_000_000);
      await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
      .accounts({
        user: maker.publicKey,
        escrowState: vault_state_pda,
        tokenAVault: vaultAta_token_a,
        initializerTokenAccountA: makerAta_token_a,
        tokenMintA: mint_a,
        tokenMintB: mint_b,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
      })
      .signers([maker])
      .rpc();

      await program.methods.completeEscrow()
    .accounts({
      taker: taker.publicKey,
      maker: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountB: makerAta_token_b,
      takerTokenAccountA: takerAta_token_a,
      takerTokenAccountB: takerAta_token_b,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([taker])
    .rpc();
    }catch(err){
      const anchorError = err as anchor.AnchorError;
      // console.log(anchorError)
      assert.equal(anchorError.error.errorCode.code, "InsufficientTakerBalance")
      assert.equal(anchorError.error.errorMessage, "Insufficient token balance in taker's account")
    }
    
  });

  it("Take offer", async () => {
    const index = new anchor.BN(1)

    const {
        mint_a,
        mint_b,
        vault_state_pda,
        makerAta_token_a,
        vaultAta_token_a,
        takerAta_token_a,
        takerAta_token_b,
        makerAta_token_b
      } = await collectEscrowParams(index)

    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(5_000_000);
      
    await program.methods.completeEscrow()
    .accounts({
      taker: taker.publicKey,
      maker: maker.publicKey,
      escrowState: vault_state_pda,
      tokenAVault: vaultAta_token_a,
      initializerTokenAccountB: makerAta_token_b,
      takerTokenAccountA: takerAta_token_a,
      takerTokenAccountB: takerAta_token_b,
      tokenMintA: mint_a,
      tokenMintB: mint_b,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    })
    .signers([taker])
    .rpc();
    
    const accountStateAccountInfo = await provider.connection.getAccountInfo(vault_state_pda);
    assert.equal(accountStateAccountInfo, null);

    const vaultAccountInfo = await provider.connection.getAccountInfo(vaultAta_token_a);
    assert.equal(vaultAccountInfo, null);

    const makerTokenBAccount = await getAccount(provider.connection, makerAta_token_b);
    assert.equal(makerTokenBAccount.amount.toString(), token_b_ask_amount.toString());

    const takerTokenAAccount = await getAccount(provider.connection, takerAta_token_a);
    assert.equal(takerTokenAAccount.amount.toString(), token_a_offered_amount.toString());
  });
});
