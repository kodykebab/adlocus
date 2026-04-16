import { pipeline, env } from './transformers/transformers.min.js';

// ============================================================
//  AdScience — Popup Pipeline Controller (In-Browser ML)
//  Manages the full state machine:
//    Idle -> Extracting -> Domains -> Classifying -> Interests
//    -> Encrypting -> Matching -> Results
//
//  History Extraction: REAL (chrome.history API)
//  Classification: REAL (Local WebAssembly ML via Transformers.js)
//  FHE & On-Chain: Wired to Ethereum Sepolia via CoFHE SDK
// ============================================================

// Setup environment for MV3 local ML
env.allowLocalModels = false; 
env.useBrowserCache = false; // Fix: use Chrome's native disk HTTP cache instead of buggy Cache API
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('scripts/transformers/');

// Standard 5 Categories (Reverted for FHE efficiency)
const CATEGORIES = ["crypto", "ai", "finance", "gaming", "dev"];

// Hardcoded advertisers (mock matching 5-item vectors)
const ADVERTISERS = [
  { vector: [1, 0, 1, 0, 0], bid: 10, name: "Advertiser #1 (Tech/Finance)" },
  { vector: [0, 1, 1, 0, 1], bid: 15, name: "Advertiser #2 (Gaming/Entertainment)" },
  { vector: [1, 1, 0, 1, 0], bid: 12, name: "Advertiser #3 (Broad Match)" },
];

// ---- State Machine ----
const STATES = [
  "state-idle",
  "state-extracting",
  "state-domains",
  "state-classifying",
  "state-interests",
  "state-encrypting",
  "state-matching",
  "state-results",
];

const STATE_TO_STEP = {
  "state-idle": 1,
  "state-extracting": 1,
  "state-domains": 1,
  "state-classifying": 2,
  "state-interests": 2,
  "state-encrypting": 3,
  "state-matching": 4,
  "state-results": 4,
};

let currentState = "state-idle";
let extractedDomains = [];
let userVector = [0, 0, 0, 0, 0];

// ---- DOM Ready ----
document.addEventListener("DOMContentLoaded", () => {
  // Buttons
  document.getElementById("btn-extract").addEventListener("click", startExtraction);
  document.getElementById("btn-classify").addEventListener("click", startClassification);
  document.getElementById("btn-encrypt").addEventListener("click", startEncryption);
  document.getElementById("btn-restart").addEventListener("click", restart);

  // Initialize Aesthetics
  initAesthetics();
  initBlurLoad();
  initBlurText("idle-heading", 150);
  
  // Reactivity texts
  const typingTexts = [
    "Private Attention Market", 
    "Zero-Knowledge Matching", 
    "FHE Enabled Bidding"
  ];
  initTypingEffect("header-subtitle", typingTexts, 60, 40, 2000);
});

// ---- Transition Helper ----
function goToState(stateId) {
  // Hide all panels
  document.querySelectorAll(".state-panel").forEach((el) => el.classList.remove("active"));
  // Show target
  const target = document.getElementById(stateId);
  if (target) target.classList.add("active");
  currentState = stateId;
  updateStepper(stateId);
}

function updateStepper(stateId) {
  const activeStep = STATE_TO_STEP[stateId] || 1;
  const steps = document.querySelectorAll(".step");
  const lines = document.querySelectorAll(".step-line");

  steps.forEach((s, i) => {
    const stepNum = i + 1;
    s.classList.remove("active", "done");
    if (stepNum < activeStep) s.classList.add("done");
    else if (stepNum === activeStep) s.classList.add("active");
  });

  lines.forEach((line, i) => {
    if (i + 1 < activeStep) line.classList.add("filled");
    else line.classList.remove("filled");
  });
}

// ---- Utility ----
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateHex(length) {
  const chars = "0123456789abcdef";
  let hex = "0x";
  for (let i = 0; i < length; i++) {
    hex += chars[Math.floor(Math.random() * 16)];
  }
  return hex;
}

