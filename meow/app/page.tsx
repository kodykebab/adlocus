"use client";
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { initEAX, getAd, renderAd } from "eax-sdk";

const AD_INTERVAL = 4; // Show an ad every 4 cats

function AdSlot({ index }: { index: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adInnerContainerRef = useRef<HTMLDivElement>(null);
  
  const [adLoaded, setAdLoaded] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Scroll lock effect
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isLocked]);

  useEffect(() => {
    let mounted = true;
    let viewObserver: IntersectionObserver | null = null;
    let didTriggerImpression = false;

    async function loadAd() {
      try {
        const contractAddress = process.env.NEXT_PUBLIC_EAX_CONTRACT_ADDRESS || "0xDccB007ee348C6E0B9fa29c0d1792529eD5fd40F";
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
        
        // Thanks to idempotency patch, this is safe to call across many AdSlots
        await initEAX({ contractAddress, backendUrl });
        const fetchedAd = await getAd();
        
        if (!mounted) return;
        
        setAdLoaded(true);

        if (fetchedAd && adInnerContainerRef.current) {
            // It's a REAL Paid EAX Ad! We use the SDK to render it + wire up interactive buttons
            setIsFallback(false);
            
            await renderAd(adInnerContainerRef.current, fetchedAd, {
                interactive: true,
                onImpressionRecorded: (result: any) => {
                    // Unlock user scroll automatically when payout succeeds!
                    setIsLocked(false);
                    console.log("Unlocked scroll! Payout:", result);
                }
            });

            // Start observing for when the rendered ad comes into view so we can lock scroll
            if (containerRef.current) {
                viewObserver = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !didTriggerImpression) {
                        didTriggerImpression = true;
                        // Forcefully scroll the button into the center of the screen
                        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Wait for smooth scrolling to finish before actually locking the document
                        setTimeout(() => setIsLocked(true), 600);
                        
                        if (viewObserver) viewObserver.disconnect();
                    }
                }, { threshold: 0.6 });
                
                viewObserver.observe(containerRef.current);
            }
        } else if (adInnerContainerRef.current) {
            // It's a Fallback Standard Ad (user had no matches on-chain)
            // We just render an unpaid standard HTML ad without locking scroll
            setIsFallback(true);
            adInnerContainerRef.current.innerHTML = `
              <div class="p-8 rounded-[2rem] bg-rose-950/40 backdrop-blur-xl border border-rose-400/20 shadow-2xl flex flex-col gap-6 w-full max-w-2xl mx-auto relative overflow-hidden">
                  <div class="absolute top-0 right-0 p-4 bg-zinc-800 rounded-bl-3xl text-[10px] font-black uppercase tracking-[0.2em] text-white z-10">
                      Standard Ad (Unpaid)
                  </div>
                  <div class="flex flex-col sm:flex-row gap-8 relative z-10 mt-4">
                      <img src="https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400&q=80" class="w-full sm:w-56 h-56 object-cover rounded-3xl shadow-inner border border-rose-900/50" />
                      <div class="flex flex-col justify-center flex-1">
                          <h3 class="text-3xl font-black text-rose-50 mb-4 drop-shadow-md tracking-tight leading-tight">Premium Organic Catnip</h3>
                          <a href="#" target="_blank" rel="noopener noreferrer" class="inline-block bg-white text-rose-950 font-black px-8 py-4 rounded-2xl shadow-lg hover:shadow-rose-500/20 hover:scale-105 active:scale-95 transition-all self-start text-sm tracking-wide uppercase">
                              Shop Now
                          </a>
                      </div>
                  </div>
              </div>
            `;
        }
      } catch (err: any) {
        console.error("Failed to load EAX SDK ad natively:", err);
      }
    }
    
    // Start observing when the slot is ALMOST in view so we can prefetch
    const preloadObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadAd();
            preloadObserver.disconnect();
        }
    }, { threshold: 0.1 });

    if (containerRef.current) {
        preloadObserver.observe(containerRef.current);
    }

    return () => {
      mounted = false;
      preloadObserver.disconnect();
      if (viewObserver) viewObserver.disconnect();
      document.body.style.overflow = 'auto'; 
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full relative min-h-[300px] flex flex-col items-center justify-center my-6 scroll-mt-24">
      {/* Loading State Overlay */}
      {!adLoaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-rose-950/20 rounded-[2rem] border border-rose-900/30">
            <span className="text-rose-400 animate-pulse text-xs font-bold tracking-[0.2em] uppercase">
                Loading Ad Slot...
            </span>
        </div>
      )}

      {/* Warning Alert if Locked */}
      {isLocked && adLoaded && (
          <div className="mb-4 text-rose-300 text-sm font-medium text-center bg-rose-900/30 py-3 px-6 rounded-xl border border-rose-500/20 animate-pulse w-full max-w-2xl">
              ⚠️ Scrolling paused. Please claim the payout in the ad below to continue scrolling.
          </div>
      )}
      
      {/* 
        CRITICAL FIX: This div must ALWAYS be in the DOM from frame 1! 
        Otherwise, adInnerContainerRef.current is null when we call await renderAd()
        immediately after setAdLoaded(true).
      */}
      <div 
        ref={adInnerContainerRef} 
        className={`w-full relative z-10 mx-auto max-w-2xl flex flex-col items-center transition-opacity duration-300 ${adLoaded ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
}

export default function MeowApp() {
  const [allCats, setAllCats] = useState<string[]>([]);
  const [displayedItems, setDisplayedItems] = useState<{type: 'cat' | 'ad', id: string, src?: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(displayedItems);
  const allCatsRef = useRef(allCats);
  
  itemsRef.current = displayedItems;
  allCatsRef.current = allCats;

  // Initial Fetch
  useEffect(() => {
    fetch('/api/cats')
      .then(res => res.json())
      .then(data => {
        if (data.cats && data.cats.length > 0) {
            // Shuffle
            const shuffled = data.cats.sort(() => 0.5 - Math.random());
            setAllCats(shuffled);
            loadMore(shuffled, []);
        }
        setLoading(false);
      });
  }, []);

  // Infinite Scroll Logic
  const loadMore = useCallback((catsSource: string[], currentItems: any[]) => {
      if (catsSource.length === 0) return;
      
      const nextBatchSize = 10;
      const startCatIndex = currentItems.filter(i => i.type === 'cat').length;
      
      let nextCats = [];
      for (let i = 0; i < nextBatchSize; i++) {
         const cat = catsSource[(startCatIndex + i) % catsSource.length];
         nextCats.push(cat);
      }

      // Mix in ads
      const newItems = [...currentItems];
      let currentAdCount = currentItems.filter(i => i.type === 'ad').length;
      
      nextCats.forEach((catSrc, i) => {
          newItems.push({ type: 'cat', id: `cat-${startCatIndex + i}`, src: catSrc });
          
          if (newItems.filter(item => item.type === 'cat').length % AD_INTERVAL === 0) {
              newItems.push({ type: 'ad', id: `ad-${currentAdCount}` });
              currentAdCount++;
          }
      });
      
      setDisplayedItems(newItems);
  }, []);

  useEffect(() => {
    if (loading) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore(allCatsRef.current, itemsRef.current);
      }
    }, { rootMargin: '600px' }); // Trigger a bit earlier before user hits the exact bottom
    
    if (bottomRef.current) {
        observer.observe(bottomRef.current);
    }
    
    return () => observer.disconnect();
  }, [loading, loadMore]);

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-background text-rose-400 text-3xl font-black italic animate-pulse tracking-tighter">
              purring...
          </div>
      );
  }

  return (
    <main className="min-h-screen w-full max-w-4xl mx-auto py-20 px-6 flex flex-col items-center">
      <div className="w-full text-center mb-24">
          <h1 className="text-8xl font-black bg-gradient-to-r from-rose-300 to-rose-600 text-transparent bg-clip-text tracking-tighter mb-6 drop-shadow-[0_0_40px_rgba(244,63,94,0.3)]">
              meow.
          </h1>
          <p className="text-rose-300/60 font-medium tracking-[0.2em] uppercase text-sm">aesthetic feline feed // encrypted ad monetization</p>
      </div>

      <div className="w-full flex flex-col gap-16 sm:gap-24 items-center">
        {displayedItems.map((item, index) => {
            if (item.type === 'ad') {
                return <AdSlot key={item.id} index={index} />;
            }
            
            return (
                <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 100 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10%" }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-2xl relative group"
                >
                    <div className="absolute -inset-4 bg-rose-500/10 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000 pointer-events-none"></div>
                    <div className="relative rounded-[2.5rem] overflow-hidden border-4 border-rose-950/80 shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-black">
                        <img 
                            src={item.src} 
                            alt="Aesthetic Cat" 
                            className="w-full h-auto max-h-[85vh] object-cover object-center group-hover:scale-[1.03] transition-transform duration-[2000ms] ease-out brightness-90 group-hover:brightness-100"
                            loading="lazy"
                        />
                    </div>
                </motion.div>
            );
        })}
      </div>
      
      {/* Intersection Observer Target */}
      <div ref={bottomRef} className="h-40 w-full mt-24 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-[3px] border-rose-900 border-t-rose-400 animate-spin"></div>
      </div>
    </main>
  );
}
