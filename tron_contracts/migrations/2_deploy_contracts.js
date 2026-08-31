const P256SmartWallet = artifacts.require('P256SmartWallet.sol');

/**
 * Deploys all Passkey P256 SmartWallet related contracts.
 *
*/
module.exports = async function (deployer) {
  await deployer.deploy(P256SmartWallet, "0x7ab3865b085f3c780c770c36fef29480ec21cf20abe8efee62cb929547c56667", "0x3817e34939b455cfab45f2be7657ed34209a7f5c1a97c64a5363c06821a8e73a", 1);
  const passkeyWallet = await P256SmartWallet.deployed();
};
