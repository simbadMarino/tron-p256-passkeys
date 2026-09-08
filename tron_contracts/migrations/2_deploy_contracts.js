const P256SmartWallet = artifacts.require('P256SmartWallet.sol');

/**
 * Deploys all Passkey P256 SmartWallet related contracts.
 *
*/
module.exports = async function (deployer) {
  await deployer.deploy(P256SmartWallet, "0x22379a3887af4cc4d5a01fc98da659da812de00bde280dd77271d28dca074e86", "0x67e235b7ebf74082e8cad9507a6b4caeee00816fc3e0c1f014ab459a4c0ee433", 1);
  const passkeyWallet = await P256SmartWallet.deployed();
};