// ============================================================
//  PHASE A: History Extraction (REAL)
// ============================================================
async function startExtraction() {
  goToState("state-extracting");

  // Talk to the background service worker
  chrome.runtime.sendMessage({ action: "extractHistory" }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById("extract-status").textContent =
        "Error: " + chrome.runtime.lastError.message;
      return;
    }

    if (response && response.status === "success") {
      extractedDomains = response.domains;
      showDomains(extractedDomains);
    }
  });
}

function showDomains(domains) {
  const list = document.getElementById("domain-list");
  const count = document.getElementById("domain-count");
  list.innerHTML = "";
  count.textContent = domains.length;

  domains.forEach((d) => {
    const li = document.createElement("li");
    li.textContent = d;
    li.classList.add("blur-reveal"); // Added Blur Reveal
    list.appendChild(li);
  });

  goToState("state-domains");
}

// ============================================================
//  PHASE B: LLM Classification (REAL Local ML via WebAssembly)
// ============================================================
let classifierPipeline = null;

async function startClassification() {
  goToState("state-classifying");

  try {
    // 1. Initialize local webassembly transformer model (downloads/caches on first run)
    if (!classifierPipeline) {
      document.querySelector("#state-classifying h2").textContent = "Loading AI Model...";
      document.querySelector("#state-classifying .panel-desc").textContent = "Downloading & caching model (~90MB). Next runs will be instant.";
      
      // Using a fast distilled zero-shot classification model
      classifierPipeline = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    }

    document.querySelector("#state-classifying h2").textContent = "Running Inference...";
    document.querySelector("#state-classifying .panel-desc").textContent = "Mapping history linearly onto categories...";

    // 2. Grab Domains Text 
    const textToClassify = extractedDomains.slice(0, 50).join(", ");
    if (!textToClassify) {
      // Fallback: if history is completely empty, pick 1 random interest to ensure non-zero vector
      userVector = [0, 0, 0, 0, 0];
      const randomIdx = Math.floor(Math.random() * 5);
      userVector[randomIdx] = 1;
      showInterests(userVector);
      return;
    }

    // 3. Local Model Inference for exact labels (Multi-Label)
    const result = await classifierPipeline(textToClassify, CATEGORIES, { multi_label: true });
    
    console.log("Local ML Zero-Shot Results:", result);

    // 4. Map into a binary vector by score threshold (e.g. > 0.2 means likely active interest)
    userVector = CATEGORIES.map((cat) => {
      const idx = result.labels.indexOf(cat);
      if (idx !== -1 && result.scores[idx] > 0.2) {
        return 1;
      }
      return 0;
    });

    // 5. Accuracy check: Guarantee at least one 1
    // If the model was unsure (all scores < 0.2), fallback to whichever category actually scored the absolute highest
    if (userVector.every(val => val === 0)) {
      let maxScore = -1;
      let maxIdx = 0;
      CATEGORIES.forEach((cat, index) => {
        const resIdx = result.labels.indexOf(cat);
        if (resIdx !== -1 && result.scores[resIdx] > maxScore) {
          maxScore = result.scores[resIdx];
          maxIdx = index;
        }
      });
      userVector[maxIdx] = 1;
    }

  } catch (err) {
    console.error("Local ML error:", err);
    // On unexpected crash, default to 1 active to avoid contract matching failure
    userVector = [1, 0, 0, 0, 0]; 
  }

  showInterests(userVector);
}

function showInterests(vector) {
  const container = document.getElementById("interest-tags");
  container.innerHTML = "";

  CATEGORIES.forEach((cat, i) => {
    const tag = document.createElement("span");
    tag.className = `tag ${vector[i] ? "active" : "inactive"}`;
    tag.textContent = cat;
    container.appendChild(tag);
  });

  document.getElementById("vector-code").textContent = `[${vector.join(", ")}]`;
  decryptText(document.getElementById("vector-code"), `[${vector.join(", ")}]`, 50);
  goToState("state-interests");
}

