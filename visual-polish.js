// ══════════════════════════════════════════════════════════════
//  HTRS VISUAL POLISH — NEXT-GEN CYBER EFFECTS
//  visual-polish.js — fully modular, non-destructive
//  Features: Particle System · Advanced Loader · Cyber Cursor
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── DEVICE DETECTION ──
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.matchMedia('(max-width: 768px)').matches;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ══════════════════════════════════════════════════════════════
  //  1. PARTICLE BACKGROUND SYSTEM
  // ══════════════════════════════════════════════════════════════

  function initParticles() {
    const canvas = document.createElement('canvas');
    canvas.id = 'htrs-particles';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);

    const ctx = canvas.getContext('2d');
    let W, H, particles, animId;

    // Config — lighter on mobile
    const CONFIG = {
      count:          isMobile ? 35 : 70,
      baseRadius:     isMobile ? 1  : 1.5,
      speed:          isMobile ? 0.25 : 0.4,
      lineDistance:   isMobile ? 100 : 140,
      lineOpacity:    0.18,
      colors: [
        'rgba(0,245,255,',    // neon cyan
        'rgba(0,128,255,',    // neon blue
        'rgba(112,0,255,',    // neon purple
        'rgba(0,255,136,',    // neon green
      ],
    };

    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }

    function createParticle() {
      const color = CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)];
      return {
        x:      Math.random() * W,
        y:      Math.random() * H,
        vx:     (Math.random() - 0.5) * CONFIG.speed,
        vy:     (Math.random() - 0.5) * CONFIG.speed,
        r:      CONFIG.baseRadius + Math.random() * 1.2,
        color,
        alpha:  0.4 + Math.random() * 0.5,
        pulse:  Math.random() * Math.PI * 2,
        pulseSpeed: 0.015 + Math.random() * 0.02,
      };
    }

    function initParticleArray() {
      particles = Array.from({ length: CONFIG.count }, createParticle);
    }

    function drawParticle(p) {
      p.pulse += p.pulseSpeed;
      const a = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
      const r = p.r * (0.85 + 0.15 * Math.sin(p.pulse));

      // Glow
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.5);
      grad.addColorStop(0, p.color + a + ')');
      grad.addColorStop(1, p.color + '0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + (a + 0.3).toFixed(2) + ')';
      ctx.fill();
    }

    function drawLines(p, i) {
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONFIG.lineDistance) {
          const alpha = CONFIG.lineOpacity * (1 - dist / CONFIG.lineDistance);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(0,245,255,${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    function moveParticle(p) {
      p.x += p.vx;
      p.y += p.vy;
      // Wrap around edges
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      particles.forEach((p, i) => {
        moveParticle(p);
        if (!isMobile) drawLines(p, i);
        drawParticle(p);
      });
      animId = requestAnimationFrame(tick);
    }

    // Mouse parallax (desktop only)
    let mouseX = W / 2, mouseY = H / 2;
    if (!isMobile) {
      window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        // Gentle push
        particles.forEach(p => {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const force = (120 - dist) / 120 * 0.015;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
            // Clamp speed
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > CONFIG.speed * 3) {
              p.vx = (p.vx / speed) * CONFIG.speed * 3;
              p.vy = (p.vy / speed) * CONFIG.speed * 3;
            }
          }
        });
      }, { passive: true });
    }

    // Visibility API — pause when tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        tick();
      }
    });

    window.addEventListener('resize', () => {
      resize();
      initParticleArray();
    });

    resize();
    initParticleArray();
    if (!prefersReducedMotion) tick();
  }

  // ══════════════════════════════════════════════════════════════
  //  2. ADVANCED LOADING SCREEN (upgrades existing .loading-screen)
  // ══════════════════════════════════════════════════════════════

  function upgradeLoadingScreen() {
    const existing = document.getElementById('loading-screen');
    if (!existing) return;

    // Upgrade inner content (keep original ID so script.js still hides it)
    existing.innerHTML = `
      <div class="htrs-loader-bg"></div>
      <div class="htrs-loader-grid"></div>
      <div class="htrs-loader-content">
        <div class="htrs-loader-emblem">
          <div class="htrs-loader-ring htrs-ring-1"></div>
          <div class="htrs-loader-ring htrs-ring-2"></div>
          <div class="htrs-loader-ring htrs-ring-3"></div>
          <div class="htrs-loader-logo-text">HTRS</div>
        </div>

        <div class="htrs-loader-lines">
          <div class="htrs-loader-subtitle">HIGH TECH ROBOTIC SQUAD</div>
          <div class="htrs-loader-typing" id="htrs-loader-typing"></div>
        </div>

        <div class="htrs-progress-wrap">
          <div class="htrs-progress-bar" id="htrs-progress-bar">
            <div class="htrs-progress-fill" id="htrs-progress-fill"></div>
            <div class="htrs-progress-glow"></div>
          </div>
          <div class="htrs-progress-pct" id="htrs-progress-pct">0%</div>
        </div>

        <div class="htrs-loader-status" id="htrs-loader-status">▸ Booting cyber systems...</div>

        <div class="htrs-loader-scanlines"></div>
      </div>
    `;

    // Typing sequence
    const STEPS = [
      { text: 'INITIALIZING HTRS SYSTEM...',  pct: 15, delay: 300  },
      { text: 'LOADING CYBER MODULES...',      pct: 35, delay: 700  },
      { text: 'ESTABLISHING FIREBASE LINK...', pct: 55, delay: 1200 },
      { text: 'SYNCING SQUAD DATABASE...',     pct: 72, delay: 1700 },
      { text: 'MOUNTING NEURAL INTERFACE...',  pct: 88, delay: 2100 },
      { text: 'ACCESS GRANTED ⚡',             pct: 100, delay: 2500 },
    ];

    const typingEl  = document.getElementById('htrs-loader-typing');
    const fillEl    = document.getElementById('htrs-progress-fill');
    const pctEl     = document.getElementById('htrs-progress-pct');
    const statusEl  = document.getElementById('htrs-loader-status');

    let currentPct = 0;

    function animatePct(target) {
      const step = () => {
        if (currentPct < target) {
          currentPct = Math.min(currentPct + 1, target);
          if (pctEl) pctEl.textContent = currentPct + '%';
          if (fillEl) fillEl.style.width = currentPct + '%';
          requestAnimationFrame(step);
        }
      };
      step();
    }

    function typeText(el, text, cb) {
      if (!el) { if (cb) cb(); return; }
      el.textContent = '';
      let i = 0;
      const interval = setInterval(() => {
        el.textContent += text[i];
        i++;
        if (i >= text.length) {
          clearInterval(interval);
          if (cb) setTimeout(cb, 300);
        }
      }, 28);
    }

    STEPS.forEach((step) => {
      setTimeout(() => {
        if (statusEl) {
          statusEl.style.opacity = '0';
          setTimeout(() => {
            statusEl.textContent = '▸ ' + step.text;
            statusEl.style.opacity = '1';
          }, 150);
        }
        animatePct(step.pct);
        if (step.pct === 100 && typingEl) {
          typeText(typingEl, 'ACCESS GRANTED');
          typingEl.classList.add('htrs-access-granted');
        }
      }, step.delay);
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  3. CYBER CURSOR
  // ══════════════════════════════════════════════════════════════

  function initCursor() {
    if (isMobile) return; // Disable on mobile

    const dot     = document.createElement('div');
    const outline = document.createElement('div');
    dot.className     = 'htrs-cursor-dot';
    outline.className = 'htrs-cursor-outline';
    dot.setAttribute('aria-hidden', 'true');
    outline.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dot);
    document.body.appendChild(outline);

    // Hide default cursor on body (CSS handles this)
    document.body.classList.add('htrs-custom-cursor');

    let mouseX = -100, mouseY = -100;
    let outlineX = -100, outlineY = -100;
    let isHovering = false;
    let rafId;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    // Hover targets
    const HOVER_SELECTORS = 'a,button,.btn,.oc-card,.event-card,.card,.contact-item,.member-card,.member-card-regular,.nav-link';

    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(HOVER_SELECTORS)) {
        isHovering = true;
        dot.classList.add('htrs-cursor-hover');
        outline.classList.add('htrs-cursor-hover');
      }
    }, { passive: true });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(HOVER_SELECTORS)) {
        isHovering = false;
        dot.classList.remove('htrs-cursor-hover');
        outline.classList.remove('htrs-cursor-hover');
      }
    }, { passive: true });

    document.addEventListener('mousedown', () => {
      dot.classList.add('htrs-cursor-click');
      outline.classList.add('htrs-cursor-click');
    });
    document.addEventListener('mouseup', () => {
      dot.classList.remove('htrs-cursor-click');
      outline.classList.remove('htrs-cursor-click');
    });

    // LERP outline follow
    const LERP = 0.12;
    function lerp(a, b, t) { return a + (b - a) * t; }

    function updateCursor() {
      // Dot snaps instantly
      dot.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;

      // Outline lerps
      outlineX = lerp(outlineX, mouseX, LERP);
      outlineY = lerp(outlineY, mouseY, LERP);
      outline.style.transform = `translate(${outlineX - 18}px, ${outlineY - 18}px)`;

      rafId = requestAnimationFrame(updateCursor);
    }

    updateCursor();

    // Hide when leaving window
    document.addEventListener('mouseleave', () => {
      dot.style.opacity = '0';
      outline.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      dot.style.opacity = '1';
      outline.style.opacity = '1';
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  BOOT SEQUENCE
  // ══════════════════════════════════════════════════════════════

  function boot() {
    // Particles — start immediately
    initParticles();

    // Cursor — start immediately
    initCursor();

    // Loading screen — upgrade once DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', upgradeLoadingScreen);
    } else {
      upgradeLoadingScreen();
    }
  }

  boot();

})();
