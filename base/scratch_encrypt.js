const { createCofheConfig, createCofheClient } = require('@cofhe/sdk/node');
const { chains } = require('@cofhe/sdk/chains');
(async () => {
    const config = createCofheConfig({ supportedChains: [chains.baseSepolia] });
    const client = createCofheClient(config);
    // Dummy connect? Local node might not need publicClient for simple local encryption if it uses local keys? Wait, SDK might need network keys.
    // Let's just catch what encryptInputs requires/returns if possible, or search web.
})();
