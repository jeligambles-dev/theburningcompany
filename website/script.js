// ============================================
// AGENT ALUN — Scripts
// Real-time data from /api endpoints
// ============================================

// ---- Fire Particle System ----
(function initFireCanvas() {
    const canvas = document.getElementById('fireCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    let w, h;

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() {
            this.reset();
        }
        reset() {
            this.x = Math.random() * w;
            this.y = h + 10;
            this.size = Math.random() * 2.5 + 0.5;
            this.speedY = -(Math.random() * 1.2 + 0.3);
            this.speedX = (Math.random() - 0.5) * 0.5;
            this.opacity = Math.random() * 0.5 + 0.2;
            this.life = 0;
            this.maxLife = Math.random() * 200 + 100;
            const colors = [
                [255, 69, 0],
                [255, 107, 53],
                [255, 215, 0],
                [255, 140, 0],
            ];
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
        update() {
            this.x += this.speedX + Math.sin(this.life * 0.02) * 0.3;
            this.y += this.speedY;
            this.life++;
            this.opacity = (1 - this.life / this.maxLife) * 0.4;
            this.size *= 0.999;
            if (this.life >= this.maxLife || this.y < -10) {
                this.reset();
            }
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color[0]}, ${this.color[1]}, ${this.color[2]}, ${this.opacity})`;
            ctx.fill();
        }
    }

    const count = Math.min(80, Math.floor(w / 15));
    for (let i = 0; i < count; i++) {
        const p = new Particle();
        p.y = Math.random() * h;
        p.life = Math.random() * p.maxLife;
        particles.push(p);
    }

    function animate() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animate);
    }
    animate();
})();

// ---- Animated Counters ----
function animateCounter(el, target, suffix = '', duration = 2000) {
    if (!el) return;
    const start = parseFloat(el.dataset.currentValue || '0');
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (target - start) * eased;
        const display = suffix === '%'
            ? current.toFixed(2) + suffix
            : Math.floor(current).toLocaleString();
        el.textContent = display;
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.dataset.currentValue = target;
        }
    }
    requestAnimationFrame(update);
}

// ---- Real-Time Stats from API ----
let lastStats = null;

async function fetchStats() {
    try {
        const res = await fetch('/api/stats');
        if (!res.ok) return;
        const data = await res.json();
        lastStats = data;
        updateHeroStats(data);
        updateBurnTotal(data);
        updateActivitySummary();
        updateNavSolPrice();
        updateBuyLinks(data);
    } catch (err) {
        console.warn('[STATS] Fetch failed, using cached data');
    }
}

function updateHeroStats(data) {
    animateCounter(document.getElementById('totalBurned'), data.totalBurned);
    animateCounter(document.getElementById('burnEvents'), data.totalBurnEvents);
    animateCounter(document.getElementById('supplyReduced'), data.supplyReduced, '%');

    const mcEl = document.getElementById('marketCap');
    if (mcEl && data.token?.marketCap) {
        mcEl.textContent = formatUSD(data.token.marketCap);
    }
}

function updateBurnTotal(data) {
    const totalValue = document.querySelector('.burn-total-value');
    if (totalValue) {
        totalValue.textContent = Math.floor(data.totalBurned).toLocaleString() + ' $Alun';
    }

    // Update agent stats panel from real on-chain data
    const agent = data.agent;
    if (agent) {
        const revenue = document.getElementById('statRevenue');
        const buybacks = document.getElementById('statBuybacks');
        const pending = document.getElementById('statPending');

        if (revenue) revenue.textContent = formatUSD(agent.totalRevenueUsd || 0);
        if (buybacks) buybacks.textContent = formatUSD(agent.totalBuybackUsd || 0);
        if (pending) pending.textContent = formatUSD(agent.pendingUsd || 0);
    }
}

function formatUSD(value) {
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
    if (value >= 1) return '$' + value.toFixed(0);
    return '$' + value.toFixed(2);
}

// Fetch stats on load and every 5 seconds
fetchStats();
setInterval(fetchStats, 5000);

// ---- Real-Time Activity Feed (Buys = Green, Burns = Red) ----
let knownActivityIds = new Set();

async function fetchActivity() {
    try {
        const res = await fetch('/api/activity?limit=12');
        if (!res.ok) return;
        const data = await res.json();
        const feed = document.getElementById('activityFeed');
        if (!feed || !data.activity.length) return;

        const newItems = data.activity.filter(a => !knownActivityIds.has(a.id));

        if (newItems.length > 0 || knownActivityIds.size === 0) {
            if (knownActivityIds.size === 0) {
                feed.innerHTML = '';
            }

            newItems.reverse().forEach(item => {
                knownActivityIds.add(item.id);
                const entry = createActivityEntry(item);
                feed.prepend(entry);

                requestAnimationFrame(() => {
                    entry.style.transition = 'opacity 0.5s, transform 0.5s';
                    entry.style.opacity = '1';
                    entry.style.transform = 'translateY(0)';
                });
            });

            while (feed.children.length > 10) {
                feed.lastElementChild.remove();
            }
        }

    } catch (err) {
        console.warn('[ACTIVITY] Fetch failed');
    }
}

function updateActivitySummary() {
    // Use real on-chain agent stats (set by fetchStats), not activity feed counts
    if (!lastStats || !lastStats.agent) return;

    const agent = lastStats.agent;
    const burned = document.getElementById('summaryBurned');
    const bought = document.getElementById('summaryBought');
    const pendingEl = document.getElementById('summaryPending');

    if (burned) burned.textContent = formatUSD(agent.totalBuybackUsd || 0) + ' burned';
    if (bought) bought.textContent = formatUSD(agent.totalBuybackUsd || 0) + ' bought';
    if (pendingEl) pendingEl.textContent = formatUSD(agent.pendingUsd || 0) + ' queued';
}

function createActivityEntry(item) {
    const entry = document.createElement('div');
    const typeClass = item.type === 'buy' ? 'entry-buy' : item.type === 'burn' ? 'entry-burn' : 'entry-sell';
    entry.className = `burn-entry ${typeClass}`;
    entry.style.opacity = '0';
    entry.style.transform = 'translateY(-10px)';

    const timeAgo = getTimeAgo(item.timestamp);
    const solscanBase = 'https://solscan.io/tx/';
    const tx = item.signature || item.tx || '';
    const amount = item.tokenAmount || item.tokensReceived || item.tokensBurned || 0;
    const displayAmount = typeof amount === 'number'
        ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : amount;

    const txShort = tx ? tx.slice(0, 4) + '...' + tx.slice(-4) : '';
    const txLink = tx ? `<a href="${solscanBase}${tx}" target="_blank" rel="noopener" class="burn-tx"><span class="tx-hash">${txShort}</span> ↗ solscan</a>` : '';

    const walletShort = item.wallet ? item.wallet.slice(0, 4) + '...' + item.wallet.slice(-4) : '';

    if (item.type === 'buy') {
        const solDetail = item.solAmount ? `${item.solAmount.toFixed(4)} SOL` : '';
        entry.innerHTML = `
            <div class="entry-icon entry-icon-buy">BUY</div>
            <div class="burn-info">
                <div class="burn-amount amount-buy">${displayAmount} $Alun</div>
                <div class="burn-detail">${walletShort}${solDetail ? ' · ' + solDetail : ''}</div>
            </div>
            <div class="burn-meta">
                <div class="burn-time">${timeAgo}</div>
                ${txLink}
            </div>
        `;
    } else if (item.type === 'burn') {
        entry.innerHTML = `
            <div class="entry-icon entry-icon-burn">BURN</div>
            <div class="burn-info">
                <div class="burn-amount amount-burn">${displayAmount} $Alun</div>
                <div class="burn-detail">${walletShort} → supply deleted</div>
            </div>
            <div class="burn-meta">
                <div class="burn-time">${timeAgo}</div>
                ${txLink}
            </div>
        `;
    } else {
        // sell
        entry.innerHTML = `
            <div class="entry-icon entry-icon-sell">SELL</div>
            <div class="burn-info">
                <div class="burn-amount amount-sell">${displayAmount} $Alun</div>
                <div class="burn-detail">${walletShort}${item.solAmount ? ' · ' + item.solAmount.toFixed(4) + ' SOL' : ''}</div>
            </div>
            <div class="burn-meta">
                <div class="burn-time">${timeAgo}</div>
                ${txLink}
            </div>
        `;
    }
    return entry;
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hrs ago';
    return Math.floor(seconds / 86400) + ' days ago';
}

// Fetch activity on load and every 5 seconds
fetchActivity();
setInterval(fetchActivity, 5000);

// ---- Real-Time Tweets from API ----
async function fetchTweets() {
    try {
        const res = await fetch('/api/tweets');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.tweets || !data.tweets.length) return;

        const tweetsContainer = document.querySelector('.agent-tweets');
        if (!tweetsContainer) return;

        // Keep the header and follow link
        const header = tweetsContainer.querySelector('.tweets-header');
        const followLink = tweetsContainer.querySelector('.tweets-follow');

        // Remove existing tweet elements
        tweetsContainer.querySelectorAll('.tweet').forEach(el => el.remove());

        // Add real tweets (max 3 for display)
        const tweetsToShow = data.tweets.slice(0, 3);
        const fragment = document.createDocumentFragment();

        tweetsToShow.forEach(tweet => {
            const div = document.createElement('div');
            div.className = 'tweet reveal visible';

            const timeAgo = getTimeAgo(new Date(tweet.createdAt).getTime());
            // Escape HTML in tweet text
            const safeText = tweet.text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');

            const tweetUrl = tweet.id ? `https://x.com/AgentAlun/status/${tweet.id}` : '#';

            div.innerHTML = `
                <a href="${tweetUrl}" target="_blank" rel="noopener" class="tweet-link">
                    <div class="tweet-header">
                        <strong>Agent Alun</strong> <span class="tweet-handle">@AgentAlun</span>
                        <span class="tweet-time">· ${timeAgo}</span>
                    </div>
                    <p>${safeText}</p>
                    ${tweet.metrics ? `
                    <div class="tweet-metrics">
                        <span>❤️ ${tweet.metrics.like_count || 0}</span>
                        <span>🔄 ${tweet.metrics.retweet_count || 0}</span>
                        <span>💬 ${tweet.metrics.reply_count || 0}</span>
                    </div>` : ''}
                </a>
            `;
            fragment.appendChild(div);
        });

        // Insert tweets between header and follow link
        if (followLink) {
            tweetsContainer.insertBefore(fragment, followLink);
        } else {
            tweetsContainer.appendChild(fragment);
        }
    } catch (err) {
        // Keep existing placeholder tweets on error
        console.warn('[TWEETS] Fetch failed, keeping placeholders');
    }
}

