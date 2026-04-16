const { createCofheConfig, createCofheClient } = require('@cofhe/sdk/node');
const { chains } = require('@cofhe/sdk/chains');

async function main() {
    const config = createCofheConfig({ supportedChains: [chains.baseSepolia] });
    const cofheClient = createCofheClient(config);
    // Since we can't easily connect without a wallet, maybe just mock or check types.
    // wait, I can just console.log the properties of cofheClient to see the docs.
    console.log(Object.keys(cofheClient));
}
main();