// ============================================================
//  PHASE C: Bridging Payload to Fhenix DApp
// ============================================================
async function startEncryption() {
  goToState("state-encrypting");

  const hexBlob = document.getElementById("hex-blob");
  hexBlob.textContent = "Locating Active EAX Next.js Instance...\n";

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || tabs.length === 0) return;
      
      chrome.tabs.sendMessage(tabs[0].id, { type: "EAX_USER_VECTOR_TO_APP", vector: userVector }, function(response) {
          if (chrome.runtime.lastError) {
              hexBlob.textContent += "Error: Connect securely via localhost:3000 to trigger CoFHE primitives.";
          } else {
              hexBlob.textContent += "Vector securely injected into Metamask context.\n";
              
              // Automatically push to results to show pending interaction 
              setTimeout(() => {
                 goToState("state-results");
              }, 1200);
          }
      });
  });
}

// ==== Restart ====
function restart() {
  extractedDomains = [];
  userVector = [0, 0, 0, 0, 0];
  goToState("state-idle");
}

// ============================================================
//  AESTHETICS (Spotlight, Magnet, Counter, Decrypt)
// ============================================================
function initAesthetics() {
  // Spotlight on panels (monochrome white glow via CSS)
  document.addEventListener("mousemove", (e) => {
    document.querySelectorAll(".panel-card").forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);
    });
  });

  // Magnetic Buttons
  document.querySelectorAll(".btn").forEach((btn) => {
    btn.classList.add("magnetic");
    btn.addEventListener("mousemove", (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = `translate(0px, 0px)`;
    });
  });
}

function decryptText(element, finalString, speed = 30) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  let iterations = 0;
  element.classList.add("decrypt-text");
  
  const interval = setInterval(() => {
    element.innerText = finalString
      .split("")
      .map((letter, index) => {
        if (index < iterations) {
          return finalString[index];
        }
        return chars[Math.floor(Math.random() * chars.length)];
      })
      .join("");
    
    if (iterations >= finalString.length) {
      clearInterval(interval);
      element.classList.remove("decrypt-text");
    }
    
    iterations += 1 / 3;
  }, speed);
}

function animateCountUp(element, endValue, duration) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 4);
    element.innerText = Math.floor(easeOut * endValue);
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.innerText = endValue;
    }
  };
  window.requestAnimationFrame(step);
}

// ==== Initial Load Effects ====
function initTypingEffect(elementId, texts, typeSpeed = 50, deleteSpeed = 30, pause = 1500) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  el.classList.add("typing-cursor");
  let textIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function type() {
    const currentText = texts[textIndex];
    if (isDeleting) {
      el.textContent = currentText.substring(0, charIndex - 1);
      charIndex--;
    } else {
      el.textContent = currentText.substring(0, charIndex + 1);
      charIndex++;
    }

    let speed = isDeleting ? deleteSpeed : typeSpeed;

    if (!isDeleting && charIndex === currentText.length) {
      speed = pause;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      textIndex = (textIndex + 1) % texts.length;
      speed = 300;
    }

    setTimeout(type, speed);
  }
  
  // Clear initial text and start after slight delay
  el.textContent = "";
  setTimeout(type, 300);
}

function initBlurLoad() {
  const elementsToBlur = document.querySelectorAll('.stepper, .panel-card');
  elementsToBlur.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.filter = 'blur(12px)';
    el.style.animation = `blurRevealEffect 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`;
    el.style.animationDelay = `${index * 150}ms`;
  });
}

function initBlurText(elementId, delay = 100) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const words = el.textContent.split(' ');
  el.innerHTML = '';
  
  words.forEach((word, index) => {
    const span = document.createElement('span');
    span.textContent = word + (index < words.length - 1 ? '\u00A0' : ''); // non-breaking space
    span.style.opacity = '0';
    span.style.filter = 'blur(10px)';
    span.style.transform = 'translateY(5px)';
    span.style.display = 'inline-block';
    
    // Animate using the existing keyframes
    span.style.animation = `blurRevealEffect 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards`;
    span.style.animationDelay = `${400 + index * delay}ms`; // start after main card load
    
    el.appendChild(span);
  });
}
