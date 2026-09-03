const P256SmartWallet = artifacts.require('P256SmartWallet.sol');

/**
 * Deploys all Passkey P256 SmartWallet related contracts.
 *
*/
module.exports = async function (deployer) {
  await deployer.deploy(P256SmartWallet, "0x1882792735d6ae4ab0ff044f47b348ec44f9b38920970766ec95106bbb2b8c68", "0x54cd8870d0f1e55871cf300ff61d98f7f77835ccb13ebe8232b6e407c6706272", 1);
  const passkeyWallet = await P256SmartWallet.deployed();
};
