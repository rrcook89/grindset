import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

describe("item_bridge (scaffold)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("program id resolves", () => {
    const id = new PublicKey("HmbTLCmaGvZhKnn1Zfa1JVnre7ash7iAf2WUqHmfvxgU");
    expect(id.toBase58().length).to.be.greaterThan(0);
  });

  it("mint fee splits to 80/20", () => {
    const fee = 5_000n * 1_000_000_000n;
    const burn = (fee * 8000n) / 10000n;
    const treasury = fee - burn;
    expect(burn + treasury).to.equal(fee);
    expect(burn).to.equal((fee * 4n) / 5n);
  });

  // TODO Sprint 6+:
  //   - mint_to_nft happy path (once Metaplex Core dep lands)
  //   - stake_for_play + unstake state transitions
  //   - not-owner rejection
});
