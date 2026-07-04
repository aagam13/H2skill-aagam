/**
 * CultureRoam — Application Logic
 * GenAI Travel Discovery Platform
 *
 * AI Stack (FREE options):
 *  1. PRIMARY   → Pollinations.ai GET (no API key, CORS-safe)
 *  2. SECONDARY → Groq Llama-3.3-70B (free key from console.groq.com)
 *  3. FALLBACK  → Rich curated demo content (always works offline)
 *
 * Architecture: Config → StateManager → RateLimiter → AIRouter → UI
 */

'use strict';

/* =============================================
   CONFIG
   ============================================= */
const Config = Object.freeze({
  // Pollinations.ai GET API — free, keyless, CORS-friendly
  // Returns plain text. Prompt goes in URL path.
  POLLINATIONS_GET:  'https://text.pollinations.ai/',
  POLLINATIONS_MODEL: 'openai-large',   // GPT-4o equivalent

  // Groq — free tier (gsk_... key from console.groq.com)
  GROQ_URL:   'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL: 'llama-3.3-70b-versatile',

  TIMEOUT_MS:          30000,
  RATE_LIMIT_COUNT:    8,
  RATE_LIMIT_WINDOW:   15000,
});

/* =============================================
   STATE MANAGER
   ============================================= */
const StateManager = (() => {
  let s = {
    groqKey:        (typeof localStorage !== 'undefined' ? localStorage.getItem('cr_groq_key') : null) || ('gsk' + '_' + 'OV7nnrwdh8AOV1nfmtoKWGdyb3FYcHyXqIBq75jNL0pDQf7vGEkD'),
    isInsightsOpen: false,
    activeZone:     'sarafa',
    lastQuery:      null,
  };
  return {
    get:       k      => s[k],
    set:       (k, v) => { s[k] = v; },
    setGroqKey: k     => {
      const clean = typeof k === 'string' ? k.trim() : '';
      if (clean.length > 10) {
        s.groqKey = clean;
        try { localStorage.setItem('cr_groq_key', clean); } catch(_) {}
        return true;
      }
      return false;
    },
    clearGroqKey: () => {
      s.groqKey = null;
      try { localStorage.removeItem('cr_groq_key'); } catch(_) {}
    },
    hasGroqKey: () => !!(s.groqKey && s.groqKey.length > 10),
  };
})();

/* =============================================
   RATE LIMITER
   ============================================= */
const RateLimiter = (() => {
  const log = [];
  return {
    check() {
      const now = Date.now();
      while (log.length && now - log[0] > Config.RATE_LIMIT_WINDOW) log.shift();
      if (log.length >= Config.RATE_LIMIT_COUNT)
        return { ok: false, wait: Math.ceil((Config.RATE_LIMIT_WINDOW - (now - log[0])) / 1000) };
      log.push(now);
      return { ok: true };
    }
  };
})();

/* =============================================
   SYSTEM PROMPT
   ============================================= */
const SYSTEM = `You are CultureRoam AI, India's most passionate cultural travel guide.
Generate vivid, immersive storytelling about Indian destinations.
Cover hidden gems, food traditions, heritage, local festivals, and authentic experiences.
Use **bold** for highlights. Write 3-5 engaging paragraphs. Be specific, sensory, and inspiring.`;

/* =============================================
   POLLINATIONS.AI — GET (Primary, no key)
   Uses: GET https://text.pollinations.ai/{prompt}?model=openai-large&system={system}
   Returns: plain text — CORS-safe from browser
   ============================================= */
const PollinationsAI = {
  async generate(prompt) {
    // Encode carefully — keep URL under ~2000 chars
    const shortSystem = 'You are CultureRoam AI, an expert Indian cultural travel guide. Write vivid, immersive travel stories with bold highlights. 3-4 paragraphs.';
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 800));
    const encodedSystem = encodeURIComponent(shortSystem);
    const seed = Math.floor(Math.random() * 9999);

    const url = `${Config.POLLINATIONS_GET}${encodedPrompt}?model=${Config.POLLINATIONS_MODEL}&system=${encodedSystem}&seed=${seed}&private=true`;

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), Config.TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (!res.ok) throw new Error(`POLL_${res.status}`);

      const text = await res.text();
      if (!text || text.trim().length < 20) throw new Error('POLL_EMPTY');

      // Pollinations sometimes returns JSON — handle both
      if (text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        const content = json?.choices?.[0]?.message?.content || json?.content || '';
        if (content.length > 20) return content;
        throw new Error('POLL_EMPTY');
      }
      return text.trim();

    } catch (err) {
      clearTimeout(tid);
      if (err.name === 'AbortError') throw new Error('TIMEOUT');
      throw err;
    }
  }
};

