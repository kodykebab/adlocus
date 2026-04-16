// background.js focuses on non-UI tasks (history fetching)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractHistory") {
    // We want the last 100 visits
    chrome.history.search({text: '', maxResults: 100}, (results) => {
      let domains = new Set();
      
      results.forEach((page) => {
        try {
          const url = new URL(page.url);
          // Only keep http/https schemes, ignore chrome:// and others
          if(url.protocol === 'http:' || url.protocol === 'https:') {
            domains.add(url.hostname.replace(/^www\./, ''));
          }
        } catch (e) {
          // invalid url, skip
        }
      });
      
      const domainArray = Array.from(domains);
      
      sendResponse({ status: "success", domains: domainArray });
    });
    
    return true; // Keep the message channel open for sendResponse
  }
});
