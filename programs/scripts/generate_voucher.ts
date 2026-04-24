/**
 * Dev helper: generate a withdraw voucher signed by a game-signer keypair.
 *
 * Usage:
 *   ts-node scripts/generate_voucher.ts \
 *     --user <user_pubkey> \
 *     --amount <lamports> \
 *     --nonce <n> \
 *     --expiry <unix_ts> \
 *     --signer-keypair <path_to_json>
 *
 * Outputs JSON to stdout with the voucher payload and its ed25519 signature,
 * suitable for passing into the Bridge.withdraw() instruction alongside a
 * pre-built Ed25519Program instruction.
 */

import * as fs from "fs";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

interface Args {
  user: string;
  amount: string;
  nonce: string;
  expiry: string;
  signerKeypair: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--user":            out.user = v; i++; break;
      case "--amount":          out.amount = v; i++; break;
      case "--nonce":           out.nonce = v; i++; break;
      case "--expiry":          out.expiry = v; i++; break;
      case "--signer-keypair":  out.signerKeypair = v; i++; break;
    }
  }
  for (const k of ["user","amount","nonce","expiry","signerKeypair"] as (keyof Args)[]) {
    if (!out[k]) throw new Error(`missing --${k.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
  }
  return out as Args;
}

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const user = new PublicKey(args.user);
  const amount = BigInt(args.amount);
  const nonce = BigInt(args.nonce);
  const expiry = BigInt(args.expiry);

  const secretBytes = Uint8Array.from(
    JSON.parse(fs.readFileSync(args.signerKeypair, "utf8")) as number[],
  );
  const signer = Keypair.fromSecretKey(secretBytes);

  // Canonical 56-byte message: user(32) || amount_le(8) || nonce_le(8) || expiry_le(8)
  const msg = Buffer.concat([
    user.toBuffer(),
    u64LE(amount),
    u64LE(nonce),
    i64LE(expiry),
  ]);
  if (msg.length !== 56) throw new Error("message must be 56 bytes");

  const sig = nacl.sign.detached(msg, signer.secretKey);

  const out = {
    user: user.toBase58(),
    amount: amount.toString(),
    nonce: nonce.toString(),
    expiry: expiry.toString(),
    signer: signer.publicKey.toBase58(),
    message_hex: msg.toString("hex"),
    signature_hex: Buffer.from(sig).toString("hex"),
    signature_base64: Buffer.from(sig).toString("base64"),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main();
