/**
 * eax-widget.js
 *
 * EAX Plug-and-Play Ad Widget
 * Drop two lines into any website to serve privacy-preserving EAX ads.
 *
 * Usage:
 *   <script src="eax-widget.js"
 *           data-contract="0x..."
 *           data-backend="https://your-backend.com"
 *           data-selector="#eax-ad">          <!-- optional, defaults to #eax-ad -->
 *   </script>
 *   <div id="eax-ad"></div>
 *
 * Optional per-slot overrides (on the div itself):
 *   <div id="eax-ad"
 *        data-contract="0x..."
 *        data-backend="https://..."
 *        data-fallback-title="Visit Us"
 *        data-fallback-link="https://..."
 *        data-fallback-cta="Learn More"
 *        data-fallback-image="https://...">
 *   </div>
 */

(function () {
  "use strict";

  const ETHERS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js";

  const EAX_ABI = [
    "function hasActiveMatch(address) view returns (bool)",
    "function activeAdvertiser(address) view returns (uint8)",
    "function recordImpression() external",
    "event ImpressionRecorded(address indexed user, uint8 advertiserId, uint64 payout)",
  ];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  function css(styles) {
    return Object.entries(styles)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}:${v}`)
      .join(";");
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  function renderFallback(slot, config) {
    const title = slot.dataset.fallbackTitle || config.fallbackTitle || "Powered by EAX";
    const link  = slot.dataset.fallbackLink  || config.fallbackLink  || "https://eax.network";
    const cta   = slot.dataset.fallbackCta   || config.fallbackCta   || "Learn More";
    const img   = slot.dataset.fallbackImage || config.fallbackImage || "";

    slot.innerHTML = `
      <div style="${css({
        fontFamily: "system-ui,-apple-system,sans-serif",
        background: "linear-gradient(135deg,#1a1a2e,#16213e)",
        border: "1px solid rgba(139,92,246,.25)",
        borderRadius: "16px",
        padding: "20px",
        maxWidth: "420px",
        color: "#fff",
      })}">
        ${img ? `<img src="${img}" alt="${title}" style="${css({ width:"100%", borderRadius:"10px", marginBottom:"12px", objectFit:"cover", maxHeight:"160px" })}"/>` : ""}
        <div style="${css({ fontSize:"11px", color:"#666", marginBottom:"8px" })}">EAX NETWORK · STANDARD</div>
        <div style="${css({ fontWeight:"700", fontSize:"18px", marginBottom:"12px" })}">${title}</div>
        <a href="${link}" target="_blank" rel="noopener noreferrer"
           style="${css({ display:"inline-block", background:"rgba(139,92,246,.15)", border:"1px solid rgba(139,92,246,.4)", color:"#a78bfa", padding:"8px 20px", borderRadius:"8px", textDecoration:"none", fontWeight:"600", fontSize:"13px" })}">
          ${cta}
        </a>
        <div style="${css({ marginTop:"10px", fontSize:"10px", color:"#444" })}">🔒 EAX Privacy-Preserving Ads</div>
      </div>`;
  }

  function renderPaidAd(slot, ad, contract, iface) {
    const uid = Math.random().toString(36).slice(2, 9);
    const btnId    = `eax-btn-${uid}`;
    const statusId = `eax-st-${uid}`;

    slot.innerHTML = `
      <div style="${css({
        fontFamily: "system-ui,-apple-system,sans-serif",
        background: "linear-gradient(135deg,#1a1a2e,#16213e)",
        border: "1px solid rgba(139,92,246,.35)",
        borderRadius: "16px",
        padding: "20px",
        maxWidth: "420px",
        color: "#fff",
        boxShadow: "0 8px 32px rgba(139,92,246,.15)",
      })}">
        ${ad.image ? `<img src="${ad.image}" alt="${ad.title}" style="${css({ width:"100%", borderRadius:"10px", marginBottom:"12px", objectFit:"cover", maxHeight:"180px" })}"/>` : ""}
        <div style="${css({ display:"flex", alignItems:"center", gap:"6px", marginBottom:"8px" })}">
          <span style="${css({ background:"rgba(139,92,246,.2)", border:"1px solid rgba(139,92,246,.4)", padding:"2px 8px", borderRadius:"6px", fontSize:"11px", color:"#a78bfa" })}">EAX AD</span>
          <span style="${css({ fontSize:"11px", color:"#555" })}">Privacy-Preserving</span>
        </div>
        <div style="${css({ fontWeight:"700", fontSize:"20px", background:"linear-gradient(to right,#a78bfa,#ec4899)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:"12px" })}">${ad.title}</div>
        <a href="${ad.link}" target="_blank" rel="noopener noreferrer"
           style="${css({ display:"inline-block", background:"linear-gradient(to right,#8b5cf6,#ec4899)", color:"#fff", padding:"9px 22px", borderRadius:"9px", textDecoration:"none", fontWeight:"600", fontSize:"13px" })}">
          ${ad.cta || "Learn More"}
        </a>
        <div style="${css({ marginTop:"14px", paddingTop:"14px", borderTop:"1px solid rgba(139,92,246,.2)" })}">
          <button id="${btnId}" style="${css({ width:"100%", background:"rgba(139,92,246,.1)", border:"1px solid #8b5cf6", color:"#a78bfa", padding:"10px", borderRadius:"8px", fontWeight:"600", fontSize:"13px", cursor:"pointer" })}">
            Confirm Impression &amp; Earn ATTN
          </button>
          <p id="${statusId}" style="${css({ marginTop:"8px", fontSize:"11px", textAlign:"center", display:"none", color:"#ef4444" })}"></p>
        </div>
        <div style="${css({ marginTop:"8px", fontSize:"10px", color:"#444" })}">🔒 Matched via encrypted intent</div>
      </div>`;

    // Wire up the button
    const btn      = slot.querySelector(`#${btnId}`);
    const statusEl = slot.querySelector(`#${statusId}`);

    btn.addEventListener("click", async () => {
      btn.textContent  = "Processing…";
      btn.style.opacity = "0.6";
      btn.style.pointerEvents = "none";
      statusEl.style.display = "none";

      try {
        const tx      = await contract.recordImpression();
        const receipt = await tx.wait();

        let payout = 0;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === "ImpressionRecorded") payout = Number(parsed.args[2]);
          } catch {}
        }

        btn.style.display = "none";
        statusEl.style.color   = "#10b981";
        statusEl.style.display = "block";
        statusEl.textContent   = `✅ Earned +${payout} ATTN!`;

        // Fire a custom DOM event so the host page can hook in (e.g. unlock scroll)
        slot.dispatchEvent(new CustomEvent("eax:impression", { detail: { payout, txHash: tx.hash }, bubbles: true }));

      } catch (err) {
        btn.textContent = "Confirm Impression & Earn ATTN";
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        statusEl.style.color   = "#ef4444";
        statusEl.style.display = "block";
        statusEl.textContent   = "Transaction failed or rejected.";
        console.warn("[EAX Widget] Impression failed:", err.message);
      }
    });
  }

  // ─── Bootstrap ───────────────────────────────────────────────────────────────

  async function initSlot(slot, config) {
    // Show skeleton while loading
    slot.innerHTML = `<div style="${css({ minHeight:"100px", borderRadius:"16px", background:"rgba(139,92,246,.06)", border:"1px solid rgba(139,92,246,.12)", display:"flex", alignItems:"center", justifyContent:"center" })}">
      <span style="${css({ fontSize:"11px", color:"#555", letterSpacing:".1em" })}">LOADING EAX AD…</span>
    </div>`;

    const contractAddress = slot.dataset.contract || config.contract;
    const backendUrl      = slot.dataset.backend   || config.backend;

    if (!contractAddress || !backendUrl) {
      console.warn("[EAX Widget] Missing data-contract or data-backend. Showing fallback.");
      return renderFallback(slot, config);
    }

    try {
      if (!window.ethereum) throw new Error("No wallet");

      const { ethers } = window;
      const provider   = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer      = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const contract    = new ethers.Contract(contractAddress, EAX_ABI, signer);
      const iface       = new ethers.Interface(EAX_ABI);

      const hasMatch = await contract.hasActiveMatch(userAddress);
      if (!hasMatch) {
        console.log("[EAX Widget] No active match for user. Showing fallback.");
        return renderFallback(slot, config);
      }

      const advId = Number(await contract.activeAdvertiser(userAddress));
      const res   = await fetch(`${backendUrl}/getAd/${advId}`);
      if (!res.ok) {
        console.warn(`[EAX Widget] No creative for advertiser #${advId}. Showing fallback.`);
        return renderFallback(slot, config);
      }

      const ad = await res.json();
      renderPaidAd(slot, ad, contract, iface);

    } catch (err) {
      console.warn("[EAX Widget] Error, showing fallback:", err.message);
      renderFallback(slot, config);
    }
  }

  // ─── Global config (captured at script-load time) ───────────────────────────

  let _globalConfig = null;

  async function getGlobalConfig() {
    if (_globalConfig) return _globalConfig;
    const scriptTag = document.querySelector('script[src*="eax-widget"]');
    _globalConfig = {
      contract:      scriptTag?.dataset?.contract     || "",
      backend:       scriptTag?.dataset?.backend      || "",
      selector:      scriptTag?.dataset?.selector     || "#eax-ad",
      fallbackTitle: scriptTag?.dataset?.fallbackTitle || "Powered by EAX",
      fallbackLink:  scriptTag?.dataset?.fallbackLink  || "https://eax.network",
      fallbackCta:   scriptTag?.dataset?.fallbackCta   || "Learn More",
      fallbackImage: scriptTag?.dataset?.fallbackImage || "",
    };
    return _globalConfig;
  }

  async function bootstrap() {
    const config = await getGlobalConfig();
    await loadScript(ETHERS_CDN);

    const slots = document.querySelectorAll(config.selector);
    if (!slots.length) {
      console.warn(`[EAX Widget] No elements found matching "${config.selector}".`);
      return;
    }
    await Promise.all([...slots].map(slot => initSlot(slot, config)));
  }

  // ─── Public API — window.EAX ─────────────────────────────────────────────────

  /**
   * Imperatively mount a single slot. Useful for infinite scrollers / React apps
   * that create ad divs dynamically after DOMContentLoaded.
   *
   * @param {HTMLElement} slotEl - The container element to render the ad into
   * @param {Object} [overrides] - Optional config overrides (contract, backend, etc.)
   *
   * Example (React / Next.js):
   *   useEffect(() => { window.EAX?.mountSlot(divRef.current); }, []);
   */
  async function mountSlot(slotEl, overrides = {}) {
    if (!slotEl) return console.warn("[EAX Widget] mountSlot: no element provided");
    await loadScript(ETHERS_CDN);
    const base   = await getGlobalConfig();
    const config = { ...base, ...overrides };
    await initSlot(slotEl, config);
  }

  // Expose globally
  window.EAX = { mountSlot };

  // Auto-bootstrap on static HTML usage
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();

