"use client";

import { useEffect, useState, useRef } from "react";

const layers = [
  { name: "Chrome Extension", role: "Local ML Inference", latency: "In-browser" },
  { name: "EAX dApp", role: "Encryption & Matching", latency: "Next.js" },
  { name: "Fhenix CoFHE", role: "FHE Coprocessor", latency: "ZK Pipeline" },
  { name: "Ethereum Sepolia", role: "Smart Contracts", latency: "On-chain" },
  { name: "Backend Relay", role: "Ad Creative Storage", latency: "Express.js" },
  { name: "Publisher SDK", role: "Cross-Site Serving", latency: "Vanilla JS" },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeLocation, setActiveLocation] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLocation((prev) => (prev + 1) % layers.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left: Content */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Architecture
            </span>
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight mb-8">
              Privacy by
              <br />
              design.
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed mb-12">
              Every layer of the EAX stack is built to ensure zero identifiable data 
              leaves the user&apos;s device. From local ML inference to on-chain FHE matching.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="text-4xl lg:text-5xl font-display mb-2">6</div>
                <div className="text-sm text-muted-foreground">Stack layers</div>
              </div>
              <div>
                <div className="text-4xl lg:text-5xl font-display mb-2">0</div>
                <div className="text-sm text-muted-foreground">Data leaked</div>
              </div>
              <div>
                <div className="text-4xl lg:text-5xl font-display mb-2">FHE</div>
                <div className="text-sm text-muted-foreground">Encrypted compute</div>
              </div>
            </div>
          </div>

          {/* Right: Architecture layers */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"
            }`}
          >
            <div className="border border-foreground/10">
              {/* Header */}
              <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
                <span className="text-sm font-mono text-muted-foreground">EAX Stack</span>
                <span className="flex items-center gap-2 text-xs font-mono text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  All operational
                </span>
              </div>

              {/* Layers */}
              <div>
                {layers.map((layer, index) => (
                  <div
                    key={layer.name}
                    className={`px-6 py-5 border-b border-foreground/5 last:border-b-0 flex items-center justify-between transition-all duration-300 ${
                      activeLocation === index ? "bg-foreground/[0.02]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span 
                        className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                          activeLocation === index ? "bg-foreground" : "bg-foreground/20"
                        }`}
                      />
                      <div>
                        <div className="font-medium">{layer.name}</div>
                        <div className="text-sm text-muted-foreground">{layer.role}</div>
                      </div>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">{layer.latency}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