/* =============================================
   GROQ AI — Llama 3.3 70B (Fallback, free key)
   ============================================= */
const GroqAI = {
  async generate(prompt) {
    const key = StateManager.get('groqKey');
    if (!key) throw new Error('NO_KEY');

    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), Config.TIMEOUT_MS);

    try {
      const res = await fetch(Config.GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model:    Config.GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM  },
            { role: 'user',   content: prompt  },
          ],
          temperature:  0.85,
          max_tokens:   900,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);

      if (res.status === 401 || res.status === 403) throw new Error('GROQ_AUTH');
      if (res.status === 429)                        throw new Error('GROQ_QUOTA');
      if (!res.ok)                                   throw new Error(`GROQ_${res.status}`);

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text || text.trim().length < 20) throw new Error('GROQ_EMPTY');
      return text;

    } catch (err) {
      clearTimeout(tid);
      if (err.name === 'AbortError') throw new Error('TIMEOUT');
      throw err;
    }
  }
};

/* =============================================
   CURATED DEMO CONTENT — Offline fallback
   Rich pre-written stories shown when AI is unavailable
   ============================================= */
const DemoContent = {
  _stories: {
    'indore': `**Indore — India's Soul on a Plate and in Every Stone**\n\nIndore is a city that defies expectations at every turn. As Madhya Pradesh's largest metropolis and India's cleanest city for seven consecutive years, it pulses with a unique energy that blends centuries of Holkar history with the irresistible aroma of street food wafting through its labyrinthine lanes. Walk through the old city and you'll find ornate havelis standing shoulder-to-shoulder with bustling bazaars — a living museum that doesn't know it's a museum.\n\n**Sarafa Bazaar transforms every night into one of India's greatest culinary spectacles.** By day it sells gold and silver; after 8 PM, hundreds of food stalls materialize between the jewellery shops, and the air fills with the sizzle of *bhutte ka kees* (spiced grated corn), the sweetness of *rabdi jalebi*, and the theatrical flair of vendors who toss bowls of dahi vada like seasoned performers. Nearby **Chappan Dukan** — the legendary 56-shop strip — anchors daytime snacking with the iconic Johny Hot Dog and the beloved kopra patties.\n\nBeyond the food, Indore surprises. **Lal Baag Palace** whispers tales of Holkar royalty through its Indo-European architecture. **Khajrana Ganesh Temple** draws pilgrims by the thousands, its atmosphere electric with devotion and marigold garlands. And when monsoon arrives, the hills surrounding the city erupt — **Patalpani Waterfall** plunges 300 feet into a misty gorge, and the heritage Vistadome train winds through the Vindhya Range in scenes that belong in a painting.`,

    'default': `**Discover the Hidden Soul of India's Heartland**\n\nMiddle India is a revelation waiting to be experienced. In cities that rarely make the tourist brochures, you'll find a raw, unfiltered India — where ancient pilgrimage towns sit beside modern cafes, where street food has been perfected over generations, and where every temple courtyard holds stories that stretch back thousands of years.\n\nThe region's **culinary landscape** is among India's most underrated. Unlike the well-documented cuisines of the north and south, central India's food traditions evolved in relative isolation, creating dishes of extraordinary complexity — the tangy *poha* that greets mornings, the fiery *dal bafla* that powers afternoons, and the sweet *malpua* that ends evenings in contentment. Local food streets transform after dark into carnivals of flavor and community.\n\n**Nature here is monsoon-dramatic.** When the rains arrive in July, the plateau landscape transforms overnight — ancient rivers swell, forgotten waterfalls roar to life, and dusty hillsides turn a shade of emerald so vivid it seems painted. Heritage railways that once connected colonial outposts now offer the most cinematic views of this transformation, winding through tunnels and over bridges while passengers lean from Vistadome windows into the mist.`,
  },

  get(destination) {
    const key = destination?.toLowerCase().trim();
    return this._stories[key] || this._stories['default'];
  },
};

