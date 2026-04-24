import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import * as crypto from "crypto";

/**
 * Merkle tree helpers that mirror the on-chain verification:
 *   leaf   = sha256(index_le32 || amount_le64 || recipient)
 *   parent = sha256(min(a,b) || max(a,b))   (sorted-pair)
 */

function sha256(...parts: Buffer[]): Buffer {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}

function leafHash(index: number, amount: bigint, recipient: PublicKey): Buffer {
  const idxBuf = Buffer.alloc(4);
  idxBuf.writeUInt32LE(index);
  const amtBuf = Buffer.alloc(8);
  amtBuf.writeBigUInt64LE(amount);
  return sha256(idxBuf, amtBuf, recipient.toBuffer());
}

function pair(a: Buffer, b: Buffer): Buffer {
  return Buffer.compare(a, b) <= 0 ? sha256(a, b) : sha256(b, a);
}

function buildTree(leaves: Buffer[]): { root: Buffer; proofs: Buffer[][] } {
  if (leaves.length === 0) throw new Error("empty tree");
  const levels: Buffer[][] = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      if (i + 1 < cur.length) next.push(pair(cur[i], cur[i + 1]));
      else next.push(cur[i]);
    }
    levels.push(next);
  }
  const proofs = leaves.map((_, idx) => {
    const proof: Buffer[] = [];
    let i = idx;
    for (let lvl = 0; lvl < levels.length - 1; lvl++) {
      const cur = levels[lvl];
      const sib = i ^ 1;
      if (sib < cur.length) proof.push(cur[sib]);
      i = Math.floor(i / 2);
    }
    return proof;
  });
  return { root: levels[levels.length - 1][0], proofs };
}

function reconstructRoot(leaf: Buffer, proof: Buffer[]): Buffer {
  let cur = leaf;
  for (const sib of proof) cur = pair(cur, sib);
  return cur;
}

describe("season_rewards (scaffold)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  it("program id resolves", () => {
    const id = new PublicKey("7Vbmv1jt4vyuqBZcpYPpnVhrqVe5e6ZzKBzQxJNNNsaH");
    expect(id.toBase58().length).to.be.greaterThan(0);
  });

  it("leaf hash is deterministic", () => {
    const r = new PublicKey("11111111111111111111111111111111");
    const a = leafHash(0, 1000n, r);
    const b = leafHash(0, 1000n, r);
    expect(a.equals(b)).to.be.true;
    expect(a.length).to.equal(32);
  });

  it("merkle proof round-trips for every leaf", () => {
    const entries = [
      { idx: 0, amount: 100n, recipient: anchor.web3.Keypair.generate().publicKey },
      { idx: 1, amount: 200n, recipient: anchor.web3.Keypair.generate().publicKey },
      { idx: 2, amount: 300n, recipient: anchor.web3.Keypair.generate().publicKey },
      { idx: 3, amount: 400n, recipient: anchor.web3.Keypair.generate().publicKey },
      { idx: 4, amount: 500n, recipient: anchor.web3.Keypair.generate().publicKey },
    ];
    const leaves = entries.map((e) => leafHash(e.idx, e.amount, e.recipient));
    const { root, proofs } = buildTree(leaves);

    for (let i = 0; i < entries.length; i++) {
      const computed = reconstructRoot(leaves[i], proofs[i]);
      expect(computed.equals(root)).to.equal(true, `proof ${i}`);
    }
  });

  // TODO Sprint 12:
  //   - initialize_season + claim happy path (requires funded token program)
  //   - double-claim rejected
  //   - wrong-proof rejected
  //   - sweep_unclaimed respects 90-day window
});
