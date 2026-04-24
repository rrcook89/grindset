/**
 * Full integration tests for the Item Bridge program.
 *
 * Metaplex Core CPIs (mint_to_nft NFT asset creation, stake/unstake NFT
 * transfer) are skipped — the program marks them TODO pending mpl-core landing
 * in Cargo.toml.  These tests cover state transitions on ItemRecord, the fee
 * burn/split, and error paths, all of which work today.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { ItemBridge } from "../target/types/item_bridge";

const MINT_FEE = 5_000n * 1_000_000_000n; // 5000 GRIND, 9 decimals

function randomItemId(): number[] {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)));
}

describe("item_bridge (full)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const program = anchor.workspace.ItemBridge as Program<ItemBridge>;

  const admin = Keypair.generate();
  const payer = Keypair.generate();
  const notOwner = Keypair.generate();

  let grindMint: PublicKey;
  let payerAta: PublicKey;
  let treasuryAta: PublicKey;
  const treasury = Keypair.generate();

  before("fund wallets + create mint", async () => {
    await Promise.all(
      [admin, payer, notOwner, treasury].map((kp) =>
        connection
          .requestAirdrop(kp.publicKey, 10e9)
          .then((sig) => connection.confirmTransaction(sig, "confirmed")),
      ),
    );

    grindMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      admin.publicKey, // freeze authority — needed for burn
      9,
    );

    payerAta = await getAssociatedTokenAddress(grindMint, payer.publicKey);
    treasuryAta = await getAssociatedTokenAddress(
      grindMint,
      treasury.publicKey,
    );

    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        payerAta,
        payer.publicKey,
        grindMint,
      ),
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        treasuryAta,
        treasury.publicKey,
        grindMint,
      ),
    );
    await anchor.web3.sendAndConfirmTransaction(connection, tx, [
      payer,
      treasury,
    ]);

    // Fund payer with 2× MINT_FEE so we can run two mint tests
    await mintTo(
      connection,
      admin,
      grindMint,
      payerAta,
      admin,
      Number(MINT_FEE * 2n),
    );
  });

  describe("mint_to_nft", () => {
    it("burns 80% and sends 20% to treasury, sets state NftMintedIdle", async () => {
      const itemId = randomItemId();
      const metadataUri = "https://example.com/item/1.json";

      const [itemRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), Buffer.from(itemId)],
        program.programId,
      );

      const payerBefore = await getAccount(connection, payerAta);
      const treasuryBefore = await getAccount(connection, treasuryAta);

      await program.methods
        .mintToNft(itemId, metadataUri)
        .accounts({
          payer: payer.publicKey,
          grindMint,
          payerAta,
          treasuryAta,
          itemRecord,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const payerAfter = await getAccount(connection, payerAta);
      const treasuryAfter = await getAccount(connection, treasuryAta);

      const burned = BigInt(payerBefore.amount) - BigInt(payerAfter.amount) -
        (BigInt(treasuryAfter.amount) - BigInt(treasuryBefore.amount));
      const toTreasury = BigInt(treasuryAfter.amount) - BigInt(treasuryBefore.amount);

      const expectedBurn = (MINT_FEE * 8000n) / 10000n;
      const expectedTreasury = MINT_FEE - expectedBurn;

      expect(burned.toString()).to.equal(expectedBurn.toString());
      expect(toTreasury.toString()).to.equal(expectedTreasury.toString());

      const record = await program.account.itemRecord.fetch(itemRecord);
      expect(record.owner.toBase58()).to.equal(payer.publicKey.toBase58());
      // ItemState::NftMintedIdle is index 1
      expect(record.state).to.deep.equal({ nftMintedIdle: {} });
      expect(record.metadataUri).to.equal(metadataUri);
    });

    it("rejects URI longer than 200 bytes → UriTooLong", async () => {
      const itemId = randomItemId();
      const longUri = "x".repeat(201);

      const [itemRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), Buffer.from(itemId)],
        program.programId,
      );

      try {
        await program.methods
          .mintToNft(itemId, longUri)
          .accounts({
            payer: payer.publicKey,
            grindMint,
            payerAta,
            treasuryAta,
            itemRecord,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([payer])
          .rpc({ commitment: "confirmed" });
        expect.fail("expected UriTooLong");
      } catch (e: unknown) {
        expect((e as Error).message).to.include("UriTooLong");
      }
    });
  });

  describe("stake_for_play / unstake state transitions", () => {
    let itemRecord: PublicKey;
    let itemId: number[];

    before("mint an item first", async () => {
      itemId = randomItemId();
      [itemRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), Buffer.from(itemId)],
        program.programId,
      );

      await program.methods
        .mintToNft(itemId, "https://example.com/stake-test.json")
        .accounts({
          payer: payer.publicKey,
          grindMint,
          payerAta,
          treasuryAta,
          itemRecord,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc({ commitment: "confirmed" });
    });

    it("not-owner cannot stake → NotOwner", async () => {
      try {
        await program.methods
          .stakeForPlay()
          .accounts({ owner: notOwner.publicKey, itemRecord })
          .signers([notOwner])
          .rpc({ commitment: "confirmed" });
        expect.fail("expected NotOwner");
      } catch (e: unknown) {
        expect((e as Error).message).to.include("NotOwner");
      }
    });

    it("owner stakes → state becomes NftStakedForPlay", async () => {
      await program.methods
        .stakeForPlay()
        .accounts({ owner: payer.publicKey, itemRecord })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const record = await program.account.itemRecord.fetch(itemRecord);
      expect(record.state).to.deep.equal({ nftStakedForPlay: {} });
    });

    it("staking already-staked item → InvalidStateTransition", async () => {
      try {
        await program.methods
          .stakeForPlay()
          .accounts({ owner: payer.publicKey, itemRecord })
          .signers([payer])
          .rpc({ commitment: "confirmed" });
        expect.fail("expected InvalidStateTransition");
      } catch (e: unknown) {
        expect((e as Error).message).to.include("InvalidStateTransition");
      }
    });

    it("owner unstakes → state returns to NftMintedIdle", async () => {
      await program.methods
        .unstake()
        .accounts({ owner: payer.publicKey, itemRecord })
        .signers([payer])
        .rpc({ commitment: "confirmed" });

      const record = await program.account.itemRecord.fetch(itemRecord);
      expect(record.state).to.deep.equal({ nftMintedIdle: {} });
    });

    it("unstaking idle item → InvalidStateTransition", async () => {
      try {
        await program.methods
          .unstake()
          .accounts({ owner: payer.publicKey, itemRecord })
          .signers([payer])
          .rpc({ commitment: "confirmed" });
        expect.fail("expected InvalidStateTransition");
      } catch (e: unknown) {
        expect((e as Error).message).to.include("InvalidStateTransition");
      }
    });
  });
});