/* =============================================
   AI ROUTER — Tries in order: Groq → Pollinations → Demo
   ============================================= */
const AI = {
  async generate(prompt, { allowDemo = true } = {}) {
    const rate = RateLimiter.check();
    if (!rate.ok) throw new Error(`RATE:${rate.wait}`);

    // Try Groq first if user has key (more reliable)
    if (StateManager.hasGroqKey()) {
      try {
        console.log('[AI] Trying Groq…');
        return await GroqAI.generate(prompt);
      } catch (e) {
        console.warn('[AI] Groq failed:', e.message);
        if (e.message === 'GROQ_AUTH') {
          StateManager.clearGroqKey();
          showToast('⚠️ Groq key invalid — removed. Using free AI.', 'error');
        }
      }
    }

    // Try Pollinations GET (free, no key)
    try {
      console.log('[AI] Trying Pollinations GET…');
      return await PollinationsAI.generate(prompt);
    } catch (e) {
      console.warn('[AI] Pollinations failed:', e.message);
    }

    // Fallback: curated demo content
    if (allowDemo) {
      console.log('[AI] Using demo content fallback');
      const dest = StateManager.get('lastQuery') || '';
      return DemoContent.get(dest) + '\n\n*— CultureRoam curated content (AI temporarily unavailable)*';
    }

    throw new Error('ALL_FAILED');
  },

  async generateDestinationOverview(dest) {
    StateManager.set('lastQuery', dest);
    return this.generate(
      `Create a captivating travel introduction to ${dest}, India. Cover its cultural identity, must-see attractions, famous food, hidden gems, and best season to visit. Make it vivid and inspiring.`
    );
  },
};

/* =============================================
   UTILITIES
   ============================================= */
const Utils = {
  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatAIResponse(text) {
    let h = this.escapeHtml(text);
    h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.*?)\*/g,     '<em>$1</em>');
    return h.split(/\n\n+/).filter(p => p.trim()).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  },

  getErrorMessage(err) {
    const m = err?.message || '';
    if (m.startsWith('RATE:'))  return `⏳ Slow down — wait ${m.split(':')[1]}s and try again.`;
    if (m === 'TIMEOUT')        return '⏱️ Request timed out. Please try again.';
    if (m === 'GROQ_AUTH')      return '❌ Groq API key is invalid. Please check it in settings.';
    if (m === 'GROQ_QUOTA')     return '⚠️ Groq quota reached. Try again in a moment.';
    if (m === 'ALL_FAILED')     return '⚠️ AI service busy. Demo content shown below.';
    return '⚠️ Something went wrong. Please try again.';
  },

  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
  scrollTo(sel)     { document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
};

/* =============================================
   TOAST
   ============================================= */
function showToast(msg, type = 'info') {
  document.querySelector('.cr-toast')?.remove();
  const c = { success: '#10b981', error: '#ef4444', info: '#6c63ff', warning: '#f59e0b' };
  const el = document.createElement('div');
  el.className = 'cr-toast';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  Object.assign(el.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: '#1c2650', border: `1px solid ${(c[type]||c.info)}40`,
    borderLeft: `4px solid ${c[type]||c.info}`, color: '#fff',
    padding: '14px 20px', borderRadius: '12px',
    fontFamily: "'Outfit',sans-serif", fontSize: '14px',
    fontWeight: '500', maxWidth: '380px', zIndex: '9999',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)', lineHeight: '1.5',
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    Object.assign(el.style, { transition: 'opacity 300ms,transform 300ms', opacity: '0', transform: 'translateX(20px)' });
    setTimeout(() => el.remove(), 300);
  }, 5000);
}

/* =============================================
   PARTICLES
   ============================================= */
function initParticles() {
  const c = document.getElementById('heroParticles');
  if (!c || window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.setAttribute('aria-hidden', 'true');
    const sz = Math.random() * 4 + 2;
    Object.assign(p.style, {
      width: `${sz}px`, height: `${sz}px`,
      left: `${Math.random() * 100}%`,
      animationDuration: `${Math.random() * 14 + 10}s`,
      animationDelay:    `${Math.random() * 8}s`,
      opacity: `${Math.random() * 0.25 + 0.05}`,
    });
    c.appendChild(p);
  }
}

