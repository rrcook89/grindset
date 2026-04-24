// Anchor migration entrypoint. Runs after `anchor deploy`.
// Customise to initialise Config/Season accounts on devnet/mainnet.

import * as anchor from "@coral-xyz/anchor";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);
  // eslint-disable-next-line no-console
  console.log("anchor deploy completed for provider:", provider.connection.rpcEndpoint);
  // TODO: call bridge.initialize() and season_rewards.initialize_season() here
  //       once $GRIND mint + treasury PDA are provisioned.
};
