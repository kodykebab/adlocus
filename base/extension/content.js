// content.js - Cross-realm Bridge Script
// Injects natively into the active webpage context and listens for secure extension messaging

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "EAX_USER_VECTOR_TO_APP") {
        console.log("AdScience Content Script Forwarding ML intent payload to DApp window...");
        // Pass to the React App layer listening on the standard window event bridge
        window.postMessage({ type: "EAX_USER_VECTOR_TO_APP", vector: request.vector }, "*");
        sendResponse({status: "success"});
    }
});