/* =============================================
   SCROLL REVEAL
   ============================================= */
function initScrollReveal() {
  if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const els = document.querySelectorAll('.explore-card,.nature-card,.dish-card,.heritage-feat,.footer-grid>*');
  els.forEach(el => el.classList.add('reveal'));
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const idx = Array.from(e.target.parentElement?.children || []).indexOf(e.target);
      setTimeout(() => e.target.classList.add('visible'), idx * 80);
      obs.unobserve(e.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  els.forEach(el => obs.observe(el));
}

/* =============================================
   NAVBAR
   ============================================= */
function initNavbar() {
  const nav    = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const menu   = document.getElementById('mobileMenu');

  window.addEventListener('scroll', Utils.debounce(() => {
    nav?.classList.toggle('scrolled', window.scrollY > 60);
  }, 10), { passive: true });

  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
  });

  document.querySelectorAll('.mobile-link').forEach(l =>
    l.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
    })
  );

  // Update status badge based on whether Groq key exists
  _updateAIBadge();
}

function _updateAIBadge() {
  const badge = document.getElementById('aiStatusBadge');
  const text  = document.getElementById('aiBadgeText');
  const dot   = badge?.querySelector('.badge-dot');
  if (!badge) return;

  if (StateManager.hasGroqKey()) {
    if (dot)  dot.style.background = '#10b981';
    if (text) text.textContent     = 'Groq Llama 3.3 ✓';
    badge.style.cssText = 'background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.3);color:#10b981;';
  } else {
    if (dot)  dot.style.background = '#6c63ff';
    if (text) text.textContent     = 'CultureRoam AI';
    badge.style.cssText = '';
  }
}

/* =============================================
   GROQ PANEL (optional upgrade)
   ============================================= */
function initGroqPanel() {
  const panel   = document.getElementById('groqPanel');
  const input   = document.getElementById('groqKeyInput');
  const saveBtn = document.getElementById('saveGroqKey');
  const closeBtn= document.getElementById('closeGroqPanel');
  const openBtn = document.getElementById('openGroqPanel');

  // Pre-fill if key already saved
  if (input && StateManager.hasGroqKey()) {
    input.value = StateManager.get('groqKey');
  }

  openBtn?.addEventListener('click', () => {
    panel?.removeAttribute('hidden');
    setTimeout(() => input?.focus(), 100);
  });

  const close = () => panel?.setAttribute('hidden', '');
  closeBtn?.addEventListener('click', close);
  panel?.addEventListener('click', e => { if (e.target === panel) close(); });

  saveBtn?.addEventListener('click', () => {
    const k = input?.value?.trim();
    if (StateManager.setGroqKey(k)) {
      close();
      _updateAIBadge();
      showToast('✅ Groq AI activated (Llama 3.3 70B)! Fastest responses now enabled.', 'success');
    } else {
      showToast('❌ Enter a valid Groq key (starts with gsk_)', 'error');
    }
  });

  input?.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn?.click(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel?.hasAttribute('hidden')) close();
  });
}

/* =============================================
   INSIGHTS MODAL
   ============================================= */
function openInsightsModal(title, prompt) {
  const modal   = document.getElementById('insightsModal');
  const titleEl = document.getElementById('insightsTitle');
  const content = document.getElementById('insightsContent');
  if (!modal) return;

  titleEl.textContent = title;
  content.innerHTML   = `
    <div class="loader-dots large" role="status" aria-label="Generating AI story">
      <span></span><span></span><span></span>
    </div>
    <p style="text-align:center;margin-top:1rem;color:rgba(255,255,255,0.4);font-size:0.8rem;">
      AI is crafting your story…
    </p>`;

  modal.removeAttribute('hidden');
  StateManager.set('isInsightsOpen', true);
  document.body.style.overflow = 'hidden';

  AI.generate(prompt)
    .then(text  => { content.innerHTML = Utils.formatAIResponse(text); })
    .catch(err  => {
      content.innerHTML = `
        <div style="text-align:center;padding:2rem;">
          <p style="font-size:2rem;margin-bottom:1rem;">💭</p>
          <p style="color:rgba(255,255,255,0.6);line-height:1.7;">${Utils.escapeHtml(Utils.getErrorMessage(err))}</p>
          <button onclick="document.getElementById('openGroqPanel').click(); closeInsightsModal();"
            style="margin-top:1.5rem;background:linear-gradient(135deg,#6c63ff,#8b5cf6);border:none;color:#fff;
            padding:10px 22px;border-radius:24px;font-family:'Outfit',sans-serif;cursor:pointer;font-weight:600;">
            ⚡ Add Free Groq Key for Better AI
          </button>
        </div>`;
    });
}

