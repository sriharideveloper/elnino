/* ==========================================================================
   EL NIÑO — THE HEAT ENGINE
   Main application script

   Live sources (all keyless and CORS-enabled, called straight from the browser):
     · NOAA Coral Reef Watch 5 km SST anomaly, via the PacIOOS ERDDAP server
     · NASA EONET v3 — open natural events
     · GDACS — orange / red humanitarian disaster alerts
     · GDELT DOC 2.0 — global news search
     · WordPress REST APIs of climate publications (analysis / blogs)
   Bundled: data/oni.js — the official NOAA CPC ONI record (cannot be fetched
   cross-origin, so it ships as a dated snapshot).
   ========================================================================== */

(() => {
'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const IS_MOBILE        = window.innerWidth < 768;
const PREFERS_REDUCED  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HAS_HOVER        = window.matchMedia('(hover: hover)').matches;
const THREE            = window.THREE;
const MIN = 60 * 1000, HOUR = 60 * MIN;

const CATS = {
    wildfires:    { label: 'Wildfires', color: '#ff7a1a' },
    severeStorms: { label: 'Storms',    color: '#7fd4ff' },
    floods:       { label: 'Floods',    color: '#4ecdc4' },
    drought:      { label: 'Drought',   color: '#ffc247' },
    volcanoes:    { label: 'Volcanoes', color: '#ff3d6e' },
    seaLakeIce:   { label: 'Sea ice',   color: '#cfe8f2' },
    other:        { label: 'Other',     color: '#9a8f8c' },
};
const GDACS_CAT = { TC: 'severeStorms', FL: 'floods', DR: 'drought', WF: 'wildfires', VO: 'volcanoes' };

const BLOGS = [
    { name: 'Yale Climate Connections', base: 'https://yaleclimateconnections.org' },
    { name: 'NASA Science',             base: 'https://science.nasa.gov' },
    { name: 'Grist',                    base: 'https://grist.org' },
    { name: 'RealClimate',              base: 'https://www.realclimate.org' },
    { name: 'Inside Climate News',      base: 'https://insideclimatenews.org' },
];

const SOURCES = {
    sst:    { label: 'NOAA Coral Reef Watch', state: 'pending' },
    eonet:  { label: 'NASA EONET',            state: 'pending' },
    gdacs:  { label: 'GDACS',                 state: 'pending' },
    news:   { label: 'GDELT',                 state: 'pending' },
    blogs:  { label: 'Climate blogs',         state: 'pending' },
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ── SMALL UTILITIES ────────────────────────────────────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(u) {
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
    catch { return ''; }
}
function plainText(html) {
    return new DOMParser().parseFromString(String(html ?? ''), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
}
function fmtDate(d) {
    const t = new Date(d);
    return isNaN(t) ? '' : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function relTime(ts) {
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}
function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

async function getJSON(url, timeout = 15000) {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// localStorage cache: fresh → reuse, expired → refetch, fetch failed → serve stale (and say so).
function readCache(key) {
    try { return JSON.parse(localStorage.getItem('elnino:' + key)); } catch { return null; }
}
function writeCache(key, data) {
    try { localStorage.setItem('elnino:' + key, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota / private mode */ }
}
async function withCache(key, ttl, loader, force = false) {
    const c = readCache(key);
    if (!force && c && Date.now() - c.ts < ttl) return { data: c.data, ts: c.ts, state: 'live' };
    try {
        const data = await loader();
        writeCache(key, data);
        return { data, ts: Date.now(), state: 'live' };
    } catch (err) {
        if (c) return { data: c.data, ts: c.ts, state: 'stale', err };
        throw err;
    }
}

// ── FILM GRAIN ─────────────────────────────────────────────────────────────
(function generateGrain() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 22;
    }
    ctx.putImageData(img, 0, 0);
    $('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

// ── TEXT SPLITTING ─────────────────────────────────────────────────────────
function splitChars(el) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.innerHTML = '';
    text.split(' ').forEach((word, i, arr) => {
        const w = document.createElement('span');
        w.className = 'word';
        w.setAttribute('aria-hidden', 'true');
        for (const ch of word) {
            const s = document.createElement('span');
            s.className = 'char';
            s.textContent = ch;
            w.appendChild(s);
        }
        el.appendChild(w);
        if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return $$('.char', el);
}
function splitWords(el) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.innerHTML = '';
    text.split(' ').forEach((w, i, arr) => {
        const s = document.createElement('span');
        s.className = 'word';
        s.textContent = w;
        el.appendChild(s);
        if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return $$('.word', el);
}
$$('[data-split-chars]').forEach(splitChars);
const conclusionWords = splitWords($('#conclusion-text'));

// ── LENIS + GSAP ───────────────────────────────────────────────────────────
const lenis = new Lenis({
    duration: 1.4,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smooth: true,
    smoothTouch: false,
    touchMultiplier: 2,
});
window.__lenis = lenis;

gsap.registerPlugin(ScrollTrigger);
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

let refreshTimer;
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { ScrollTrigger.sort(); ScrollTrigger.refresh(); }, 250);
}

// ── CUSTOM CURSOR (delegated, so it also works for content loaded later) ───
const cursorDot  = $('#cursor-dot');
const cursorRing = $('#cursor-ring');
let mouseX = -100, mouseY = -100, ringX = -100, ringY = -100;
let pointerNX = 0, pointerNY = 0;      // -1..1, for camera parallax
let tiltEl = null;

if (HAS_HOVER) {
    document.addEventListener('pointermove', e => {
        mouseX = e.clientX; mouseY = e.clientY;
        pointerNX = (e.clientX / innerWidth) * 2 - 1;
        pointerNY = (e.clientY / innerHeight) * 2 - 1;
        cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
        if (bg) bg.uniforms.u_mouse.value.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);

        // 3D tilt + specular highlight on cards
        const el = PREFERS_REDUCED ? null : e.target.closest?.('.news-card, .tilt');
        if (tiltEl && tiltEl !== el) {
            tiltEl.style.setProperty('--rx', '0deg');
            tiltEl.style.setProperty('--ry', '0deg');
        }
        tiltEl = el;
        if (el) {
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
            el.style.setProperty('--ry', `${(px - 0.5) * 7}deg`);
            el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
            el.style.setProperty('--mx', `${px * 100}%`);
            el.style.setProperty('--my', `${py * 100}%`);
        }
    }, { passive: true });

    document.addEventListener('pointerover', e => {
        const t = e.target;
        cursorRing.classList.toggle('is-video-hover', !!t.closest?.('.video-card'));
        cursorRing.classList.toggle('is-drag', !!t.closest?.('#globe-container, .split-slider'));
        cursorRing.classList.toggle('is-hovering', !!t.closest?.('a, button, .stat, .impact-card, #oni-chart'));
    }, { passive: true });
}

// ── PRELOADER ──────────────────────────────────────────────────────────────
document.body.classList.add('is-loading');
lenis.stop();

function runPreloader() {
    const tl = gsap.timeline({
        onComplete: () => {
            $('#preloader').style.display = 'none';
            document.body.classList.remove('is-loading');
            document.body.classList.add('is-ready');
            lenis.start();
            initHeroAnimations();
        }
    });
    tl.to('.preloader-line', { width: 120, duration: 0.8, ease: 'power2.inOut' }, 0.2)
      .to('.preloader-title', { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.3)
      .to('.preloader-bar-fill', { width: '100%', duration: 1.5, ease: 'power1.inOut' }, 0.5)
      .to(['.preloader-title', '.preloader-line', '.preloader-bar', '.preloader-status'], { opacity: 0, y: -20, duration: 0.5, stagger: 0.05 }, 2.2)
      .to('.preloader', { yPercent: -100, duration: 0.9, ease: 'power3.inOut' }, 2.6);
}
Promise.all([
    document.fonts.ready,
    new Promise(r => setTimeout(r, PREFERS_REDUCED ? 200 : 900))
]).then(runPreloader);

// ── HERO ───────────────────────────────────────────────────────────────────
function initHeroAnimations() {
    const tl = gsap.timeline();
    tl.to('.kicker', { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0)
      .to('.hero-title-inner', { y: 0, duration: 1.6, ease: 'expo.out' }, 0.1)
      .fromTo('.hero-title', { letterSpacing: '0.12em' }, { letterSpacing: '0.01em', duration: 2.2, ease: 'expo.out' }, 0.1)
      .to('.hero-sub', { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.7)
      .to('.hero-aside', { y: 0, opacity: 1, duration: 1, ease: 'power2.out' }, 0.8)
      .to('#scroll-cue', { opacity: 1, duration: 1, ease: 'power2.inOut' }, 1.3);

    const out = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero-content', { y: -140, opacity: 0, scale: 0.96, transformOrigin: 'left center', immediateRender: false, scrollTrigger: out });
    gsap.to('.hero-aside',   { y: -80,  opacity: 0, immediateRender: false, scrollTrigger: out });
    gsap.to('#scroll-cue',   { opacity: 0, immediateRender: false, scrollTrigger: { trigger: '.hero', start: '10% top', end: '25% top', scrub: true } });
}

// ── INTERSTITIALS: characters resolve out of a blur as you scroll through ──
$$('.interstitial-text').forEach(el => {
    gsap.fromTo($$('.char', el),
        { opacity: 0, y: 34, filter: PREFERS_REDUCED ? 'none' : 'blur(10px)' },
        {
            opacity: 1, y: 0, filter: 'blur(0px)',
            ease: 'power2.out', stagger: 0.04,
            scrollTrigger: { trigger: el.closest('.interstitial'), start: 'top 80%', end: 'center 45%', scrub: 0.6 }
        });
});

// ── WEBGL: FLUID HEAT SHADER + 3D PARTICLE OCEAN ───────────────────────────
const NOISE_GLSL = `
    vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
    vec2 mod289(vec2 x){ return x - floor(x*(1./289.))*289.; }
    vec3 permute(vec3 x){ return mod289(((x*34.)+1.)*x); }
    float snoise(vec2 v){
        const vec4 C = vec4(.211324865,.366025403,-.577350269,.024390243);
        vec2 i = floor(v + dot(v,C.yy));
        vec2 x0= v - i + dot(i,C.xx);
        vec2 i1 = (x0.x>x0.y) ? vec2(1.,0.) : vec2(0.,1.);
        vec4 x12= x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y+vec3(0.,i1.y,1.)) + i.x+vec3(0.,i1.x,1.));
        vec3 m = max(.5 - vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)), 0.);
        m = m*m; m = m*m;
        vec3 x_ = 2.*fract(p*C.www)-1.;
        vec3 h  = abs(x_)-.5;
        vec3 ox = floor(x_+.5);
        vec3 a0 = x_-ox;
        m *= 1.79284291400159-.85373472095314*(a0*a0+h*h);
        vec3 g;
        g.x  = a0.x *x0.x  + h.x *x0.y;
        g.yz = a0.yz*x12.xz + h.yz*x12.yw;
        return 130.*dot(m,g);
    }
`;

let bg = null;            // { renderer, uniforms, ocean… }
let targetHeat = 0.5;     // driven by the live anomaly
let scrollProg = 0, scrollY = 0, scrollLimit = 1;

function initWebGL() {
    if (!THREE) return null;
    const canvas = $('#webgl-canvas');
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
    } catch (err) {
        console.warn('WebGL unavailable:', err);
        return null;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.autoClear = false;

    // ---- Pass 1: full-screen domain-warped FBM (the "heat") ----
    const bgScene  = new THREE.Scene();
    const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    bgCamera.position.z = 1;

    const uniforms = {
        u_time:       { value: 0 },
        u_resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
        u_scroll:     { value: 0 },
        u_heat:       { value: 0.5 },
        u_mouse:      { value: new THREE.Vector2(0.5, 0.5) },
    };
    const bgMat = new THREE.ShaderMaterial({
        uniforms, depthWrite: false, depthTest: false,
        vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
        fragmentShader: `
            precision mediump float;
            uniform float u_time; uniform vec2 u_resolution; uniform float u_scroll; uniform float u_heat; uniform vec2 u_mouse;
            ${NOISE_GLSL}
            float fbm(vec2 p){ float f=0., w=.5; for(int i=0;i<4;i++){ f+=w*snoise(p); p*=2.03; w*=.48; } return f; }
            void main(){
                vec2 st = gl_FragCoord.xy / u_resolution;
                vec2 uv = st; uv.x *= u_resolution.x / u_resolution.y;
                float t = u_time * 0.012;

                vec2 m = u_mouse; m.x *= u_resolution.x / u_resolution.y;
                float d = distance(uv, m);
                uv += normalize(uv - m + 1e-4) * smoothstep(0.3, 0.0, d) * 0.05;

                vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2,1.3) + t*0.7));
                vec2 r = vec2(fbm(uv + 3.0*q + vec2(1.7,9.2) + t*0.2), fbm(uv + 3.0*q + vec2(8.3,2.8) + t*0.15));
                float f = fbm(uv + 3.0*r);

                vec3 deep  = vec3(0.022, 0.003, 0.003);
                vec3 ocean = vec3(0.055, 0.010, 0.010);
                vec3 warm  = vec3(0.50, 0.12, 0.04);
                vec3 hot   = vec3(0.26, 0.03, 0.01);
                vec3 blood = vec3(0.12, 0.02, 0.02);

                float heat = (0.25 + u_scroll) * u_heat;
                vec3 col = mix(deep, ocean, smoothstep(-0.6, 0.4, f));
                col = mix(col, blood, smoothstep(0.1, 0.7, f) * heat * 0.3);
                col = mix(col, warm,  smoothstep(0.2, 0.8, f) * heat);
                col = mix(col, hot,   smoothstep(0.5, 1.0, f) * heat * 0.5);
                col += vec3(0.03, 0.005, 0.005) * smoothstep(-0.2, 0.3, fbm(uv*2.0 + t*0.04));

                /* thin incandescent filaments along the flow lines */
                col += vec3(1.0, 0.35, 0.1) * pow(smoothstep(0.06, 0.0, abs(f - 0.28)), 2.0) * 0.10 * heat;

                /* vignette */
                vec2 v = st - 0.5;
                col *= 1.0 - dot(v, v) * 0.9;
                gl_FragColor = vec4(col, 1.0);
            }`
    });
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

    // ---- Pass 2: the ocean — a sheet of particles carrying a warm pool eastward ----
    const oceanScene  = new THREE.Scene();
    const oceanCamera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 220);

    const COLS = IS_MOBILE ? 150 : 340, ROWS = IS_MOBILE ? 90 : 190;
    const X0 = -62, X1 = 62, Z0 = -78, Z1 = 12;
    const pos  = new Float32Array(COLS * ROWS * 3);
    const rand = new Float32Array(COLS * ROWS);
    let k = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++, k++) {
            pos[k * 3]     = X0 + (c / (COLS - 1)) * (X1 - X0) + (Math.random() - 0.5) * 0.18;
            pos[k * 3 + 1] = 0;
            pos[k * 3 + 2] = Z0 + (r / (ROWS - 1)) * (Z1 - Z0);
            rand[k] = Math.random();
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

    const oceanUniforms = {
        uTime:    { value: 0 },
        uHeat:    { value: 0.5 },
        uOpacity: { value: 0 },
        uPx:      { value: renderer.getPixelRatio() },
    };
    const oceanMat = new THREE.ShaderMaterial({
        uniforms: oceanUniforms,
        transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
            attribute float aRand;
            uniform float uTime, uHeat, uOpacity, uPx;
            varying vec3 vColor; varying float vAlpha;
            ${NOISE_GLSL}
            void main(){
                vec3 p = position;
                float t = uTime;
                float swell = sin(p.x*0.22 + t*0.55) * 0.55
                            + sin(p.z*0.31 - t*0.42 + p.x*0.09) * 0.5
                            + snoise(vec2(p.x*0.045 + t*0.035, p.z*0.06 - t*0.02)) * 1.9
                            + snoise(vec2(p.x*0.16 - t*0.06, p.z*0.2)) * 0.35;
                p.y += swell;

                /* the warm pool: a slow blob of heat drifting east (+x) */
                float pool = snoise(vec2(p.x*0.022 - t*0.018, p.z*0.03 + 4.0)) * 0.5 + 0.5;
                float heat = smoothstep(0.34, 0.80, pool + (uHeat - 0.6) * 0.22 + p.x * 0.0022);

                vec3 cold  = vec3(0.05, 0.20, 0.52);
                vec3 hot   = vec3(1.00, 0.24, 0.06);
                vec3 crest = vec3(1.00, 0.80, 0.52);
                vec3 col = mix(cold, hot, heat);
                col = mix(col, crest, smoothstep(1.0, 2.4, swell) * (0.25 + heat * 0.75));
                vColor = col * (0.45 + 0.85 * smoothstep(-1.6, 1.8, swell));

                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mv;
                float depth = -mv.z;
                gl_PointSize = clamp((1.1 + aRand * 1.5) * uPx * (58.0 / max(depth, 1.0)), 1.3 * uPx, 7.0 * uPx);
                vAlpha = smoothstep(104.0, 44.0, depth) * smoothstep(2.0, 9.0, depth) * uOpacity * (0.6 + aRand * 0.4);
            }`,
        fragmentShader: `
            precision mediump float;
            varying vec3 vColor; varying float vAlpha;
            void main(){
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.05, d);
                gl_FragColor = vec4(vColor, a * vAlpha);
            }`
    });
    const points = new THREE.Points(geo, oceanMat);
    points.frustumCulled = false;
    oceanScene.add(points);

    window.addEventListener('resize', () => {
        renderer.setSize(innerWidth, innerHeight, false);
        uniforms.u_resolution.value.set(innerWidth, innerHeight);
        oceanCamera.aspect = innerWidth / innerHeight;
        oceanCamera.updateProjectionMatrix();
    });

    return { renderer, uniforms, bgScene, bgCamera, oceanScene, oceanCamera, oceanUniforms, camX: 0, camY: 0 };
}
bg = initWebGL();

lenis.on('scroll', e => {
    scrollY = e.animatedScroll;
    scrollLimit = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollProg = clamp(scrollY / scrollLimit, 0, 1);
    updateScrollHUD();
});

// ── RENDER LOOP ────────────────────────────────────────────────────────────
const t0 = performance.now();
gsap.ticker.add(() => {
    const time = (performance.now() - t0) / 1000;

    if (bg) {
        const { renderer, uniforms, oceanUniforms, oceanCamera } = bg;
        uniforms.u_time.value   = time;
        uniforms.u_scroll.value = scrollProg;
        uniforms.u_heat.value  += (targetHeat - uniforms.u_heat.value) * 0.015;

        // The ocean owns the hero, sinks away while you read, and rises again at the end.
        const vh = innerHeight;
        const heroVis = clamp(1 - scrollY / (vh * 1.7), 0, 1);
        const endVis  = clamp((scrollY - (scrollLimit - vh * 1.1)) / vh, 0, 1);
        const vis     = Math.max(heroVis, endVis * 0.85);
        oceanUniforms.uOpacity.value += (vis - oceanUniforms.uOpacity.value) * 0.08;
        oceanUniforms.uTime.value = time * (PREFERS_REDUCED ? 0.15 : 1);
        oceanUniforms.uHeat.value = uniforms.u_heat.value;

        const lift = endVis > 0 ? (1 - endVis) : (1 - heroVis);
        bg.camX += (pointerNX * 2.4 - bg.camX) * 0.04;
        bg.camY += (-pointerNY * 0.8 - bg.camY) * 0.04;
        oceanCamera.position.set(bg.camX, 6.4 + lift * 10 + bg.camY, 16 - lift * 5);
        oceanCamera.lookAt(bg.camX * 0.3, 2.2 - lift * 3, -14);

        renderer.clear();
        renderer.render(bg.bgScene, bg.bgCamera);
        if (oceanUniforms.uOpacity.value > 0.004) renderer.render(bg.oceanScene, oceanCamera);
    }

    if (HAS_HOVER) {
        ringX += (mouseX - ringX) * 0.14;
        ringY += (mouseY - ringY) * 0.14;
        cursorRing.style.transform = `translate(${ringX}px, ${ringY}px)`;
    }
});

// ── HUD (lives in the letterbox bars) ──────────────────────────────────────
const hud = {
    clock: $('#hud-clock'), nino: $('#hud-nino'), oni: $('#hud-oni'), events: $('#hud-events'),
    dot: $('#hud-dot'), live: $('#hud-live-label'),
    index: $('#hud-index'), name: $('#hud-name'), fill: $('#hud-scroll-fill'), pct: $('#hud-pct'),
};
const progressBar = $('#progress-bar');

function updateScrollHUD() {
    progressBar.style.transform = `scaleX(${scrollProg})`;
    hud.fill.style.transform = `scaleX(${scrollProg})`;
    hud.pct.textContent = String(Math.round(scrollProg * 100)).padStart(3, '0');
    updateHudSection();
}
function tickClock() {
    hud.clock.textContent = new Date().toISOString().slice(11, 19) + ' UTC';
}
tickClock();
setInterval(tickClock, 1000);

const hudSections = $$('[data-hud]');
$('#hud-total').textContent = String(hudSections.length).padStart(2, '0');
let hudCurrent = -1;
function updateHudSection() {
    const line = innerHeight * 0.55;
    let idx = 0;
    hudSections.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= line) idx = i; });
    if (idx === hudCurrent) return;
    hudCurrent = idx;
    hud.index.textContent = String(idx + 1).padStart(2, '0');
    hud.name.textContent = hudSections[idx].dataset.hud;
    gsap.fromTo(hud.name, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });
}
updateHudSection();

function setSource(key, state, detail = '') {
    SOURCES[key].state = state;
    SOURCES[key].detail = detail;
    renderSources();
}
function renderSources() {
    const cls = { live: 'is-live', stale: 'is-stale', down: 'is-down', pending: '' };
    $('#intel-sources').innerHTML = Object.values(SOURCES).map(s =>
        `<span class="intel-source"><b class="live-dot ${cls[s.state]}"></b>${esc(s.label)}${s.detail ? `<em>${esc(s.detail)}</em>` : ''}</span>`
    ).join('');

    const states = Object.values(SOURCES).map(s => s.state);
    const live = states.filter(s => s === 'live').length;
    const overall = states.includes('pending') && !live ? 'pending' : live ? 'live' : states.includes('stale') ? 'stale' : 'down';
    hud.dot.className = 'live-dot ' + cls[overall];
    hud.live.textContent = { pending: 'CONNECTING', live: `LIVE · ${live}/${states.length} FEEDS`, stale: 'CACHED', down: 'OFFLINE' }[overall];
    ['#ticker-dot', '#globe-dot'].forEach(s => { $(s).className = 'live-dot ' + cls[overall]; });
}
renderSources();

// ── ONI RECORD ─────────────────────────────────────────────────────────────
const SEASONS = ['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ'];
const ONI = window.ONI_SNAPSHOT || null;
const oniValues = ONI ? ONI.values : [];
const oniLabel  = i => `${SEASONS[i % 12]} ${ONI.startYear + Math.floor(i / 12)}`;

function phaseOf(v) {
    const a = Math.abs(v);
    if (a < 0.5) return ['Neutral', 'ENSO-neutral range'];
    const strength = a >= 2 ? 'Very strong' : a >= 1.5 ? 'Strong' : a >= 1 ? 'Moderate' : 'Weak';
    return [v > 0 ? 'El Niño' : 'La Niña', `${strength} · threshold ±0.5`];
}

const oniDisplay = $('#oni-display');
const oniStatus  = $('#oni-status');

let countTween;
function countTo(el, value, decimals = 1) {
    const o = { v: 0 };
    countTween?.kill();
    countTween = gsap.to(o, { v: value, duration: PREFERS_REDUCED ? 0 : 1.8, ease: 'power3.out', onUpdate: () => { el.textContent = signed(o.v, decimals); } });
}

function initOniPanel() {
    if (!oniValues.length) {
        oniStatus.textContent = 'ONI record unavailable (data/oni.js did not load).';
        return;
    }
    const last = oniValues[oniValues.length - 1];
    const [phase, sub] = phaseOf(last);
    $('#oni-official').textContent = signed(last, 2);
    $('#oni-season').textContent   = ONI.lastSeason;
    $('#oni-phase').textContent    = phase;
    $('#oni-phase-sub').textContent = sub;

    const rank = oniValues.filter(v => (last >= 0 ? v > last : v < last)).length + 1;
    $('#oni-rank').textContent = `#${rank}`;
    $('#oni-rank-sub').textContent = `${last >= 0 ? 'warmest' : 'coolest'} of ${oniValues.length} seasons`;
    $('#chart-title').textContent = `OCEANIC NIÑO INDEX · ${ONI.startYear} – ${ONI.lastSeason}`;

    hud.oni.textContent = `${signed(last, 2)} ${ONI.lastSeason.split(' ')[0]}`;
    hud.oni.className = last >= 0.5 ? 'is-hot' : last <= -0.5 ? 'is-cold' : '';

    // Until the live reading lands, the big number is the official index.
    showBigReading(last, `Official ONI · ${ONI.lastSeason} · NOAA CPC`, 2);
}

const big = { value: null, decimals: 2, entered: false };
function showBigReading(value, statusText, decimals) {
    oniDisplay.classList.toggle('is-cold', value < 0);
    oniDisplay.classList.add('pulsate');
    oniStatus.textContent = statusText;
    targetHeat = clamp((value + 1) / 3, 0.3, 1.3);
    big.value = value; big.decimals = decimals;
    if (big.entered) countTo(oniDisplay, value, decimals);
    else oniDisplay.textContent = signed(value, decimals);
}
ScrollTrigger.create({
    trigger: '.oni-panel', start: 'top 85%', once: true,
    onEnter: () => { big.entered = true; if (big.value != null) countTo(oniDisplay, big.value, big.decimals); }
});
initOniPanel();

// ── ONI CHART ──────────────────────────────────────────────────────────────
const chartCanvas  = $('#oni-chart');
const chartReadout = $('#chart-readout');
const chart = { progress: 0, hover: -1, peaks: [] };

// Label the peak of every strong (≥ 1.5) El Niño and La Niña (≤ −1.5) run.
(function findPeaks() {
    let i = 0;
    while (i < oniValues.length) {
        const sign = oniValues[i] >= 0.5 ? 1 : oniValues[i] <= -0.5 ? -1 : 0;
        if (!sign) { i++; continue; }
        let j = i, best = i;
        while (j < oniValues.length && oniValues[j] * sign >= 0.5) {
            if (oniValues[j] * sign > oniValues[best] * sign) best = j;
            j++;
        }
        if (Math.abs(oniValues[best]) >= 1.5) chart.peaks.push(best);
        i = j;
    }
})();

function drawONIChart() {
    if (!chartCanvas || !oniValues.length) return;
    const dpr = Math.min(devicePixelRatio, 2);
    const cw = chartCanvas.clientWidth, ch = chartCanvas.clientHeight;
    if (chartCanvas.width !== Math.round(cw * dpr)) { chartCanvas.width = Math.round(cw * dpr); chartCanvas.height = Math.round(ch * dpr); }
    const ctx = chartCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const pad = { t: 26, r: 14, b: 26, l: 34 };
    const W = cw - pad.l - pad.r, H = ch - pad.t - pad.b;
    const MAXV = 3;
    const n = oniValues.length;
    const X = i => pad.l + (i / (n - 1)) * W;
    const Y = v => pad.t + (1 - (v + MAXV) / (2 * MAXV)) * H;
    const zeroY = Y(0);
    chart.geom = { pad, W, n };

    ctx.font = `500 12px 'Barlow Condensed', sans-serif`;
    ctx.textBaseline = 'middle';

    // grid + threshold lines
    [-2, -1, 0, 1, 2].forEach(v => {
        ctx.strokeStyle = v === 0 ? 'rgba(243,245,247,0.22)' : 'rgba(243,245,247,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v) + 0.5); ctx.lineTo(pad.l + W, Y(v) + 0.5); ctx.stroke();
        ctx.fillStyle = 'rgba(243,245,247,0.35)'; ctx.textAlign = 'right';
        ctx.fillText((v > 0 ? '+' : '') + v, pad.l - 8, Y(v));
    });
    ctx.setLineDash([2, 4]);
    [[0.5, 'rgba(255,81,47,0.45)'], [-0.5, 'rgba(88,166,255,0.45)']].forEach(([v, c]) => {
        ctx.strokeStyle = c;
        ctx.beginPath(); ctx.moveTo(pad.l, Y(v) + 0.5); ctx.lineTo(pad.l + W, Y(v) + 0.5); ctx.stroke();
    });
    ctx.setLineDash([]);

    // decade ticks
    ctx.textAlign = 'center';
    for (let y = Math.ceil(ONI.startYear / 10) * 10; y <= ONI.startYear + n / 12; y += 10) {
        const x = X((y - ONI.startYear) * 12);
        ctx.fillStyle = 'rgba(243,245,247,0.3)';
        ctx.fillText(String(y), x, ch - 9);
        ctx.fillStyle = 'rgba(243,245,247,0.12)';
        ctx.fillRect(x, zeroY - 3, 1, 6);
    }

    // reveal clip
    const revealX = pad.l + W * chart.progress;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, revealX, ch); ctx.clip();

    const trace = () => {
        ctx.beginPath();
        ctx.moveTo(X(0), zeroY);
        for (let i = 0; i < n; i++) ctx.lineTo(X(i), Y(clamp(oniValues[i], -MAXV, MAXV)));
        ctx.lineTo(X(n - 1), zeroY);
        ctx.closePath();
    };
    const half = (top, colA, colB) => {
        ctx.save();
        ctx.beginPath(); ctx.rect(pad.l, top ? pad.t : zeroY, W, H / 2); ctx.clip();
        const g = ctx.createLinearGradient(0, top ? pad.t : pad.t + H, 0, zeroY);
        g.addColorStop(0, colA); g.addColorStop(1, colB);
        ctx.fillStyle = g;
        trace(); ctx.fill();
        ctx.restore();
    };
    half(true,  'rgba(255,214,140,0.98)', 'rgba(255,60,20,0.28)');
    half(false, 'rgba(120,200,255,0.95)', 'rgba(30,110,240,0.25)');

    // hairline on top
    ctx.strokeStyle = 'rgba(243,245,247,0.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = X(i), y = Y(clamp(oniValues[i], -MAXV, MAXV)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();

    // peak labels
    ctx.font = `500 11px 'Barlow Condensed', sans-serif`;
    chart.peaks.forEach(i => {
        const v = oniValues[i], up = v > 0;
        const x = X(i), y = Y(v);
        const yr = ONI.startYear + Math.floor(i / 12);
        ctx.fillStyle = up ? 'rgba(255,200,170,0.85)' : 'rgba(170,215,255,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(`’${String(yr).slice(2)}`, clamp(x, pad.l + 10, pad.l + W - 10), y + (up ? -9 : 10));
    });

    // "now" marker
    const lx = X(n - 1), ly = Y(oniValues[n - 1]);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // hover crosshair
    if (chart.hover >= 0 && X(chart.hover) <= revealX + 1) {
        const i = chart.hover, v = oniValues[i], x = X(i), y = Y(v);
        ctx.strokeStyle = 'rgba(243,245,247,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, pad.t + H); ctx.stroke();
        ctx.fillStyle = v >= 0 ? '#ff512f' : '#58a6ff';
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
}

function setChartReadout(i) {
    if (i < 0) { chartReadout.textContent = 'Hover the record'; return; }
    const v = oniValues[i];
    const cls = v >= 0.5 ? 'hot' : v <= -0.5 ? 'cold' : '';
    chartReadout.innerHTML = `${esc(oniLabel(i))} · <b class="${cls}">${signed(v, 2)}°C</b> · ${esc(phaseOf(v)[0])}`;
}

if (chartCanvas && oniValues.length) {
    ScrollTrigger.create({
        trigger: '.chart-panel', start: 'top 85%', end: 'center 45%', scrub: 0.6,
        onUpdate: self => { chart.progress = PREFERS_REDUCED ? 1 : self.progress; drawONIChart(); },
        onRefresh: self => { chart.progress = PREFERS_REDUCED ? 1 : self.progress; drawONIChart(); },
    });
    chartCanvas.addEventListener('pointermove', e => {
        const g = chart.geom; if (!g) return;
        const r = chartCanvas.getBoundingClientRect();
        const i = Math.round(clamp((e.clientX - r.left - g.pad.l) / g.W, 0, 1) * (g.n - 1));
        if (i !== chart.hover) { chart.hover = i; setChartReadout(i); drawONIChart(); }
    });
    chartCanvas.addEventListener('pointerleave', () => { chart.hover = -1; setChartReadout(-1); drawONIChart(); });
    window.addEventListener('resize', drawONIChart);
    document.fonts.ready.then(drawONIChart);
}

// ── DICHOTOMY SPLIT SCREEN ─────────────────────────────────────────────────
(function initSplit() {
    const box = $('.dichotomy-container'), slider = $('#split-slider'), la = $('#split-lanina');
    if (!box || !slider || !la) return;
    const state = { pct: 50 };

    const apply = () => {
        const p = state.pct;
        slider.style.left = p + '%';
        la.style.clipPath = `polygon(0 0, ${p}% 0, ${p}% 100%, 0 100%)`;
        slider.setAttribute('aria-valuenow', Math.round(p));
    };
    const fromEvent = e => {
        const r = box.getBoundingClientRect();
        state.pct = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
        apply();
    };

    slider.addEventListener('pointerdown', e => {
        gsap.killTweensOf(state);
        slider.setPointerCapture(e.pointerId);
        slider.classList.add('is-dragging');
        fromEvent(e);
    });
    slider.addEventListener('pointermove', e => { if (slider.hasPointerCapture(e.pointerId)) fromEvent(e); });
    const end = e => { slider.classList.remove('is-dragging'); if (slider.hasPointerCapture(e.pointerId)) slider.releasePointerCapture(e.pointerId); };
    slider.addEventListener('pointerup', end);
    slider.addEventListener('pointercancel', end);
    slider.addEventListener('keydown', e => {
        const step = e.key === 'ArrowLeft' ? -4 : e.key === 'ArrowRight' ? 4 : 0;
        if (!step) return;
        e.preventDefault();
        gsap.killTweensOf(state);
        state.pct = clamp(state.pct + step, 0, 100);
        apply();
    });

    // On arrival the divider sweeps once, so it is obvious the frame is draggable.
    if (!PREFERS_REDUCED) {
        ScrollTrigger.create({
            trigger: '#dichotomy', start: 'top 40%', once: true,
            onEnter: () => gsap.timeline({ onUpdate: apply })
                .to(state, { pct: 68, duration: 1.1, ease: 'power3.inOut' })
                .to(state, { pct: 34, duration: 1.4, ease: 'power3.inOut' })
                .to(state, { pct: 50, duration: 1.0, ease: 'power3.inOut' })
        });
    }
    gsap.fromTo('.split-title', { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out', stagger: 0.15, scrollTrigger: { trigger: '#dichotomy', start: 'top 55%' } });
    gsap.fromTo('.split-bg', { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '#dichotomy', start: 'top bottom', end: 'bottom top', scrub: true } });
})();

// ── ANATOMY SCROLL NARRATIVE ───────────────────────────────────────────────
(function initAnatomy() {
    const steps = $$('.anatomy-step'), bgs = $$('.anatomy-bg'), count = $('#anatomy-count');
    if (!steps.length || !bgs.length) return;
    let current = -1;
    function activate(i) {
        if (i === current) return;
        bgs.forEach(b => b.classList.remove('was-active'));
        if (current >= 0) { bgs[current].classList.remove('active'); bgs[current].classList.add('was-active'); }
        bgs[i].classList.add('active');
        steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
        count.textContent = String(i + 1).padStart(2, '0');
        current = i;
    }
    activate(0);
    steps.forEach((step, i) => ScrollTrigger.create({
        trigger: step, start: 'top 55%', end: 'bottom 55%',
        onEnter: () => activate(i), onEnterBack: () => activate(i)
    }));
})();

// ── HORIZONTAL PINNED TRACKS (impacts + videos) ────────────────────────────
function pinHorizontal(pinSel, track, parallaxSel, cardSel, revealSel) {
    if (IS_MOBILE || !track) return;
    const pinContainer = $(pinSel);
    const sticky = pinContainer?.firstElementChild;
    if (!sticky) return;
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);

    const tween = gsap.to(track, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: { trigger: pinContainer, pin: sticky, scrub: 1, start: 'top top', end: () => '+=' + dist(), invalidateOnRefresh: true }
    });
    $$(parallaxSel, track).forEach(el => gsap.fromTo(el, { xPercent: -10 }, {
        xPercent: 10, ease: 'none',
        scrollTrigger: { trigger: el.closest(cardSel), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true }
    }));
    if (revealSel) $$(revealSel, track).forEach(el => gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, ease: 'power2.out',
        scrollTrigger: { trigger: el.closest(cardSel), containerAnimation: tween, start: 'left 85%', end: 'left 45%', scrub: true }
    }));
}
pinHorizontal('.impacts-pin-container', $('#impacts-track'), '.impact-card-bg', '.impact-card', '.impact-card-content');

// ── STATISTICS ─────────────────────────────────────────────────────────────
$$('.stat').forEach((stat, i) => {
    const el = $('.stat-value', stat);
    const target = parseFloat(el.dataset.countTo), decimals = parseInt(el.dataset.decimals) || 0;
    const o = { v: 0, line: 0 };
    gsap.to(o, {
        v: target, line: 1, duration: 2.2, delay: i * 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '#stats', start: 'top 65%' },
        onUpdate: () => { el.textContent = o.v.toFixed(decimals); stat.style.setProperty('--stat-line', o.line); }
    });
});

// ── CONCLUSION ─────────────────────────────────────────────────────────────
gsap.to(conclusionWords, {
    opacity: 1, y: 0, ease: 'power2.out', stagger: 0.12,
    scrollTrigger: { trigger: '#conclusion', start: 'top 60%', end: 'center 55%', scrub: 1 }
});

// ── SECTION HEADER REVEALS ─────────────────────────────────────────────────
[['.intel-header', '#intel'], ['.intel-status', '#intel'], ['.intel-tabs', '#intel'], ['.video-header', '#videos'], ['.impacts-header', '#impacts'],
 ['.globe-header', '#globe-viz'], ['.globe-detail', '#globe-viz'], ['.globe-legend', '#globe-viz'], ['.oni-panel', '#data'], ['.chart-panel', '#data'], ['.ticker-strip', '.ticker-strip']]
    .forEach(([sel, trig], i) => gsap.fromTo(sel, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 1, delay: (i % 3) * 0.1, ease: 'power3.out', clearProps: 'transform',
        scrollTrigger: { trigger: trig, start: 'top 85%' }
    }));

// ══════════════════════════════════════════════════════════════════════════
//  LIVE DATA
// ══════════════════════════════════════════════════════════════════════════
const live = { sst: null, incidents: [], news: [], analysis: [] };

// ── 1. SEA-SURFACE TEMPERATURE ANOMALY GRID (NOAA Coral Reef Watch) ────────
const SST_STRIDE = 50;   // 0.05° grid × 50 → one cell every 2.5°
async function loadSST(force) {
    const url = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.json?CRW_SSTANOMALY'
        + encodeURIComponent(`[(last)][(89.975):${SST_STRIDE}:(-89.975)][(-179.975):${SST_STRIDE}:(179.975)]`);
    try {
        const r = await withCache('sst', 6 * HOUR, async () => {
            const rows = (await getJSON(url, 30000)).table.rows;
            if (!rows?.length) throw new Error('empty grid');
            const lat0 = rows[0][1], lon0 = rows[0][2];
            let nLon = 1;
            while (nLon < rows.length && rows[nLon][1] === lat0) nLon++;
            const nLat = rows.length / nLon;
            if (!Number.isInteger(nLat)) throw new Error('ragged grid');
            return {
                time: rows[0][0], nLat, nLon, lat0, lon0,
                dLat: (rows[rows.length - 1][1] - lat0) / (nLat - 1),
                dLon: (rows[nLon - 1][2] - lon0) / (nLon - 1),
                v: rows.map(x => x[3] == null ? null : Math.round(x[3] * 10))      // tenths of a °C
            };
        }, force);
        live.sst = r.data;
        const age = (Date.now() - new Date(r.data.time).getTime()) / HOUR;
        setSource('sst', r.state === 'live' && age < 96 ? 'live' : 'stale', fmtDate(r.data.time));
        onSST();
    } catch (err) {
        console.warn('SST anomaly grid unavailable:', err);
        setSource('sst', 'down');
        $('#globe-stamp').textContent = 'Sea-surface anomaly feed unreachable — showing incidents only.';
        $('#hero-live').textContent = oniValues.length ? `ONI ${signed(oniValues.at(-1), 2)} · ${ONI.lastSeason}` : '';
    }
}

// Mean anomaly over a lat/lon box, cosine-weighted.
function boxMean(g, latMin, latMax, lonMin, lonMax) {
    let sum = 0, w = 0;
    for (let i = 0; i < g.nLat; i++) {
        const lat = g.lat0 + i * g.dLat;
        if (lat < latMin || lat > latMax) continue;
        const cw = Math.cos(lat * Math.PI / 180);
        for (let j = 0; j < g.nLon; j++) {
            const lon = g.lon0 + j * g.dLon;
            if (lon < lonMin || lon > lonMax) continue;
            const v = g.v[i * g.nLon + j];
            if (v == null) continue;
            sum += v / 10 * cw; w += cw;
        }
    }
    return w ? sum / w : null;
}

function onSST() {
    const g = live.sst;
    const nino34 = boxMean(g, -5, 5, -170, -120);
    const day = fmtDate(g.time);
    if (nino34 != null) {
        live.nino34 = nino34;
        showBigReading(nino34, `Measured ${day} · NOAA Coral Reef Watch · 5°N–5°S, 170°W–120°W`, 2);
        hud.nino.textContent = `${signed(nino34, 2)}°C`;
        hud.nino.className = nino34 >= 0.5 ? 'is-hot' : nino34 <= -0.5 ? 'is-cold' : '';
        $('#hero-live').textContent = `Niño 3.4 · ${signed(nino34, 2)}°C today`;
        const sstTag = $('[data-live-sst]');
        if (sstTag) sstTag.textContent = `Live · Niño 3.4 running ${signed(nino34, 1)}°C ${nino34 >= 0 ? 'above' : 'below'} normal`;
    }
    $('#globe-stamp').textContent = `Sea-surface temperature anomaly · ${day} · NOAA Coral Reef Watch 5 km`;
    globe.paintSST();
    buildTicker();
}

// ── 2. INCIDENTS: NASA EONET + GDACS ───────────────────────────────────────
async function loadEONET(force) {
    const r = await withCache('eonet', 10 * MIN, async () => {
        const d = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=45&limit=200');
        return (d.events || []).map(ev => {
            const g = ev.geometry?.[ev.geometry.length - 1];
            let c = g?.coordinates;
            while (Array.isArray(c?.[0])) c = c[0];
            if (!c || !isFinite(c[0]) || !isFinite(c[1])) return null;
            const cat = ev.categories?.[0]?.id;
            return {
                id: ev.id, src: 'NASA EONET', cat: CATS[cat] ? cat : 'other',
                title: ev.title, lat: c[1], lng: c[0], date: g.date,
                url: safeUrl(ev.sources?.[0]?.url) || safeUrl(ev.link),
                mag: g.magnitudeValue ? `${Math.round(g.magnitudeValue).toLocaleString('en-US')} ${g.magnitudeUnit || ''}`.trim() : ''
            };
        }).filter(Boolean);
    }, force);
    setSource('eonet', r.state, r.state === 'stale' ? relTime(r.ts) : `${r.data.length} open`);
    return r.data;
}

async function loadGDACS(force) {
    const r = await withCache('gdacs', 10 * MIN, async () => {
        const d = await getJSON('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC,FL,DR,WF,VO&alertlevel=orange;red&pagesize=60');
        const cutoff = Date.now() - 45 * 24 * HOUR;
        return (d.features || []).map(f => {
            const p = f.properties, c = f.geometry?.coordinates;
            if (!p || !c || !isFinite(c[0]) || !isFinite(c[1])) return null;
            const current = p.iscurrent === 'true' || new Date(p.todate).getTime() > cutoff;
            if (!current) return null;
            return {
                id: `GDACS_${p.eventtype}_${p.eventid}`, src: 'GDACS', cat: GDACS_CAT[p.eventtype] || 'other',
                title: (p.name || p.eventname || 'Alert').replace(/\s*,\s*(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim(),
                lat: c[1], lng: c[0], date: p.todate || p.fromdate,
                url: safeUrl(p.url?.report), level: String(p.alertlevel || '').toLowerCase(),
                mag: p.fromdate ? `since ${fmtDate(p.fromdate)}` : ''
            };
        }).filter(Boolean);
    }, force);
    setSource('gdacs', r.state, r.state === 'stale' ? relTime(r.ts) : `${r.data.length} alerts`);
    return r.data;
}

async function loadIncidents(force) {
    const [a, b] = await Promise.allSettled([loadEONET(force), loadGDACS(force)]);
    if (a.status === 'rejected') { console.warn('EONET unavailable:', a.reason); setSource('eonet', 'down'); }
    if (b.status === 'rejected') { console.warn('GDACS unavailable:', b.reason); setSource('gdacs', 'down'); }
    const seen = new Set();
    live.incidents = [...(b.value || []), ...(a.value || [])]
        .filter(x => !seen.has(x.id) && seen.add(x.id))
        .sort((x, y) => new Date(y.date) - new Date(x.date));
    live.incidentsFailed = a.status === 'rejected' && b.status === 'rejected';

    hud.events.textContent = live.incidentsFailed ? '—' : String(live.incidents.length);
    renderIncidents();
    renderImpactTags();
    globe.setIncidents(live.incidents);
    buildTicker();
}

function countByCat(list) {
    const c = {};
    list.forEach(x => { c[x.cat] = (c[x.cat] || 0) + 1; });
    return c;
}

function renderImpactTags() {
    const c = countByCat(live.incidents);
    $$('[data-live-cat]').forEach(el => {
        const parts = el.dataset.liveCat.split(',').filter(k => c[k]).map(k => `${c[k]} ${CATS[k].label.toLowerCase()}`);
        el.textContent = parts.length ? `Live · ${parts.join(' · ')} open right now` : '';
    });
}

// ── 3. NEWS: GDELT (keyless), NewsData as a second line ────────────────────
function cleanTitle(t) {
    return String(t || '').replace(/\s+([?!.,:;’'])/g, '$1').replace(/\s+/g, ' ').trim();
}
async function fetchGDELT() {
    const q = encodeURIComponent('"el nino" sourcelang:english');
    const d = await getJSON(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=60&format=json&sort=datedesc&timespan=7d`, 20000);
    return (d.articles || []).map(a => ({
        title: cleanTitle(a.title), url: safeUrl(a.url), img: safeUrl(a.socialimage),
        source: a.domain || '', country: a.sourcecountry || '',
        date: a.seendate ? a.seendate.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z') : ''
    }));
}
async function fetchNewsData() {
    const apiKey = 'pub_c35111086828452c891556c392a0bed2';
    const d = await getJSON(`https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodeURIComponent('el nino OR "el niño" climate')}&language=en`);
    if (d.status !== 'success') throw new Error('NewsData failure');
    return (d.results || []).map(a => ({
        title: cleanTitle(a.title), url: safeUrl(a.link), img: safeUrl(a.image_url),
        source: a.source_id || '', country: (a.country || [])[0] || '', date: a.pubDate ? a.pubDate.replace(' ', 'T') + 'Z' : ''
    }));
}
function curateNews(list) {
    const seenTitle = new Set(), perDomain = {};
    return list.filter(a => {
        if (!a.url || a.title.length < 15) return false;
        const k = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 60);
        if (seenTitle.has(k)) return false;
        perDomain[a.source] = (perDomain[a.source] || 0) + 1;
        if (perDomain[a.source] > 2) return false;
        seenTitle.add(k);
        return true;
    }).slice(0, 13);
}
async function loadNews(force) {
    const grid = $('#news-grid');
    try {
        const r = await withCache('news', 10 * MIN, async () => {
            let list = [], provider = 'GDELT';
            try { list = curateNews(await fetchGDELT()); } catch (err) { console.warn('GDELT unavailable, trying NewsData:', err); }
            if (list.length < 4) { list = curateNews(await fetchNewsData()); provider = 'NewsData'; }
            if (!list.length) throw new Error('no articles');
            return { list, provider };
        }, force);
        live.news = r.data.list;
        SOURCES.news.label = r.data.provider;
        setSource('news', r.state, r.state === 'stale' ? relTime(r.ts) : `${live.news.length} stories`);
        renderNews();
    } catch (err) {
        console.warn('News unavailable:', err);
        live.news = [];
        setSource('news', 'down');
        grid.innerHTML = emptyState('The news wire did not answer.', 'GDELT rate-limits to one request every five seconds — try the refresh button in a moment.');
    }
    $('#count-news').textContent = live.news.length || '';
    buildTicker();
    scheduleRefresh();
}

function renderNews() {
    const grid = $('#news-grid');
    const lead = live.news.findIndex(a => a.img);
    grid.innerHTML = live.news.map((a, i) => `
        <a class="news-card${i === lead ? ' is-lead' : ''}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">
            <div class="news-img${a.img ? '' : ' no-img'}" data-initial="${esc((a.source[0] || '·').toUpperCase())}">
                ${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            </div>
            <div class="news-body">
                <span class="news-source">${esc(a.source)}${a.country ? ` · ${esc(a.country)}` : ''}</span>
                <h4 class="news-title">${esc(a.title)}</h4>
                <span class="news-date">${a.date ? esc(relTime(a.date)) + ' · ' + esc(fmtDate(a.date)) : ''}</span>
            </div>
        </a>`).join('');
    if (lead > 0) grid.prepend(grid.children[lead]);
    animateFeedIn(grid);
}
// Hot-linked thumbnails fail often (hotlink protection); fall back to the monogram tile.
$('#news-grid').addEventListener('error', e => {
    if (e.target.tagName !== 'IMG') return;
    e.target.parentElement.classList.add('no-img');
    e.target.closest('.news-card')?.classList.remove('is-lead');
    e.target.remove();
}, true);

// ── 4. ANALYSIS: climate publications' own WordPress APIs ──────────────────
async function loadAnalysis(force) {
    const grid = $('#analysis-grid');
    try {
        const r = await withCache('blogs', HOUR, async () => {
            const results = await Promise.allSettled(BLOGS.map(async b => {
                const posts = await getJSON(`${b.base}/wp-json/wp/v2/posts?search=${encodeURIComponent('el niño')}&per_page=8&_fields=title,link,date,excerpt`, 15000);
                return posts.map(p => ({
                    source: b.name, title: plainText(p.title?.rendered), url: safeUrl(p.link),
                    date: p.date ? p.date + 'Z' : '', excerpt: plainText(p.excerpt?.rendered).replace(/\s*\[…\]|\s*\[&hellip;\]/g, '…')
                }));
            }));
            const ok = results.filter(x => x.status === 'fulfilled');
            if (!ok.length) throw new Error('no blog answered');
            const all = ok.flatMap(x => x.value).filter(p => p.url && p.title);
            const onTopic = all.filter(p => /el\s+ni[nñ]o|la\s+ni[nñ]a|\benso\b/i.test(p.title + ' ' + p.excerpt));
            const list = (onTopic.length >= 3 ? onTopic : all).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 9);
            if (!list.length) throw new Error('no posts');
            return { list, answered: ok.length };
        }, force);
        live.analysis = r.data.list;
        setSource('blogs', r.state, r.state === 'stale' ? relTime(r.ts) : `${r.data.answered}/${BLOGS.length} sites`);
        grid.innerHTML = live.analysis.map(p => `
            <a class="report-card" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
                <span class="report-source">${esc(p.source)}</span>
                <h4 class="report-title">${esc(p.title)}</h4>
                <p class="report-excerpt">${esc(p.excerpt)}</p>
                <span class="report-date">${esc(fmtDate(p.date))}</span>
                <span class="report-link">Read the analysis →</span>
            </a>`).join('');
        animateFeedIn(grid);
    } catch (err) {
        console.warn('Analysis unavailable:', err);
        live.analysis = [];
        setSource('blogs', 'down');
        grid.innerHTML = emptyState('None of the climate desks answered.', 'Their sites are reachable directly — this panel will repopulate on the next refresh.');
    }
    $('#count-analysis').textContent = live.analysis.length || '';
    scheduleRefresh();
}

// ── INCIDENT LIST UI ───────────────────────────────────────────────────────
const incidentUI = { filter: 'all', expanded: false };

function renderIncidents() {
    const list = $('#events-list'), filters = $('#incident-filters');
    $('#count-incidents').textContent = live.incidents.length || '';
    if (!live.incidents.length) {
        filters.innerHTML = '';
        list.innerHTML = live.incidentsFailed
            ? emptyState('Neither NASA EONET nor GDACS answered.', 'No incident data is being shown rather than showing stale or invented events.')
            : emptyState('No open incidents reported.', '');
        scheduleRefresh();
        return;
    }
    const counts = countByCat(live.incidents);
    const chip = (key, label, n, color) =>
        `<button class="chip" type="button" data-filter="${key}" aria-pressed="${incidentUI.filter === key}" style="--chip-clr:${color}">${esc(label)} <b>${n}</b></button>`;
    filters.innerHTML = chip('all', 'All', live.incidents.length, '#f3f5f7')
        + Object.keys(CATS).filter(k => counts[k]).map(k => chip(k, CATS[k].label, counts[k], CATS[k].color)).join('');

    const rows = live.incidents.filter(x => incidentUI.filter === 'all' || x.cat === incidentUI.filter);
    const shown = incidentUI.expanded ? rows : rows.slice(0, 12);
    list.innerHTML = shown.map(x => `
        <button class="event-row" type="button" data-id="${esc(x.id)}" style="--row-clr:${CATS[x.cat].color}">
            <span class="event-cat"><span class="event-dot"></span><span class="event-cat-name">${esc(CATS[x.cat].label)}</span></span>
            <span class="event-title">${esc(x.title)}<small>${esc(x.src)}${x.mag ? ' · ' + esc(x.mag) : ''} · locate on globe ↗</small></span>
            ${x.level ? `<span class="event-badge lvl-${esc(x.level)}">${esc(x.level)} alert</span>` : '<span></span>'}
            <span class="event-date">${esc(fmtDate(x.date))}</span>
        </button>`).join('')
        + (rows.length > shown.length ? `<button class="chip events-more" type="button" data-more>Show all ${rows.length}</button>` : '');
    scheduleRefresh();
}
$('#incident-filters').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    incidentUI.filter = b.dataset.filter; incidentUI.expanded = false;
    renderIncidents();
    animateFeedIn($('#events-list'));
});
$('#events-list').addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { incidentUI.expanded = true; renderIncidents(); return; }
    const row = e.target.closest('.event-row'); if (!row) return;
    const item = live.incidents.find(x => x.id === row.dataset.id);
    if (!item) return;
    lenis.scrollTo('#globe-viz', { duration: 1.6 });
    setTimeout(() => globe.select(item, true), 900);
});

function emptyState(title, detail) {
    return `<div class="feed-empty"><p><b>${esc(title)}</b>${detail ? '<br>' + esc(detail) : ''}</p></div>`;
}

// ── TICKER — real headlines, real readings ─────────────────────────────────
function buildTicker() {
    const items = [];
    if (live.nino34 != null) items.push({ tag: 'NOAA', text: `Niño 3.4 sea surface is ${signed(live.nino34, 2)}°C against normal today` });
    if (oniValues.length) items.push({ tag: 'ONI', text: `${ONI.lastSeason} index at ${signed(oniValues.at(-1), 2)} — ${phaseOf(oniValues.at(-1))[0]}` });
    live.incidents.filter(x => x.level).slice(0, 5).forEach(x => items.push({ tag: `${x.level} alert`, text: x.title, url: x.url }));
    live.news.slice(0, 12).forEach(a => items.push({ tag: a.source, text: a.title, url: a.url }));
    if (!items.length) return;

    const html = items.map(i => i.url
        ? `<a class="ticker-item" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer"><small>${esc(i.tag)}</small>${esc(i.text)}</a>`
        : `<span class="ticker-item"><small>${esc(i.tag)}</small>${esc(i.text)}</span>`).join('');
    const ticker = $('#ticker');
    ticker.innerHTML = html + html;           // doubled for a seamless loop
    requestAnimationFrame(() => ticker.style.setProperty('--ticker-dur', `${Math.max(30, ticker.scrollWidth / 2 / 70)}s`));
}

// ── SKELETONS + FEED ENTRANCE ──────────────────────────────────────────────
function showSkeletons() {
    $('#news-grid').innerHTML = Array.from({ length: 6 }, () => `
        <div class="news-card skeleton-card"><div class="skeleton skeleton-img"></div>
        <div class="news-body"><div class="skeleton skeleton-text" style="width:40%"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div></div>`).join('');
    $('#analysis-grid').innerHTML = Array.from({ length: 6 }, () => `
        <div class="report-card skeleton-card"><div class="skeleton skeleton-text" style="width:50%"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>`).join('');
    $('#events-list').innerHTML = Array.from({ length: 8 }, () => `
        <div class="event-row skeleton-card"><div class="skeleton skeleton-text" style="width:90px"></div><div class="skeleton skeleton-title"></div><span></span><div class="skeleton skeleton-text" style="width:70px"></div></div>`).join('');
}
function animateFeedIn(container) {
    if (PREFERS_REDUCED) return;
    gsap.fromTo(container.children, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: 'power2.out', clearProps: 'transform,opacity' });
}

// ── INTEL TABS + REFRESH ───────────────────────────────────────────────────
$$('.intel-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.intel-tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab); });
    $$('.intel-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab.dataset.tab));
    animateFeedIn($('#panel-' + tab.dataset.tab).lastElementChild);
    scheduleRefresh();
}));

let lastSync = 0, syncing = false;
async function refreshAll(force = false) {
    if (syncing) return;
    syncing = true;
    const btn = $('#intel-refresh');
    btn.classList.add('is-busy');
    $('#intel-updated').textContent = 'Syncing…';
    await Promise.allSettled([loadSST(force), loadIncidents(force), loadNews(force), loadAnalysis(force)]);
    lastSync = Date.now();
    syncing = false;
    btn.classList.remove('is-busy');
    updateSyncLabel();
}
function updateSyncLabel() {
    if (lastSync && !syncing) $('#intel-updated').textContent = `Updated ${relTime(lastSync)} · refresh`;
}
$('#intel-refresh').addEventListener('click', () => refreshAll(true));
setInterval(updateSyncLabel, 30 * 1000);
setInterval(() => { if (document.visibilityState === 'visible') refreshAll(false); }, 10 * MIN);

// ══════════════════════════════════════════════════════════════════════════
//  LIVE 3D GLOBE
// ══════════════════════════════════════════════════════════════════════════
const globe = (() => {
    const container = $('#globe-container');
    const IMG = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.0/example/img/';
    const hidden = new Set();          // categories toggled off
    let world = null, incidents = [], sstOn = true, baseImg = null, sstTexture = null, resumeTimer;

    const visible = () => incidents.filter(x => !hidden.has(x.cat));

    function init() {
        if (world || !window.Globe || !container) return;
        try {
            world = new window.Globe(container, { animateIn: !PREFERS_REDUCED })
                .backgroundColor('rgba(0,0,0,0)')
                .globeImageUrl(IMG + 'earth-night.jpg')
                .bumpImageUrl(IMG + 'earth-topology.png')
                .showAtmosphere(true).atmosphereColor('#ff5a2a').atmosphereAltitude(0.2)
                .width(container.clientWidth).height(container.clientHeight)
                // incidents
                .pointLat('lat').pointLng('lng')
                .pointColor(d => CATS[d.cat].color)
                .pointAltitude(d => d.level === 'red' ? 0.07 : d.level ? 0.045 : 0.012)
                .pointRadius(d => d.level ? 0.55 : 0.32)
                .pointsMerge(false)
                .pointLabel(d => `<div class="globe-tip"><b style="color:${CATS[d.cat].color}">${esc(CATS[d.cat].label)} · ${esc(d.src)}</b>${esc(d.title)}</div>`)
                .onPointClick(d => select(d, false))
                .ringLat('lat').ringLng('lng')
                .ringColor(d => t => hexA(CATS[d.cat].color, Math.max(0, 1 - t)))
                .ringMaxRadius(d => d.level ? 5.5 : 2.4)
                .ringPropagationSpeed(d => d.level ? 1.6 : 1.1)
                .ringRepeatPeriod(d => 900 + (d.lat * 37 % 900 + 900) % 900)
                // Niño 3.4 box
                .pathsData([nino34Path()])
                .pathColor(() => ['rgba(255,255,255,0.9)', 'rgba(255,200,150,0.5)'])
                .pathStroke(1.2).pathDashLength(0.04).pathDashGap(0.02).pathDashAnimateTime(PREFERS_REDUCED ? 0 : 60000)
                .pathPointAlt(0.012).pathTransitionDuration(0)
                .labelsData([{ lat: 8.5, lng: -145, text: '3.4 REGION' }])
                .labelText('text').labelSize(1.15).labelDotRadius(0).labelAltitude(0.014)
                .labelColor(() => 'rgba(255,255,255,0.8)').labelResolution(2);
        } catch (err) {
            console.warn('Globe failed to start:', err);
            world = null;
            container.innerHTML = emptyState('The 3D globe could not start on this device.', 'WebGL may be disabled. The incident list below has the same data.');
            return;
        }

        const m = world.globeMaterial();
        m.bumpScale = 6;
        m.shininess = 9;
        m.specular?.set?.('#40170c');
        m.emissive?.set?.('#1c0602');
        m.emissiveIntensity = 0.5;

        const c = world.controls();
        c.autoRotate = !PREFERS_REDUCED;
        c.autoRotateSpeed = 0.32;
        c.enableZoom = false;                 // keep the wheel for page scrolling
        c.addEventListener('start', holdRotation);
        world.pointOfView({ lat: 4, lng: -150, altitude: IS_MOBILE ? 2.6 : 2.05 }, 0);

        window.addEventListener('resize', () => world.width(container.clientWidth).height(container.clientHeight));
        apply();
        paintSST();
    }

    function nino34Path() {
        const pts = [];
        for (let lng = -170; lng <= -120; lng += 2) pts.push([5, lng]);
        for (let lat = 5; lat >= -5; lat -= 2) pts.push([lat, -120]);
        for (let lng = -120; lng >= -170; lng -= 2) pts.push([-5, lng]);
        for (let lat = -5; lat <= 5; lat += 2) pts.push([lat, -170]);
        return pts;
    }

    function holdRotation() {
        if (!world || PREFERS_REDUCED) return;
        world.controls().autoRotate = false;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => { if (world) world.controls().autoRotate = true; }, 9000);
    }

    function apply() {
        renderLayerChips();
        if (!world) return;
        const v = visible();
        world.pointsData(v);
        // Rings are the expensive layer: every alert gets one, plus the newest plain events.
        world.ringsData([...v.filter(x => x.level), ...v.filter(x => !x.level).slice(0, IS_MOBILE ? 12 : 40)]);
    }

    function renderLayerChips() {
        const counts = countByCat(incidents);
        const el = $('#globe-layers');
        el.innerHTML =
            `<button class="chip" type="button" data-layer="sst" aria-pressed="${sstOn}" style="--chip-clr:#ff512f">Sea temp</button>` +
            Object.keys(CATS).filter(k => counts[k]).map(k =>
                `<button class="chip" type="button" data-layer="${k}" aria-pressed="${!hidden.has(k)}" style="--chip-clr:${CATS[k].color}">${esc(CATS[k].label)} <b>${counts[k]}</b></button>`).join('');
    }
    $('#globe-layers').addEventListener('click', e => {
        const b = e.target.closest('[data-layer]'); if (!b) return;
        const k = b.dataset.layer;
        if (k === 'sst') { sstOn = !sstOn; applyTexture(); renderLayerChips(); return; }
        hidden.has(k) ? hidden.delete(k) : hidden.add(k);
        apply();
    });

    // Paint the measured anomaly grid onto the earth texture.
    function paintSST() {
        const g = live.sst;
        if (!world || !g) return;
        // one spare column on each side, copied from the opposite edge, so the date line has no seam
        const PW = g.nLon + 2;
        const heat = document.createElement('canvas');
        heat.width = PW; heat.height = g.nLat;
        const hctx = heat.getContext('2d');
        const img = hctx.createImageData(PW, g.nLat);
        const flip = g.dLat > 0;                  // row 0 must be the north edge
        for (let i = 0; i < g.nLat; i++) {
            const row = flip ? g.nLat - 1 - i : i;
            for (let pj = 0; pj < PW; pj++) {
                const j = (pj - 1 + g.nLon) % g.nLon;
                const raw = g.v[row * g.nLon + j];
                if (raw == null) continue;
                const a = raw / 10, t = clamp(Math.abs(a) / 3, 0, 1), o = (i * PW + pj) * 4;
                if (a >= 0) { img.data[o] = 120 + 135 * t; img.data[o + 1] = 12 + 170 * t * t; img.data[o + 2] = 4 + 90 * t * t * t; }
                else        { img.data[o] = 8 + 40 * t;    img.data[o + 1] = 60 + 120 * t;     img.data[o + 2] = 150 + 105 * t; }
                img.data[o + 3] = 235 * clamp((Math.abs(a) - 0.45) / 2.4, 0, 1);
            }
        }
        hctx.putImageData(img, 0, 0);

        const compose = () => {
            const W = IS_MOBILE ? 1024 : 2048, H = W / 2;
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            ctx.drawImage(baseImg, 0, 0, W, H);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.9;
            ctx.filter = `blur(${W / 512}px)`;
            // source x of longitude −180: padded column 1 starts half a cell west of lon0
            const sx = 1 + (-180 - (g.lon0 - Math.abs(g.dLon) / 2)) / Math.abs(g.dLon);
            ctx.drawImage(heat, sx, 0, 360 / Math.abs(g.dLon), g.nLat, 0, 0, W, H);
            ctx.filter = 'none';
            try { sstTexture = c.toDataURL('image/jpeg', 0.9); applyTexture(); }
            catch (err) { console.warn('Could not composite SST texture:', err); }
        };
        if (baseImg) return compose();
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => { baseImg = im; compose(); };
        im.onerror = () => console.warn('Base earth texture unavailable for compositing.');
        im.src = IMG + 'earth-night.jpg';
    }
    function applyTexture() {
        if (!world) return;
        world.globeImageUrl(sstOn && sstTexture ? sstTexture : IMG + 'earth-night.jpg');
    }

    function select(d, fly) {
        const color = CATS[d.cat].color;
        const box = $('#globe-detail');
        box.style.setProperty('--gd-clr', color);
        $('#gd-cat').textContent = `${CATS[d.cat].label} · ${d.src}${d.level ? ` · ${d.level} alert` : ''}`;
        $('#gd-title').textContent = d.title;
        const ns = d.lat >= 0 ? 'N' : 'S', ew = d.lng >= 0 ? 'E' : 'W';
        $('#gd-meta').textContent = [`${Math.abs(d.lat).toFixed(2)}°${ns} ${Math.abs(d.lng).toFixed(2)}°${ew}`, d.mag, `updated ${fmtDate(d.date)}`].filter(Boolean).join(' · ');
        const link = $('#gd-link');
        link.hidden = !d.url;
        if (d.url) link.href = d.url;
        gsap.fromTo(box, { y: 14, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' });

        if (!world) return;
        if (hidden.has(d.cat)) { hidden.delete(d.cat); apply(); }
        holdRotation();
        world.pointOfView({ lat: d.lat, lng: d.lng, altitude: fly ? 1.5 : world.pointOfView().altitude }, 1400);
    }

    // Build the globe only when it is about to be seen; pause it when it is not.
    if (container) {
        new IntersectionObserver(entries => {
            const near = entries[0].isIntersecting;
            if (near && !world) init();
            if (world) near ? world.resumeAnimation() : world.pauseAnimation();
        }, { rootMargin: '60% 0px' }).observe(container);
        if (!window.Globe) container.innerHTML = emptyState('The 3D globe library could not be loaded.', 'The incident list below has the same data.');
    }

    return {
        setIncidents(list) { incidents = list; apply(); },
        paintSST, select,
    };
})();

// ── VIDEOS ─────────────────────────────────────────────────────────────────
const modal = $('#video-modal'), iframe = $('#modal-iframe');

function openVideoModal(videoId) {
    if (!/^[\w-]{6,20}$/.test(videoId)) return;
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    lenis.stop();
}
function closeVideoModal() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    iframe.src = '';
    lenis.start();
}
$('#video-modal-close').addEventListener('click', closeVideoModal);
$('#video-modal-bg').addEventListener('click', closeVideoModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('active')) closeVideoModal(); });

function renderVideoCards(videos) {
    const track = $('#video-carousel-track');
    track.innerHTML = videos.map((v, i) => `
        <div class="video-card" data-video-id="${esc(v.id)}" role="button" tabindex="0" aria-label="Play: ${esc(v.title)}">
            <div class="video-card-image-wrap"><div class="video-card-image" style="background-image:url('${esc(safeUrl(v.thumb))}')"></div></div>
            <div class="video-card-overlay"></div>
            <div class="video-card-num">${String(i + 1).padStart(2, '0')}</div>
            <div class="video-card-content">
                <span class="video-card-source">${esc(v.source)}</span>
                <h3 class="video-card-title">${esc(plainText(v.title))}</h3>
            </div>
        </div>`).join('');
    setTimeout(() => {
        pinHorizontal('.video-pin-container', track, '.video-card-image', '.video-card');
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
    }, 150);
}
$('#video-carousel-track').addEventListener('click', e => {
    const card = e.target.closest('.video-card');
    if (card) openVideoModal(card.dataset.videoId);
});
$('#video-carousel-track').addEventListener('keydown', e => {
    const card = e.target.closest('.video-card');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openVideoModal(card.dataset.videoId); }
});

async function loadVideos() {
    const apiKey = 'AIzaSyCjsxcyfvTBboUQkPJj_213Bja0J1LH1J0';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('El Nino climate documentary')}&type=video&maxResults=6&key=${apiKey}`;
    const fallback = [
        { id: 'w5n_G7b9C2E', title: 'El Niño: The Pacific Heat Engine Explained', source: 'NOAA Climate.gov' },
        { id: 'uYoS8S6ZfYo', title: 'How El Niño is Changing Global Weather Patterns', source: 'DW Documentary' },
        { id: 'tyPz10c4K4E', title: 'NASA Visualization: The Ocean Under Stress', source: 'NASA Earth Observatory' },
        { id: 'gB2k0L10B-0', title: 'The Human and Economic Cost of Global Warming', source: 'Climate Action Network' },
        { id: 'j0b4oKjV6O0', title: 'Deep Sea Current Disruptions & Marine Bleaching', source: 'National Geographic' }
    ].map(v => ({ ...v, thumb: `https://img.youtube.com/vi/${v.id}/maxresdefault.jpg` }));

    try {
        const r = await withCache('videos', 12 * HOUR, async () => {
            const data = await getJSON(url, 8000);
            if (!data.items?.length) throw new Error('Empty YouTube items');
            return data.items.map(item => ({
                id: item.id.videoId, title: item.snippet.title, source: item.snippet.channelTitle,
                thumb: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url
            }));
        });
        renderVideoCards(r.data);
    } catch (err) {
        console.warn('YouTube search unavailable, using the curated set:', err);
        renderVideoCards(fallback);
    }
}

// ── GO ─────────────────────────────────────────────────────────────────────
showSkeletons();
refreshAll(false);
loadVideos();
window.addEventListener('load', scheduleRefresh);

})();