// Fetch tweets on load and every 60 seconds
fetchTweets();
setInterval(fetchTweets, 60000);

// ---- Scroll Reveal ----
function initReveal() {
    const elements = document.querySelectorAll(
        '.about-card, .flow-step, .token-split, .burn-entry, .tweet, ' +
        '.treasury-card, .roadmap-item, .agent-id-card, .donut-chart'
    );
    elements.forEach(el => el.classList.add('reveal'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const parent = entry.target.parentElement;
                const siblings = parent ? Array.from(parent.children).filter(c => c.classList.contains('reveal')) : [];
                const idx = siblings.indexOf(entry.target);
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, idx * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    elements.forEach(el => observer.observe(el));
}
initReveal();

// ---- Mobile Menu ----
const mobileToggle = document.getElementById('mobileToggle');
const mobileMenu = document.getElementById('mobileMenu');

if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('open');
        mobileToggle.classList.toggle('active');
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
            mobileToggle.classList.remove('active');
        });
    });
}

// ---- Copy CA ----
function copyCA() {
    const addr = document.getElementById('caAddress');
    if (!addr) return;
    navigator.clipboard.writeText(addr.textContent).then(() => {
        const original = addr.textContent;
        addr.textContent = 'Copied!';
        setTimeout(() => { addr.textContent = original; }, 1500);
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(addr);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        document.execCommand('copy');
        window.getSelection().removeAllRanges();
    });
}
window.copyCA = copyCA;

