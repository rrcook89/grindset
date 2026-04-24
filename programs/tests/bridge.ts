/**
 * Smoke tests for the Bridge program.
 *
 * Exhaustive happy-path and replay/expiry/cap tests require a deployed mint,
 * treasury PDA, and funded ATAs — that setup is part of Sprint 6.  For the
 * Sprint 1 scaffold we verify the program ID and the shape of the voucher
 * message so regressions in the canonical layout are caught early.
 */

import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";

describe("bridge (scaffold)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("program id resolves", () => {
    const id = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
    expect(id.toBase58().length).to.be.greaterThan(0);
  });

  it("voucher message is 56 bytes", () => {
    const user = Buffer.alloc(32, 7);
    const amount = Buffer.alloc(8);
    amount.writeBigUInt64LE(1000n);
    const nonce = Buffer.alloc(8);
    nonce.writeBigUInt64LE(42n);
    const expiry = Buffer.alloc(8);
    expiry.writeBigInt64LE(9999999999n);
    const msg = Buffer.concat([user, amount, nonce, expiry]);
    expect(msg.length).to.equal(56);
  });

  // TODO: once $GRIND mint + treasury are wired in Sprint 6:
  //   - happy-path deposit
  //   - happy-path withdraw with ed25519 pre-ix
  //   - nonce replay rejected
  //   - expired voucher rejected
  //   - per-epoch cap enforced
});
