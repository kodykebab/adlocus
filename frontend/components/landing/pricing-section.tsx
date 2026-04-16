"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Users",
    description: "Browse privately, earn ATTN tokens",
    price: { monthly: 0, annual: 0 },
    features: [
      "Install Chrome extension",
      "Local AI classification",
      "Fully encrypted matching",
      "Earn ATTN per impression",
      "Zero data collection",
    ],
    cta: "Get Extension",
    href: "#",
    popular: false,
  },
  {
    name: "Publishers",
    description: "Serve ethical ads, earn revenue",
    price: { monthly: 0, annual: 0 },
    features: [
      "3-line SDK integration",
      "Privacy-preserving ads",
      "Earn ATTN per impression",
      "No user tracking required",
      "Cross-site ad delivery",
      "Real-time analytics",
      "Custom ad placements",
    ],
    cta: "Integrate SDK",
    href: "/demo",
    popular: true,
  },
  {
    name: "Advertisers",
    description: "Target encrypted intents on-chain",
    price: { monthly: null, annual: null },
    features: [
      "Register targeting vectors",
      "Bid with ATTN tokens",
      "FHE-encrypted matching",
      "On-chain transparency",
      "Upload ad creatives",
      "Campaign analytics",
      "Custom budgets",
      "Faucet for testing",
    ],
    cta: "Launch Portal",
    href: "/advertiser",
    popular: false,
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="relative py-32 lg:py-40 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="max-w-3xl mb-20">
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase block mb-6">
            Stakeholders
          </span>
          <h2 className="font-display text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-6">
            Fair for
            <br />
            <span className="text-stroke">everyone</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl">
            Users earn. Publishers monetize ethically. Advertisers reach real intent. 
            All powered by ATTN tokens and fully homomorphic encryption.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-px bg-foreground/10">
          {plans.map((plan, idx) => (
            <div
              key={plan.name}
              className={`relative p-8 lg:p-12 bg-background ${
                plan.popular ? "md:-my-4 md:py-12 lg:py-16 border-2 border-foreground" : ""
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-8 px-3 py-1 bg-foreground text-primary-foreground text-xs font-mono uppercase tracking-widest">
                  Most Popular
                </span>
              )}

              {/* Plan Header */}
              <div className="mb-8">
                <span className="font-mono text-xs text-muted-foreground">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-3xl text-foreground mt-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-8 pb-8 border-b border-foreground/10">
                {plan.price.monthly !== null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl lg:text-6xl text-foreground">
                      Free
                    </span>
                  </div>
                ) : (
                  <span className="font-display text-4xl text-foreground">Pay per match</span>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-10">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={plan.href}
                className={`w-full py-4 flex items-center justify-center gap-2 text-sm font-medium transition-all group ${
                  plan.popular
                    ? "bg-foreground text-primary-foreground hover:bg-foreground/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground hover:bg-foreground/5"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          ))}
        </div>

        {/* Bottom Note */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          All interactions are verified on-chain. ATTN tokens are earned through legitimate attention exchange.{" "}
          <a href="#" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Read the whitepaper
          </a>
        </p>
      </div>
    </section>
  );
}