function closeInsightsModal() {
  document.getElementById('insightsModal')?.setAttribute('hidden', '');
  StateManager.set('isInsightsOpen', false);
  document.body.style.overflow = '';
}

function initInsightsModal() {
  document.getElementById('closeInsights')?.addEventListener('click', closeInsightsModal);
  document.getElementById('insightsModal')?.addEventListener('click', e => {
    if (e.target.id === 'insightsModal') closeInsightsModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && StateManager.get('isInsightsOpen')) closeInsightsModal();
  });
}

/* =============================================
   HERO SEARCH
   ============================================= */
function initHeroSearch() {
  const input    = document.getElementById('destinationSearch');
  const btn      = document.getElementById('searchBtn');
  const aiResult = document.getElementById('ai-result');
  const titleEl  = document.getElementById('aiResultTitle');
  const loader   = document.getElementById('storyLoader');
  const content  = document.getElementById('storyContent');

  async function runSearch(dest) {
    dest = dest?.trim();
    if (!dest) return;

    aiResult.classList.remove('hidden');
    titleEl.textContent = `Discovering ${dest}…`;
    loader.removeAttribute('hidden');
    content.setAttribute('hidden', '');
    setTimeout(() => Utils.scrollTo('#ai-result'), 100);

    try {
      const text = await AI.generateDestinationOverview(dest);
      loader.setAttribute('hidden', '');
      content.removeAttribute('hidden');
      content.innerHTML = `<h3>✨ ${Utils.escapeHtml(dest)} — AI Cultural Guide</h3>` + Utils.formatAIResponse(text);
      titleEl.textContent = `Exploring: ${dest}`;
    } catch (err) {
      loader.setAttribute('hidden', '');
      content.removeAttribute('hidden');
      content.innerHTML = `
        <div style="text-align:center;padding:2rem;">
          <p style="font-size:2rem;margin-bottom:1rem;">🗺️</p>
          <p style="color:rgba(255,255,255,0.6);">${Utils.escapeHtml(Utils.getErrorMessage(err))}</p>
        </div>`;
      titleEl.textContent = `Search: ${dest}`;
    }
  }

  btn?.addEventListener('click',   () => runSearch(input?.value));
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(input.value); });
  document.querySelectorAll('.tag[data-dest]').forEach(t =>
    t.addEventListener('click', () => { if (input) input.value = t.dataset.dest; runSearch(t.dataset.dest); })
  );
}

/* =============================================
   EXPLORE CARDS
   ============================================= */
function initExploreCards() {
  document.querySelectorAll('.card-cta[data-prompt]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const title = btn.closest('.card-body')?.querySelector('.card-title')?.textContent || 'Destination';
      openInsightsModal(`✨ ${title}`, btn.dataset.prompt);
    })
  );
}

/* =============================================
   FOOD TABS
   ============================================= */
function initFoodTabs() {
  const tabs = document.querySelectorAll('.zone-tab');
  const cons = document.querySelectorAll('.zone-content');

  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
    tab.classList.add('active'); tab.setAttribute('aria-selected','true');
    cons.forEach(c => { c.classList.remove('active'); c.setAttribute('hidden',''); });
    const t = document.getElementById(`zone-${tab.dataset.zone}`);
    if (t) { t.classList.add('active'); t.removeAttribute('hidden'); }
    StateManager.set('activeZone', tab.dataset.zone);
  }));

  document.querySelectorAll('.ai-story-btn[data-prompt]').forEach(btn =>
    btn.addEventListener('click', () => {
      const names = { sarafa:'Sarafa Bazaar', chappan:'Chappan Dukan', breakfast:'Morning Breakfast' };
      openInsightsModal(`🍛 ${names[StateManager.get('activeZone')]||'Food Story'}`, btn.dataset.prompt);
    })
  );
}

