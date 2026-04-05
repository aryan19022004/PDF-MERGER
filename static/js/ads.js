document.addEventListener('DOMContentLoaded', () => {
    // Avoid showing ads on admin pages
    if (window.location.pathname.startsWith('/admin')) return;

    const AD_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

    // Create Modal UI dynamically
    const modalHTML = `
    <div id="dynamic-ad-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] opacity-0 pointer-events-none transition-opacity duration-300 flex items-center justify-center p-4">
        <div class="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative transform scale-95 transition-transform duration-300" id="dynamic-ad-content">
            
            <button id="ad-close-btn" class="absolute top-4 right-4 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-colors hidden z-10">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div id="ad-skip-timer" class="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-xs font-bold rounded-full backdrop-blur-md z-10 flex items-center gap-1">
                Skip in <span id="ad-skip-count">5</span>s
            </div>

            <a href="#" target="_blank" id="ad-link-wrapper" class="block relative group cursor-pointer">
                <img id="ad-image" src="" alt="Advertisement" class="w-full h-auto object-cover max-h-[60vh] bg-slate-100">
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span class="opacity-0 group-hover:opacity-100 bg-white/90 text-slate-900 font-bold px-4 py-2 rounded-full text-sm shadow-lg transition-all transform translate-y-2 group-hover:translate-y-0">Visit Site <i class="fa-solid fa-arrow-up-right-from-square ml-1 text-xs"></i></span>
                </div>
            </a>
            
            <div class="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Advertisement</span>
                <span class="text-[10px] font-semibold text-slate-300"><i class="fa-solid fa-shield-halved"></i> Verified</span>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('dynamic-ad-modal');
    const modalContent = document.getElementById('dynamic-ad-content');
    const closeBtn = document.getElementById('ad-close-btn');
    const skipTimer = document.getElementById('ad-skip-timer');
    const skipCount = document.getElementById('ad-skip-count');
    const image = document.getElementById('ad-image');
    const linkWrapper = document.getElementById('ad-link-wrapper');

    let currentAd = null;
    let watchTimeInterval = null;
    let watchTimeSeconds = 0;
    let skipInterval = null;

    async function fetchAd() {
        // Check cooldown
        const lastAdTime = localStorage.getItem('last_ad_time');
        if (lastAdTime) {
            const passed = Date.now() - parseInt(lastAdTime);
            if (passed < AD_COOLDOWN_MS) {
                return; // Cooldown active
            }
        }

        try {
            const res = await fetch('/api/ads/random');
            const data = await res.json();

            if (data.ad) {
                showAd(data.ad);
            }
        } catch (err) {
            console.error("Ad fetch failed", err);
        }
    }

    function showAd(ad) {
        currentAd = ad;
        image.src = ad.imageUrl;
        linkWrapper.href = ad.redirectLink;
        
        // Reset state
        watchTimeSeconds = 0;
        closeBtn.classList.add('hidden');
        skipTimer.classList.remove('hidden');
        let remainingSkip = ad.skipAfterSeconds;
        skipCount.textContent = remainingSkip;

        // Show Modal
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modalContent.classList.remove('scale-95');
        
        // Mark timestamp
        localStorage.setItem('last_ad_time', Date.now());

        // Track View immediately
        trackAction('view', 0);

        // Watch time counter
        watchTimeInterval = setInterval(() => {
            watchTimeSeconds++;
        }, 1000);

        // Skip timer logic
        if (remainingSkip > 0) {
            skipInterval = setInterval(() => {
                remainingSkip--;
                if (remainingSkip <= 0) {
                    clearInterval(skipInterval);
                    skipTimer.classList.add('hidden');
                    closeBtn.classList.remove('hidden');
                } else {
                    skipCount.textContent = remainingSkip;
                }
            }, 1000);
        } else {
            skipTimer.classList.add('hidden');
            closeBtn.classList.remove('hidden');
        }
    }

    function closeAd() {
        if (!currentAd) return;
        
        clearInterval(watchTimeInterval);
        clearInterval(skipInterval);
        
        modal.classList.add('opacity-0', 'pointer-events-none');
        modalContent.classList.add('scale-95');

        // Flush watch time to backend
        trackAction('view', watchTimeSeconds);
        currentAd = null;
    }

    function trackAction(action, time) {
        if (!currentAd) return;
        fetch('/api/ads/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ad_id: currentAd._id,
                action: action,
                watch_time: time
            })
        }).catch(()=>console.log('Tracking failed'));
    }

    // Bind UI actions
    closeBtn.addEventListener('click', closeAd);
    
    linkWrapper.addEventListener('click', () => {
        if (currentAd) {
            trackAction('click', watchTimeSeconds);
            setTimeout(closeAd, 100); // Close shortly after clicking
        }
    });

    // Strategy to not interrupt user tasks: Show ad 3 seconds after page load randomly
    setTimeout(() => {
        fetchAd();
    }, 3000);
});
