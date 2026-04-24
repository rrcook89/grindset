/**
 * Full integration tests for the Bridge program.
 * Runs against a local validator spun up by `anchor test`.
 *
 * Covers:
 *   - initialize + deposit happy path
 *   - withdraw with Ed25519 pre-instruction
 *   - nonce replay (NonceTooLow)
 *   - expired voucher (VoucherExpired)
 *   - epoch cap exceeded (EpochCapExceeded)
 *   - wrong signer (InvalidSignature)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import nacl from "tweetnacl";
import { Bridge } from "../target/types/bridge";

// ── helpers ──────────────────────────────────────────────────────────────────

function u64LE(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}

function i64LE(v: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(v);
  return b;
}

/** Canonical 56-byte voucher message: user(32) || amount_le(8) || nonce_le(8) || expiry_le(8) */
function voucherMessage(
  user: PublicKey,
  amount: bigint,
  nonce: bigint,
  expiry: bigint,
): Buffer {
  const msg = Buffer.concat([
    user.toBuffer(),
    u64LE(amount),
    u64LE(nonce),
    i64LE(expiry),
  ]);
  if (msg.length !== 56) throw new Error("voucher message must be 56 bytes");
  return msg;
}

/**
 * Build an Ed25519Program instruction + a matching voucher object for the
 * Bridge.withdraw instruction.
 */
function buildWithdrawIxPair(
  user: PublicKey,
  amount: bigint,
  nonce: bigint,
  expiry: bigint,
  signerKeypair: Keypair,
): {
  ed25519Ix: anchor.web3.TransactionInstruction;
  voucher: {
    user: PublicKey;
    amount: BN;
    nonce: BN;
    expiry: BN;
    signature: number[];
  };
} {
  const msg = voucherMessage(user, amount, nonce, expiry);
  const sig = nacl.sign.detached(msg, signerKeypair.secretKey);

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: signerKeypair.publicKey.toBytes(),
    message: msg,
    signature: sig,
  });

  const voucher = {
    user,
    amount: new BN(amount.toString()),
    nonce: new BN(nonce.toString()),
    expiry: new BN(expiry.toString()),
    signature: Array.from(sig),
  };

  return { ed25519Ix, voucher };
}

async function confirmTx(
  connection: anchor.web3.Connection,
  tx: Transaction,
  signers: Keypair[],
): Promise<string> {
  return sendAndConfirmTransaction(connection, tx, signers, {
    commitment: "confirmed",
  });
}

// ── test suite ────────────────────────────────────────────────────────────────