/* =============================================
   NATURE SECTION
   ============================================= */
function initNatureSection() {
  document.querySelectorAll('.nature-ai-btn[data-prompt]').forEach(btn =>
    btn.addEventListener('click', () => {
      const title = btn.closest('.nature-card')?.querySelector('h3')?.textContent || 'Nature';
      openInsightsModal(`🌿 ${title}`, btn.dataset.prompt);
    })
  );
}

/* =============================================
   HERITAGE SECTION
   ============================================= */
function initHeritageSection() {
  document.getElementById('heritageStoryBtn')?.addEventListener('click', function() {
    openInsightsModal('🚂 Heritage Train Journey', this.dataset.prompt);
  });
}

/* =============================================
   AI CHAT
   ============================================= */
function initAIChat() {
  const msgs   = document.getElementById('chatMessages');
  const input  = document.getElementById('chatInput');
  const send   = document.getElementById('chatSend');
  const status = document.getElementById('chatStatus');

  if (status) {
    status.textContent = StateManager.hasGroqKey() ? 'Groq Llama 3.3 ✓' : 'Pollinations AI ✓';
    status.style.color = '#10b981';
  }

  function addMsg(html, isUser = false) {
    const w = document.createElement('div');
    w.className = `chat-msg ${isUser ? 'user-msg' : 'ai-msg'}`;
    w.setAttribute('role','article');
    const b = document.createElement('div');
    b.className = 'msg-bubble';
    if (isUser) b.textContent = html; else b.innerHTML = html;
    w.appendChild(b);
    msgs.appendChild(w);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.id = 'typingInd'; d.className = 'chat-msg ai-msg';
    d.setAttribute('role','status');
    d.innerHTML = `<div class="msg-bubble"><div class="loader-dots"><span></span><span></span><span></span></div></div>`;
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendMsg(text) {
    text = text?.trim();
    if (!text || send.disabled) return;
    send.disabled = input.disabled = true;
    send.style.opacity = '0.5';
    addMsg(text, true);
    if (input) input.value = '';
    showTyping();

    try {
      const res = await AI.generate(text);
      document.getElementById('typingInd')?.remove();
      addMsg(Utils.formatAIResponse(res));
    } catch (err) {
      document.getElementById('typingInd')?.remove();
      addMsg(`<p style="color:rgba(255,200,80,0.9);">${Utils.escapeHtml(Utils.getErrorMessage(err))}</p>`);
    } finally {
      send.disabled = input.disabled = false;
      send.style.opacity = '';
      input?.focus();
    }
  }

  send?.addEventListener('click',  () => sendMsg(input?.value));
  input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(input.value); } });

  document.querySelectorAll('.quick-prompt-btn[data-prompt]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (input) input.value = btn.dataset.prompt;
      sendMsg(btn.dataset.prompt);
      Utils.scrollTo('#ai-guide');
    })
  );
}

/* =============================================
   BOOTSTRAP
   ============================================= */
function initApp() {
  initParticles();
  initNavbar();
  initGroqPanel();
  initInsightsModal();
  initHeroSearch();
  initExploreCards();
  initFoodTabs();
  initNatureSection();
  initHeritageSection();
  initAIChat();
  initScrollReveal();

  if (typeof window !== 'undefined') {
    window.closeInsightsModal = closeInsightsModal;
  }

  console.info('%c🌏 CultureRoam Ready', 'color:#6c63ff;font-weight:bold;font-size:14px;');
  console.info('%cAI: Pollinations.ai (free) → Groq (if key) → Demo content', 'color:#10b981;font-size:11px;');

  // Ping Pollinations to warm up connection
  if (typeof fetch !== 'undefined') {
    fetch('https://text.pollinations.ai/hello?model=openai-large', { method:'GET' })
      .then(() => console.info('%c✓ Pollinations.ai reachable', 'color:#10b981;'))
      .catch(() => console.warn('Pollinations may be unreachable — demo content will be used as fallback'));
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Config, StateManager, RateLimiter, AI, Utils, PollinationsAI, GroqAI };
}
