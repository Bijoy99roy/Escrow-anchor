import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import idl from "../target/idl/escrow.json"
import { createMint, createAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress, NATIVE_MINT, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "fs"

function loadKeypairFromFile(secretFilePath: string){
    const secret = JSON.parse(fs.readFileSync(secretFilePath, "utf-8"));
    const secretKey = Uint8Array.from(secret)
    return anchor.web3.Keypair.fromSecretKey(secretKey)
}
const user = loadKeypairFromFile("./vauBpkWG12Q1EhvY2D52zngz89Dw7jXnvramR61DSN8.json");

const taker = loadKeypairFromFile("./escTKuLsLjMwsCTByNXp1jkFWtrdPBAoeub8iDD6wRt.json");


const commitmentLevel = "confirmed";
const endpoint = clusterApiUrl("devnet");
const connection = new Connection(endpoint, commitmentLevel);
const vaultProgramInterface = JSON.parse(JSON.stringify(idl));

const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(user), { preflightCommitment: commitmentLevel })

const program = new Program(vaultProgramInterface, provider) as Program<Escrow>


const mint = new anchor.web3.PublicKey("BzezyWUhhQK2K84uypVnXHSojxcDMt2ZyymfwcWj1TVR")
const tokenAuthority = loadKeypairFromFile("./SPLgr2inWZN3gKPAHv3a6q3E1xA3zpbmEmJyznefkqQ.json")

async function getPda(seeds) {
    const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      seeds,
      program.programId
    );

    return {pda, bump}
  }
async function mintToken(user: anchor.web3.Keypair){
  const userAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    user,
    mint,
    user.publicKey
  );


  await mintTo( 
    provider.connection,
    user,
    mint,
    userAta.address,
    tokenAuthority,
    10_000_000
  );
  console.log("Token minted successfully")
  return userAta ;
  }

async function getAirdrop(
    publicKey: anchor.web3.PublicKey,
    amount: number = 5 * anchor.web3.LAMPORTS_PER_SOL
){
    const airdropTxn = await provider.connection.requestAirdrop(
    publicKey,
    amount
    );

    await provider.connection.confirmTransaction(airdropTxn);
    console.log("Airdop successfull")
}


async function wrapSol(connection: Connection, wallet: anchor.web3.Keypair, solAmount=1) {
    const associatedTokenAccount = await getAssociatedTokenAddress(
        NATIVE_MINT,
        wallet.publicKey
    );

    const wrapTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            associatedTokenAccount,
            wallet.publicKey,
            NATIVE_MINT
        ),
        SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: associatedTokenAccount,
            lamports: LAMPORTS_PER_SOL * solAmount,
        }),
        createSyncNativeInstruction(associatedTokenAccount)
    );
    await sendAndConfirmTransaction(connection, wrapTransaction, [wallet]);

    console.log("SOL wrapped");
    return associatedTokenAccount;
}

async function main(){
    await getAirdrop(user.publicKey)
    await getAirdrop(taker.publicKey)
    console.log("Here")
    const makerAtaTokenA = await mintToken(user)
    console.log("Here1")
    const takerAtaTokenB = await wrapSol(connection, taker, 2)

    console.log("Here2")
    const index = new anchor.BN(2)

    const mintA = mint;
    const mintB = new anchor.web3.PublicKey("So11111111111111111111111111111111111111112")

    const {pda: escrowStatePda} = await getPda([Buffer.from("escrow"), index.toArrayLike(Buffer, "le", 8)])
    console.log("Here3")
    const makerAtaTokenB =  await getAssociatedTokenAddress(
        NATIVE_MINT,
        user.publicKey
    );
    console.log("Here4")
    const takerAtaTokenA = getAssociatedTokenAddressSync(mintA, taker.publicKey, false, TOKEN_PROGRAM_ID);
    console.log("Here5")
    const vaultAtaTokenA = getAssociatedTokenAddressSync(mintA, escrowStatePda, true, TOKEN_PROGRAM_ID);
    console.log("Here6")
    console.log("Initialize escrow")
    
    const token_a_offered_amount = new anchor.BN(10_000_000);
    const token_b_ask_amount = new anchor.BN(2*LAMPORTS_PER_SOL);
    const initTxnSig =  await program.methods.initialize(index, token_a_offered_amount, token_b_ask_amount)
        .accounts({
            user: user.publicKey,
            escrowState: escrowStatePda,
            tokenAVault: vaultAtaTokenA,
            initializerTokenAccountA: makerAtaTokenA.address,
            tokenMintA: mintA,
            tokenMintB: mintB,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    
        } as any)
        .signers([user])
        .rpc()

    console.log(`Initialize escrow: ${initTxnSig}`)

    const completeTxnSig = await program.methods.completeEscrow()
        .accounts({
            taker: taker.publicKey,
            maker: user.publicKey,
            escrowState: escrowStatePda,
            tokenAVault: vaultAtaTokenA,
            initializerTokenAccountB: makerAtaTokenB,
            takerTokenAccountA: takerAtaTokenA,
            takerTokenAccountB: takerAtaTokenB,
            tokenMintA: mintA,
            tokenMintB: mintB,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram:  anchor.utils.token.ASSOCIATED_PROGRAM_ID
    
        }as any)
        .signers([taker])
        .rpc()

    console.log(`Comeplete escrow: ${completeTxnSig}`)
}

main()