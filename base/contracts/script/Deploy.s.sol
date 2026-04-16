// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/EAX.sol";
import "../src/MockERC20.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        MockERC20 token = new MockERC20();
        EAX eax = new EAX(address(token));

        eax.initializeAdvertisers();

        // Send half of the tokens to the EAX contract so it can pay out users
        token.transfer(address(eax), 500000 * 10**token.decimals());

        vm.stopBroadcast();
        
        // Log deployed addresses
        console.log("MockERC20 deployed at:", address(token));
        console.log("EAX contract deployed at:", address(eax));
    }
}
