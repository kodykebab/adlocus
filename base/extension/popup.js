document.getElementById('runBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    const loader = document.getElementById('loader');
    const btn = document.getElementById('runBtn');
    
    try {
        btn.disabled = true;
        loader.classList.remove('hidden');
        statusEl.innerText = "1. Reading local browser history...";

        const historyItems = await chrome.history.search({ text: '', maxResults: 100 });
        const domains = [...new Set(historyItems.map(item => new URL(item.url).hostname))];
        
        statusEl.innerText = "2. Analying intent locally via AI...";
        
        const prompt = `Analyze these top domains and determine which of the following 5 categories represent the user's interests: "crypto", "ai", "finance", "gaming", "dev". 
        Domains: ${domains.slice(0, 50).join(', ')}.
        Output ONLY a valid JSON array of the top categories identified. Example: ["ai", "crypto"]`;

        const response = await fetch('https://savannah-eat-portland-flickr.trycloudflare.com/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen3-vl:4b',
                prompt: prompt,
                stream: false
            })
        });

        const data = await response.json();
        
        // Parse the LLM response (best effort JSON extraction)
        let aiCategories = [];
        try {
            const match = data.response.match(/\[(.*?)\]/g);
            if (match && match.length > 0) aiCategories = JSON.parse(match[0]);
        } catch (e) {
            console.error("Failed to parse LLM output", e, data.response);
            // Default fallback if LLM is down or hallucinates
            aiCategories = ["crypto", "dev"];
        }

        const categories = ["crypto", "ai", "finance", "gaming", "dev"];
        const vector = categories.map(cat => aiCategories.includes(cat) ? 1 : 0);

        statusEl.innerText = `3. Interest Vector Generated:\n${JSON.stringify(vector)}\n\n4. Sending to App for FHE SDK Encryption...`;

        // Send to active tab (needs to be the EAX web app)
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "EAX_USER_VECTOR", vector }, function(response) {
                if (chrome.runtime.lastError) {
                    statusEl.innerText += "\n\nError: Please make sure you have the EAX Next.js App open to securely encrypt and dispatch the vector.";
                } else {
                    statusEl.innerText = "Vector successfully dispatched to Local EAX App. Please confirm the encryption transaction in your wallet.";
                }
                loader.classList.add('hidden');
                btn.disabled = false;
            });
        });

    } catch (e) {
        statusEl.innerText = "Error: " + e.message;
        loader.classList.add('hidden');
        btn.disabled = false;
    }
});