// ---- Smooth scroll for nav links ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ---- Nav scroll effects ----
const mainNav = document.getElementById('mainNav');
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    // Scrolled class for background
    if (mainNav) {
        mainNav.classList.toggle('scrolled', window.scrollY > 30);
    }

    // Active section highlighting
    let current = '';
    sections.forEach(section => {
        const top = section.offsetTop - 100;
        if (window.scrollY >= top) {
            current = section.getAttribute('id');
        }
    });
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + current) {
            link.classList.add('active');
        }
    });
});

// ---- Buy button links (pump.fun page from env) ----
function updateBuyLinks(data) {
    const mint = data.token?.mint || data.mint;
    if (!mint) return;
    const pumpUrl = 'https://pump.fun/coin/' + mint;
    document.querySelectorAll('.nav-buy-btn, .mobile-buy-btn, .btn-primary').forEach(el => {
        el.href = pumpUrl;
        el.target = '_blank';
        el.rel = 'noopener';
    });
}

// ---- Nav SOL price ticker ----
function updateNavSolPrice() {
    if (!lastStats || !lastStats.agent) return;
    const price = lastStats.agent.solPrice;
    if (!price) return;
    const formatted = '$' + price.toFixed(2);
    const el = document.getElementById('navSolPrice');
    const elMobile = document.getElementById('navSolPriceMobile');
    if (el) el.textContent = formatted;
    if (elMobile) elMobile.textContent = formatted;
}