describe("bridge (full)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.Bridge as Program<Bridge>;

  // Keypairs
  const admin = Keypair.generate();
  const gameSigner = Keypair.generate();
  const wrongSigner = Keypair.generate();
  const user = Keypair.generate();

  // SPL state
  let grindMint: PublicKey;
  let treasuryAta: PublicKey;
  let userAta: PublicKey;

  // PDAs
  let configPda: PublicKey;
  let treasuryPda: PublicKey;
  let treasuryBump: number;

  const EPOCH_CAP = 1_000_000n; // 1M tokens

  before("fund test wallets + create mint", async () => {
    // Airdrop SOL to admin and user
    await Promise.all([
      connection.confirmTransaction(
        await connection.requestAirdrop(admin.publicKey, 10e9),
        "confirmed",
      ),
      connection.confirmTransaction(
        await connection.requestAirdrop(user.publicKey, 5e9),
        "confirmed",
      ),
    ]);

    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    );
    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury")],
      program.programId,
    );

    // Create $GRIND mint (admin is mint authority)
    grindMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      6, // 6 decimals for simplicity in tests
    );

    // Treasury ATA owned by treasuryPda
    treasuryAta = await getAssociatedTokenAddress(grindMint, treasuryPda, true);
    const createTreasuryAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      treasuryAta,
      treasuryPda,
      grindMint,
    );
    const treasuryAtaTx = new Transaction().add(createTreasuryAtaIx);
    await confirmTx(connection, treasuryAtaTx, [admin]);

    // Fund treasury with 10M tokens
    await mintTo(connection, admin, grindMint, treasuryAta, admin, 10_000_000);

    // User ATA
    userAta = await getAssociatedTokenAddress(grindMint, user.publicKey, false);
    const createUserAtaIx = createAssociatedTokenAccountInstruction(
      user.publicKey,
      userAta,
      user.publicKey,
      grindMint,
    );
    const userAtaTx = new Transaction().add(createUserAtaIx);
    await confirmTx(connection, userAtaTx, [user]);

    // Fund user with 500k tokens for deposit tests
    await mintTo(connection, admin, grindMint, userAta, admin, 500_000);
  });

  it("initializes bridge config", async () => {
    await program.methods
      .initialize({
        gameSigner: gameSigner.publicKey,
        maxWithdrawPerEpoch: new BN(EPOCH_CAP.toString()),
        treasuryBump,
      })
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        grindMint,
        treasuryAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc({ commitment: "confirmed" });

    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.gameSigner.toBase58()).to.equal(
      gameSigner.publicKey.toBase58(),
    );
    expect(cfg.maxWithdrawPerEpoch.toString()).to.equal(EPOCH_CAP.toString());
    expect(cfg.epochWithdrawUsed.toString()).to.equal("0");
  });

  it("deposit moves tokens from user to treasury and emits DepositEvent", async () => {
    const depositAmt = 100_000n;

    const userBefore = await getAccount(connection, userAta);
    const treasuryBefore = await getAccount(connection, treasuryAta);

    const listener = program.addEventListener(
      "DepositEvent",
      (event: { user: PublicKey; amount: BN; slot: BN }) => {
        expect(event.user.toBase58()).to.equal(user.publicKey.toBase58());
        expect(event.amount.toString()).to.equal(depositAmt.toString());
        program.removeEventListener(listener);
      },
    );

    await program.methods
      .deposit(new BN(depositAmt.toString()))
      .accounts({
        user: user.publicKey,
        config: configPda,
        userAta,
        treasuryAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc({ commitment: "confirmed" });

    const userAfter = await getAccount(connection, userAta);
    const treasuryAfter = await getAccount(connection, treasuryAta);

    expect(
      BigInt(userAfter.amount) - BigInt(userBefore.amount),
    ).to.equal(-depositAmt);
    expect(
      BigInt(treasuryAfter.amount) - BigInt(treasuryBefore.amount),
    ).to.equal(depositAmt);
  });

  it("withdraw with valid voucher transfers treasury → user, bumps nonce, updates epoch_withdraw_used", async () => {
    const withdrawAmt = 50_000n;
    const nonce = 1n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1h from now

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBytes()],
      program.programId,
    );

    const { ed25519Ix, voucher } = buildWithdrawIxPair(
      user.publicKey,
      withdrawAmt,
      nonce,
      expiry,
      gameSigner,
    );

    const treasuryBefore = await getAccount(connection, treasuryAta);
    const userBefore = await getAccount(connection, userAta);

    const tx = await program.methods
      .withdraw(voucher)
      .accounts({
        user: user.publicKey,
        config: configPda,
        playerVault: vaultPda,
        treasuryAta,
        userAta,
        treasuryPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([ed25519Ix])
      .signers([user])
      .rpc({ commitment: "confirmed" });

    const treasuryAfter = await getAccount(connection, treasuryAta);
    const userAfter = await getAccount(connection, userAta);

    expect(
      BigInt(treasuryBefore.amount) - BigInt(treasuryAfter.amount),
    ).to.equal(withdrawAmt);
    expect(
      BigInt(userAfter.amount) - BigInt(userBefore.amount),
    ).to.equal(withdrawAmt);

    const vault = await program.account.playerVault.fetch(vaultPda);
    expect(vault.nonce.toString()).to.equal(nonce.toString());

    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.epochWithdrawUsed.toString()).to.equal(withdrawAmt.toString());
  });

  it("replay same nonce → NonceTooLow", async () => {
    const nonce = 1n; // same as above
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBytes()],
      program.programId,
    );

    const { ed25519Ix, voucher } = buildWithdrawIxPair(
      user.publicKey,
      1_000n,
      nonce,
      expiry,
      gameSigner,
    );

    try {
      await program.methods
        .withdraw(voucher)
        .accounts({
          user: user.publicKey,
          config: configPda,
          playerVault: vaultPda,
          treasuryAta,
          userAta,
          treasuryPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix])
        .signers([user])
        .rpc({ commitment: "confirmed" });
      expect.fail("expected NonceTooLow");
    } catch (e: unknown) {
      expect((e as Error).message).to.include("NonceTooLow");
    }
  });

  it("expired voucher → VoucherExpired", async () => {
    const nonce = 2n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) - 3600); // 1h ago

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBytes()],
      program.programId,
    );

    const { ed25519Ix, voucher } = buildWithdrawIxPair(
      user.publicKey,
      1_000n,
      nonce,
      expiry,
      gameSigner,
    );

    try {
      await program.methods
        .withdraw(voucher)
        .accounts({
          user: user.publicKey,
          config: configPda,
          playerVault: vaultPda,
          treasuryAta,
          userAta,
          treasuryPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix])
        .signers([user])
        .rpc({ commitment: "confirmed" });
      expect.fail("expected VoucherExpired");
    } catch (e: unknown) {
      expect((e as Error).message).to.include("VoucherExpired");
    }
  });

  it("voucher exceeding max_withdraw_per_epoch → EpochCapExceeded", async () => {
    // EPOCH_CAP is 1_000_000; we already used 50_000 in the happy-path test.
    // Request the remaining cap + 1 to exceed it.
    const alreadyUsed = 50_000n;
    const overCap = EPOCH_CAP - alreadyUsed + 1n;
    const nonce = 3n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBytes()],
      program.programId,
    );

    const { ed25519Ix, voucher } = buildWithdrawIxPair(
      user.publicKey,
      overCap,
      nonce,
      expiry,
      gameSigner,
    );

    try {
      await program.methods
        .withdraw(voucher)
        .accounts({
          user: user.publicKey,
          config: configPda,
          playerVault: vaultPda,
          treasuryAta,
          userAta,
          treasuryPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix])
        .signers([user])
        .rpc({ commitment: "confirmed" });
      expect.fail("expected EpochCapExceeded");
    } catch (e: unknown) {
      expect((e as Error).message).to.include("EpochCapExceeded");
    }
  });

  it("wrong signer → InvalidSignature", async () => {
    const nonce = 4n;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), user.publicKey.toBytes()],
      program.programId,
    );

    // Sign with wrongSigner instead of gameSigner.
    // The Ed25519 instruction will verify with wrongSigner's key,
    // but Config.game_signer is gameSigner → on-chain check rejects it.
    const msg = voucherMessage(user.publicKey, 1_000n, nonce, expiry);
    const sig = nacl.sign.detached(msg, wrongSigner.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: wrongSigner.publicKey.toBytes(),
      message: msg,
      signature: sig,
    });

    const voucher = {
      user: user.publicKey,
      amount: new BN("1000"),
      nonce: new BN(nonce.toString()),
      expiry: new BN(expiry.toString()),
      signature: Array.from(sig),
    };

    try {
      await program.methods
        .withdraw(voucher)
        .accounts({
          user: user.publicKey,
          config: configPda,
          playerVault: vaultPda,
          treasuryAta,
          userAta,
          treasuryPda,
          instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([ed25519Ix])
        .signers([user])
        .rpc({ commitment: "confirmed" });
      expect.fail("expected InvalidSignature");
    } catch (e: unknown) {
      expect((e as Error).message).to.include("InvalidSignature");
    }
  });
});
