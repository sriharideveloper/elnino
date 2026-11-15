/* ==========================================================================
   EL NIÑO — THE HEAT ENGINE
   Main application script
   ========================================================================== */

(() => {
'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────────
const IS_MOBILE = window.innerWidth < 768;
const PREFERS_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let uniforms;

// ── FILM GRAIN ─────────────────────────────────────────────────────────────
function generateGrain() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i+1] = img.data[i+2] = v;
        img.data[i+3] = 18;
    }
    ctx.putImageData(img, 0, 0);
    document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
generateGrain();

// ── TEXT SPLIT UTILITIES ───────────────────────────────────────────────────
function splitChars(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.innerHTML = '';
    for (const ch of text) {
        const s = document.createElement('span');
        s.className = 'char';
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        el.appendChild(s);
    }
    return el.querySelectorAll('.char');
}

function splitWords(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.innerHTML = '';
    text.split(' ').forEach((w, i, arr) => {
        const s = document.createElement('span');
        s.className = 'word';
        s.textContent = w;
        el.appendChild(s);
        if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return el.querySelectorAll('.word');
}

// Process all [data-split-chars] elements
const splitTargets = {};
document.querySelectorAll('[data-split-chars]').forEach(el => {
    splitTargets[el.className || el.id] = splitChars(el);
});

// Process conclusion as words
const conclusionWords = splitWords(document.getElementById('conclusion-text'));

// ── CUSTOM CURSOR ──────────────────────────────────────────────────────────
const cursorDot  = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');
let mouseX = -100, mouseY = -100;
let ringX = -100, ringY = -100;

if (!IS_MOBILE) {
    document.addEventListener('mousemove', e => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;
        if (uniforms && uniforms.u_mouse) {
            uniforms.u_mouse.value.set(e.clientX / window.innerWidth, 1.0 - (e.clientY / window.innerHeight));
        }
    });

    // Hover detection for interactive elements
    document.querySelectorAll('a, button, .stat, .impact-vis, .ticker-track').forEach(el => {
        el.addEventListener('mouseenter', () => cursorRing.classList.add('is-hovering'));
        el.addEventListener('mouseleave', () => cursorRing.classList.remove('is-hovering'));
    });

    // Ring follows with lerp in the render loop
}

// ── LENIS SMOOTH SCROLL ───────────────────────────────────────────────────
const lenis = new Lenis({
    duration: 1.4,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smooth: true,
    smoothTouch: false,
    touchMultiplier: 2,
});

// ── GSAP + SCROLLTRIGGER ──────────────────────────────────────────────────
gsap.registerPlugin(ScrollTrigger);
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// ── PRELOADER ──────────────────────────────────────────────────────────────
document.body.classList.add('is-loading');

function runPreloader() {
    const tl = gsap.timeline({
        onComplete: () => {
            document.getElementById('preloader').style.display = 'none';
            document.body.classList.remove('is-loading');
            initHeroAnimations();
        }
    });

    tl.to('.preloader-line', { width: 120, duration: 0.8, ease: 'power2.inOut' }, 0.3)
      .to('.preloader-title', { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.4)
      .to('.preloader-bar-fill', { width: '100%', duration: 1.8, ease: 'power1.inOut' }, 0.6)
      .to(['.preloader-title', '.preloader-line', '.preloader-bar'], {
          opacity: 0, y: -20, duration: 0.5, stagger: 0.05
      }, 2.8)
      .to('.preloader', { yPercent: -100, duration: 0.9, ease: 'power3.inOut' }, 3.2);
}

// Wait for fonts + minimum display time
Promise.all([
    document.fonts.ready,
    new Promise(r => setTimeout(r, PREFERS_REDUCED ? 300 : 1500))
]).then(runPreloader);

// ── HERO ANIMATIONS ────────────────────────────────────────────────────────
function initHeroAnimations() {
    const tl = gsap.timeline();

    // Kicker
    tl.to('.kicker', { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0);

    // Title reveal
    tl.fromTo('.hero-title', {
        y: 60, opacity: 0
    }, {
        y: 0, opacity: 1,
        duration: 1.5, ease: 'power4.out'
    }, 0.15);

    // Subtitle
    tl.to('.hero-sub', { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.6);

    // Aside
    tl.to('.hero-aside', { y: 0, opacity: 1, duration: 1, ease: 'power2.out' }, 0.7);

    // Scroll cue
    tl.to('#scroll-cue', { opacity: 1, duration: 1, ease: 'power2.inOut' }, 1.2);

    // Parallax hero out on scroll
    gsap.to('.hero-content', {
        y: -120, opacity: 0,
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    gsap.to('.hero-aside', {
        y: -80, opacity: 0,
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    gsap.to('#scroll-cue', {
        opacity: 0,
        scrollTrigger: { trigger: '.hero', start: '15% top', end: '30% top', scrub: true }
    });
}

// ── INTERSTITIAL ANIMATIONS ────────────────────────────────────────────────
document.querySelectorAll('.interstitial-text').forEach(el => {
    const chars = el.querySelectorAll('.char');
    gsap.to(chars, {
        opacity: 1, y: 0,
        duration: 0.6, ease: 'power2.out',
        stagger: 0.025,
        scrollTrigger: { trigger: el.closest('.interstitial'), start: 'top 65%' }
    });
});

// ── IMPACTS SECTION (HORIZONTAL SCROLL PINNING) ────────────────────────────
function initImpactsHorizontal() {
    if (IS_MOBILE) return;
    const track = document.getElementById('impacts-track');
    const pinContainer = document.querySelector('.impacts-pin-container');
    const stickyWrap = pinContainer ? pinContainer.querySelector('.impacts-sticky-wrap') : null;
    if (!track || !pinContainer || !stickyWrap) return;

    const scrollTween = gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth),
        ease: 'none',
        scrollTrigger: {
            trigger: pinContainer,
            pin: stickyWrap,
            scrub: 1,
            start: 'top top',
            end: () => '+=' + (track.scrollWidth - window.innerWidth),
            invalidateOnRefresh: true
        }
    });

    // Parallax on card background images
    const bgs = track.querySelectorAll('.impact-card-bg');
    bgs.forEach(bg => {
        gsap.fromTo(bg, 
            { xPercent: -15 },
            {
                xPercent: 15,
                ease: 'none',
                scrollTrigger: {
                    trigger: bg.closest('.impact-card'),
                    containerAnimation: scrollTween,
                    start: 'left right',
                    end: 'right left',
                    scrub: true
                }
            }
        );
    });

    // Reveal text cards as they scroll in
    const contents = track.querySelectorAll('.impact-card-content');
    contents.forEach(card => {
        gsap.fromTo(card, 
            { opacity: 0, y: 30, scale: 0.95 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.8,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: card.closest('.impact-card'),
                    containerAnimation: scrollTween,
                    start: 'left 80%',
                    end: 'left 50%',
                    scrub: true
                }
            }
        );
    });
}
initImpactsHorizontal();

// ── STATISTICS COUNTER ─────────────────────────────────────────────────────
document.querySelectorAll('.stat-value').forEach(el => {
    const target   = parseFloat(el.dataset.countTo);
    const decimals = parseInt(el.dataset.decimals) || 0;
    const obj      = { val: 0 };

    gsap.to(obj, {
        val: target,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: { trigger: '#stats', start: 'top 65%' },
        onUpdate: () => { el.textContent = obj.val.toFixed(decimals); }
    });
});

// ── CONCLUSION — word-by-word reveal ───────────────────────────────────────
gsap.to(conclusionWords, {
    opacity: 1, y: 0,
    duration: 0.6,
    ease: 'power2.out',
    stagger: 0.12,
    scrollTrigger: {
        trigger: '#conclusion',
        start: 'top 55%',
        end: 'center center',
        scrub: 1
    }
});

// ── SCROLL PROGRESS BAR ───────────────────────────────────────────────────
gsap.to('#progress-bar', {
    width: '100%',
    ease: 'none',
    scrollTrigger: {
        trigger: '#smooth-content',
        start: 'top top', end: 'bottom bottom',
        scrub: 0.3
    }
});

// ── DICHOTOMY SPLIT SCREEN ─────────────────────────────────────────────────
const dichotomy = document.getElementById('dichotomy');
const slider = document.getElementById('split-slider');
const laNinaLayer = document.getElementById('split-lanina');

if (dichotomy && slider && laNinaLayer) {
    let isDown = false;

    const moveSlider = (e) => {
        if (!isDown) return;
        let x = e.clientX || (e.touches && e.touches[0].clientX);
        if (x === undefined) return;
        
        const rect = dichotomy.getBoundingClientRect();
        let percent = ((x - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(percent, 100));
        
        slider.style.left = percent + '%';
        laNinaLayer.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`;
    };

    slider.addEventListener('mousedown', () => { isDown = true; });
    slider.addEventListener('touchstart', () => { isDown = true; }, {passive: true});
    
    window.addEventListener('mouseup', () => { isDown = false; });
    window.addEventListener('touchend', () => { isDown = false; });
    
    window.addEventListener('mousemove', moveSlider);
    window.addEventListener('touchmove', moveSlider, {passive: true});

    // Reveal animation
    gsap.fromTo('.split-title', 
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'power3.out', stagger: 0.2, scrollTrigger: { trigger: '.dichotomy-section', start: 'top 50%' }}
    );
}

// ── ANATOMY SCROLL NARRATIVE ───────────────────────────────────────────────
const anatomySteps = document.querySelectorAll('.anatomy-step');
const anatomyBgs = document.querySelectorAll('.anatomy-bg');

if (anatomySteps.length > 0 && anatomyBgs.length > 0) {
    anatomyBgs[0].classList.add('active'); // Set initial

    anatomySteps.forEach((step, index) => {
        ScrollTrigger.create({
            trigger: step,
            start: 'top 50%',
            end: 'bottom 50%',
            onEnter: () => activateAnatomyStep(index),
            onEnterBack: () => activateAnatomyStep(index)
        });
    });

    function activateAnatomyStep(index) {
        anatomySteps.forEach(s => s.classList.remove('is-active'));
        anatomyBgs.forEach(b => b.classList.remove('active'));
        
        if (anatomySteps[index]) anatomySteps[index].classList.add('is-active');
        if (anatomyBgs[index]) anatomyBgs[index].classList.add('active');
    }
}

// ── INTERACTIVE 3D GLOBE (GLOBE.GL) ────────────────────────────────────────
const globeContainer = document.getElementById('globe-container');
if (globeContainer && typeof Globe !== 'undefined') {
    
    // Generate mock data for El Niño warmth pool (Pacific Ocean)
    const N = 1000;
    const gData = [...Array(N).keys()].map(() => ({
      lat: (Math.random() - 0.5) * 40, // Concentrate near equator
      lng: 160 + (Math.random() - 0.5) * 140, // Pacific Ocean Longitude ~160 to ~-60
      maxR: Math.random() * 8 + 1,
      propagationSpeed: (Math.random() - 0.5) * 2 + 1,
      repeatPeriod: Math.random() * 2000 + 1000
    }));

    const colorInterpolator = t => `rgba(255, 81, 47, ${1-t})`;

    const world = Globe()(globeContainer)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundColor('rgba(255, 0, 0, 0)')
      .showAtmosphere(true)
      .atmosphereColor('#ff512f')
      .atmosphereAltitude(0.25)
      .ringsData(gData)
      .ringColor(() => colorInterpolator)
      .ringMaxRadius('maxR')
      .ringPropagationSpeed('propagationSpeed')
      .ringRepeatPeriod('repeatPeriod');

    const globeMaterial = world.globeMaterial();
    globeMaterial.bumpScale = 10;
    new THREE.TextureLoader().load('//unpkg.com/three-globe/example/img/earth-water.png', texture => {
      globeMaterial.specularMap = texture;
      globeMaterial.specular = new THREE.Color('grey');
      globeMaterial.shininess = 15;
    });

    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.5;
    world.controls().enableZoom = false; // Disable scroll zoom so it doesn't break scrolling

    // Point to Pacific Ocean (approx El Nino area)
    world.pointOfView({ lat: 0, lng: -140, altitude: 2 });
    
    window.addEventListener('resize', () => {
        world.width(globeContainer.clientWidth);
        world.height(globeContainer.clientHeight);
    });
}

// ── LIVE DATA FETCHING ─────────────────────────────────────────────────────
const oniDisplay = document.getElementById('oni-display');
const oniStatus  = document.getElementById('oni-status');
const tickerEl   = document.getElementById('ticker');

async function fetchONI() {
    try {
        const url = 'https://api.allorigins.win/raw?url='
            + encodeURIComponent('https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt');
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error('Network error');

        const txt   = await res.text();
        const lines = txt.trim().split('\n');
        const last  = lines[lines.length - 1].trim().split(/\s+/);
        const val   = parseFloat(last[3]);
        if (isNaN(val)) throw new Error('Parse error');

        const sign = val > 0 ? '+' : '';
        oniDisplay.textContent = `${sign}${val.toFixed(1)}`;
        oniDisplay.classList.add('pulsate');
        oniStatus.textContent = 'Live ONI — NOAA CPC';
        targetHeat = Math.max(0.5, (val + 1) / 3);
    } catch {
        oniDisplay.textContent = '+1.8';
        oniDisplay.classList.add('pulsate');
        oniStatus.textContent = 'Current Anomaly Estimate';
        targetHeat = 0.8;
    }
}

function loadHeadlines() {
    const items = [
        'GLOBAL SEA SURFACE TEMPERATURES HIT RECORD HIGHS',
        'DROUGHT DECLARED ACROSS 40% OF WESTERN HEMISPHERE',
        'EL NIÑO PATTERN EXPECTED TO INTENSIFY INTO WINTER',
        'MARINE HEATWAVE BLEACHES MASSIVE CORAL TRACTS',
        'ATMOSPHERIC RIVER DELIVERS UNPRECEDENTED RAINFALL TO COASTAL REGIONS',
        'CROP YIELDS THREATENED BY SUSTAINED HEAT ANOMALIES',
        'PACIFIC WARM POOL EXPANDS BEYOND HISTORICAL BOUNDS',
        'WILDFIRE SEASON EXTENDS 60 DAYS BEYOND AVERAGE'
    ];
    const text = items.join('  ·  ');
    // Duplicate for seamless loop
    tickerEl.innerHTML = `<span class="ticker-item">${text}  ·  ${text}</span>`;
}

fetchONI();
loadHeadlines();

// ── ONI HISTORICAL CHART ───────────────────────────────────────────────────
const oniData = [
    // [year, DJF ONI anomaly]
    [1950,-1.4],[1952, 0.4],[1954,-0.6],[1956,-1.4],[1958, 1.8],
    [1960,-0.1],[1962,-0.2],[1964,-0.8],[1966, 1.2],[1968,-0.7],
    [1970, 0.5],[1972, 2.1],[1974,-1.8],[1976,-1.5],[1978, 0.7],
    [1980, 0.2],[1982, 2.2],[1984,-0.9],[1986, 1.2],[1988,-1.9],
    [1990, 0.4],[1992, 1.6],[1994, 0.5],[1995,-0.8],[1997, 2.4],
    [1999,-1.5],[2001,-0.6],[2003, 1.1],[2005,-0.7],[2007,-1.4],
    [2009, 1.6],[2010,-1.5],[2012,-0.3],[2014, 0.7],[2016, 2.6],
    [2018,-0.9],[2020,-1.3],[2022,-0.9],[2024, 2.0],[2025,-0.5],
];

const chartCanvas = document.getElementById('oni-chart');
let chartDrawn = false;

function drawONIChart(progress) {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio, 2);
    const w   = chartCanvas.offsetWidth  * dpr;
    const h   = chartCanvas.offsetHeight * dpr;
    chartCanvas.width  = w;
    chartCanvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const pad   = { top: 20 * dpr, right: 15 * dpr, bottom: 30 * dpr, left: 35 * dpr };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top  - pad.bottom;
    const maxONI = 3, minONI = -3;
    const range  = maxONI - minONI;
    const zeroY  = pad.top + (maxONI / range) * chartH;

    // Zero line
    ctx.strokeStyle = 'rgba(240,244,248,0.12)';
    ctx.lineWidth   = dpr;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + chartW, zeroY);
    ctx.stroke();

    // "0" label
    ctx.fillStyle = 'rgba(240,244,248,0.25)';
    ctx.font      = `${10 * dpr}px 'IBM Plex Mono', monospace`;
    ctx.textAlign  = 'right';
    ctx.fillText('0', pad.left - 6 * dpr, zeroY + 3 * dpr);

    // Draw bars up to progress
    const drawCount = Math.ceil(oniData.length * progress);
    const barW      = chartW / oniData.length;

    for (let i = 0; i < drawCount; i++) {
        const [year, oni] = oniData[i];
        const x    = pad.left + i * barW;
        const barH = Math.abs(oni) / maxONI * (chartH / 2);
        const y    = oni > 0 ? zeroY - barH : zeroY;

        const alpha = 0.35 + (Math.abs(oni) / maxONI) * 0.55;
        ctx.fillStyle = oni > 0
            ? `rgba(255,75,31,${alpha})`
            : `rgba(32,164,243,${alpha})`;
        ctx.fillRect(x + 1, y, barW - 2, barH);
    }

    // Year labels at edges
    if (drawCount > 0) {
        ctx.fillStyle = 'rgba(240,244,248,0.2)';
        ctx.font      = `${9 * dpr}px 'IBM Plex Mono', monospace`;
        ctx.textAlign  = 'left';
        ctx.fillText('1950', pad.left, h - 6 * dpr);
        ctx.textAlign = 'right';
        ctx.fillText('2025', w - pad.right, h - 6 * dpr);
    }
}

ScrollTrigger.create({
    trigger: '#data',
    start: 'top 70%', end: 'bottom 30%',
    scrub: 0.5,
    onUpdate: self => drawONIChart(self.progress)
});

// ── THREE.JS DOMAIN-WARPED FBM SHADER ──────────────────────────────────────
const webglCanvas = document.getElementById('webgl-canvas');
const scene       = new THREE.Scene();
const camera      = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({
    canvas: webglCanvas, alpha: true, antialias: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));

const vertexShader = `void main() { gl_Position = vec4(position, 1.0); }`;

const fragmentShader = `
    precision mediump float;

    uniform float u_time;
    uniform vec2  u_resolution;
    uniform float u_scroll;
    uniform float u_heat;
    uniform vec2  u_mouse;

    /* --- simplex-ish 2D noise ------------------------------------------- */
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

    /* --- FBM (fractal brownian motion) --------------------------------- */
    float fbm(vec2 p){
        float f=0., w=.5;
        for(int i=0;i<4;i++){ f+=w*snoise(p); p*=2.03; w*=.48; }
        return f;
    }

    void main(){
        vec2 uv = gl_FragCoord.xy / u_resolution;
        uv.x *= u_resolution.x / u_resolution.y;

        float t = u_time * 0.012;

        /* Mouse reactive warp (gravitational lensing/heat warp) */
        vec2 mouseNorm = u_mouse;
        mouseNorm.x *= u_resolution.x / u_resolution.y;
        float d = distance(uv, mouseNorm);
        float warp = smoothstep(0.28, 0.0, d) * 0.05;
        uv += normalize(uv - mouseNorm) * warp;

        /* domain warp — creates organic flowing patterns */
        vec2 q = vec2(
            fbm(uv + vec2(0.0, 0.0) + t),
            fbm(uv + vec2(5.2, 1.3) + t * 0.7)
        );
        vec2 r = vec2(
            fbm(uv + 3.0*q + vec2(1.7,9.2) + t*0.2),
            fbm(uv + 3.0*q + vec2(8.3,2.8) + t*0.15)
        );
        float f = fbm(uv + 3.0*r);

        /* colour palette — cinematic dark red void -> deep sub-surface magma */
        vec3 deep   = vec3(0.025, 0.002, 0.002);   /* very dark red */
        vec3 ocean  = vec3(0.05, 0.01, 0.01);      /* dark muted crimson */
        vec3 warm   = vec3(0.48, 0.12, 0.04);      /* dark cinematic amber/red */
        vec3 hot    = vec3(0.24, 0.03, 0.01);      /* deep glowing embers */
        vec3 violet = vec3(0.12, 0.02, 0.02);      /* darker bloody red */

        float heat = u_scroll * u_heat;

        vec3 col = mix(deep, ocean, smoothstep(-0.6, 0.4, f));
        col = mix(col, violet, smoothstep(0.1, 0.7, f) * heat * 0.3);
        col = mix(col, warm,   smoothstep(0.2, 0.8, f) * heat);
        col = mix(col, hot,    smoothstep(0.5, 1.0, f) * heat * 0.5);

        /* subtle fog layers */
        float fog = smoothstep(-0.2, 0.3, fbm(uv*2.0 + t*0.04));
        col += vec3(0.03, 0.005, 0.005) * fog;

        gl_FragColor = vec4(col, 1.0);
    }
`;

uniforms = {
    u_time:       { value: 0 },
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_scroll:     { value: 0 },
    u_heat:       { value: 0.5 },
    u_mouse:      { value: new THREE.Vector2(0.5, 0.5) }
};

let targetHeat = 0.5;

const geo  = new THREE.PlaneGeometry(2, 2);
const mat  = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthWrite: false, depthTest: false });
scene.add(new THREE.Mesh(geo, mat));

// Track scroll for shader
lenis.on('scroll', e => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    uniforms.u_scroll.value = max > 0 ? e.animatedScroll / max : 0;
});

// ── RESIZE ─────────────────────────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    }, 150);
});

// ── RENDER LOOP ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function tick() {
    requestAnimationFrame(tick);

    // Three.js uniforms
    uniforms.u_time.value  = clock.getElapsedTime();
    uniforms.u_heat.value += (targetHeat - uniforms.u_heat.value) * 0.015;
    renderer.render(scene, camera);

    // Cursor ring lerp
    if (!IS_MOBILE) {
        ringX += (mouseX - ringX) * 0.12;
        ringY += (mouseY - ringY) * 0.12;
        cursorRing.style.transform = `translate(${ringX}px, ${ringY}px)`;
    }
}

tick();

// ── INTEL TABS ─────────────────────────────────────────────────────────────
document.querySelectorAll('.intel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Deactivate all tabs & panels
        document.querySelectorAll('.intel-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.intel-panel').forEach(p => p.classList.remove('active'));

        // Activate clicked
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const panel = document.getElementById('panel-' + tab.dataset.tab);
        if (panel) panel.classList.add('active');
    });
});

// ── SKELETON LOADERS ───────────────────────────────────────────────────────
function skeletonCard(count = 6) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="news-card" style="pointer-events:none">
            <div class="skeleton skeleton-img"></div>
            <div class="news-body">
                <div class="skeleton skeleton-text" style="width:40%"></div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text" style="width:50%"></div>
            </div>
        </div>`;
    }
    return html;
}

function skeletonRows(count = 8) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="event-row" style="pointer-events:none">
            <div class="event-cat"><div class="skeleton" style="width:8px;height:8px;border-radius:50%"></div>
                <div class="skeleton skeleton-text" style="width:60px;margin:0"></div></div>
            <div class="skeleton skeleton-title" style="margin:0"></div>
            <div class="skeleton skeleton-text" style="width:80px;margin:0"></div>
        </div>`;
    }
    return html;
}

function skeletonReports(count = 6) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="report-card" style="pointer-events:none;border-left-color:var(--clr-deep)">
            <div class="skeleton skeleton-text" style="width:50%"></div>
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text" style="width:70%"></div>
            <div class="skeleton skeleton-text" style="width:30%"></div>
        </div>`;
    }
    return html;
}

// Show skeletons immediately
document.getElementById('news-grid').innerHTML = skeletonCard(6);
document.getElementById('events-list').innerHTML = skeletonRows(8);
document.getElementById('reports-grid').innerHTML = skeletonReports(6);

// ── HELPER: format date ────────────────────────────────────────────────────
function fmtDate(str) {
    try {
        const d = new Date(str);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return ''; }
}

// ── NEWSDATA NEWS ──────────────────────────────────────────────────────────
async function fetchNews() {
    const grid = document.getElementById('news-grid');
    try {
        const apiKey = 'pub_c35111086828452c891556c392a0bed2';
        const query = 'el nino OR "el niño" climate';
        const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodeURIComponent(query)}&language=en`;

        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error('NewsData API error');
        const data = await res.json();
        if (data.status !== 'success' || !data.results || !data.results.length) {
            throw new Error('NewsData returned failure status or empty list');
        }

        grid.innerHTML = '';
        data.results.slice(0, 9).forEach(art => {
            const card = document.createElement('a');
            card.className = 'news-card';
            card.href = art.link;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';

            const source = art.source_id ? art.source_id.toUpperCase() : 'NEWS';
            const dateStr = art.pubDate ? fmtDate(art.pubDate) : '';

            card.innerHTML = `
                ${art.image_url ? `<div class="news-img" style="background-image:url('${art.image_url}')"></div>` : `<div class="news-img"></div>`}
                <div class="news-body">
                    <span class="news-source">${source}</span>
                    <h4 class="news-title">${art.title || 'Untitled'}</h4>
                    <span class="news-date">${dateStr}</span>
                </div>`;
            grid.appendChild(card);
        });

        animateFeedIn(grid);
    } catch (err) {
        console.warn('NewsData fetch failed, falling back to mock news:', err);
        renderMockNews(grid);
    }
}

function renderMockNews(grid) {
    const mock = [
        { t: 'Global Sea Surface Temperatures Shatter Records for Third Consecutive Month', s: 'noaa.gov', d: 'Jul 10, 2026' },
        { t: 'El Niño Declared: NOAA Forecasters Confirm Pacific Warming Pattern', s: 'climate.gov', d: 'Jun 28, 2026' },
        { t: 'Drought Emergency Declared Across Southeast Asia as Monsoon Stalls', s: 'reuters.com', d: 'Jul 8, 2026' },
        { t: 'Marine Heatwave Triggers Mass Coral Bleaching Across Great Barrier Reef', s: 'bbc.com', d: 'Jul 5, 2026' },
        { t: 'Atmospheric River Delivers Record Rainfall to California Coast', s: 'washingtonpost.com', d: 'Jul 3, 2026' },
        { t: 'Pacific Warm Pool Expansion Signals Intensifying El Niño Through Winter', s: 'nature.com', d: 'Jun 30, 2026' },
    ];
    grid.innerHTML = '';
    mock.forEach(m => {
        grid.innerHTML += `<a class="news-card" href="#" onclick="return false">
            <div class="news-img"></div>
            <div class="news-body">
                <span class="news-source">${m.s}</span>
                <h4 class="news-title">${m.t}</h4>
                <span class="news-date">${m.d}</span>
            </div></a>`;
    });
    animateFeedIn(grid);
}

// ── NASA EONET EVENTS ──────────────────────────────────────────────────────
const EVENT_COLORS = {
    wildfires: 'cat-wildfires',
    severeStorms: 'cat-severeStorms',
    volcanoes: 'cat-volcanoes',
    floods: 'cat-floods',
    drought: 'cat-drought',
    seaLakeIce: 'cat-seaLakeIce',
};

async function fetchEvents() {
    const list = document.getElementById('events-list');
    try {
        const res = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=20', {
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) throw new Error('EONET error');
        const data = await res.json();
        if (!data.events || !data.events.length) throw new Error('No events');

        list.innerHTML = '';
        data.events.forEach(ev => {
            const catId = ev.categories?.[0]?.id || 'default';
            const catTitle = ev.categories?.[0]?.title || 'Event';
            const geom = ev.geometry?.[ev.geometry.length - 1];
            const date = geom?.date ? fmtDate(geom.date) : '';
            const dotClass = EVENT_COLORS[catId] || 'cat-default';

            const row = document.createElement('div');
            row.className = 'event-row';
            row.innerHTML = `
                <div class="event-cat">
                    <span class="event-dot ${dotClass}"></span>
                    <span class="event-cat-name">${catTitle}</span>
                </div>
                <span class="event-title">${ev.title}</span>
                <span class="event-date">${date}</span>`;
            list.appendChild(row);
        });

        animateFeedIn(list);
    } catch (err) {
        console.warn('EONET fetch failed:', err);
        renderMockEvents(list);
    }
}

function renderMockEvents(list) {
    const mock = [
        { cat: 'wildfires', t: 'Wildfire — Northern California', d: 'Jul 12, 2026' },
        { cat: 'severeStorms', t: 'Tropical Storm Alicia — Gulf of Mexico', d: 'Jul 11, 2026' },
        { cat: 'wildfires', t: 'Wildfire — British Columbia', d: 'Jul 10, 2026' },
        { cat: 'volcanoes', t: 'Volcanic Activity — Kilauea, Hawaii', d: 'Jul 9, 2026' },
        { cat: 'floods', t: 'Flooding — Bangladesh Delta Region', d: 'Jul 8, 2026' },
        { cat: 'severeStorms', t: 'Severe Thunderstorm — Central Europe', d: 'Jul 7, 2026' },
        { cat: 'seaLakeIce', t: 'Iceberg Calving — Larsen Ice Shelf', d: 'Jul 6, 2026' },
        { cat: 'drought', t: 'Drought Conditions — Horn of Africa', d: 'Jul 5, 2026' },
    ];
    list.innerHTML = '';
    mock.forEach(m => {
        const dotClass = EVENT_COLORS[m.cat] || 'cat-default';
        const catName = m.cat.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
        list.innerHTML += `<div class="event-row">
            <div class="event-cat"><span class="event-dot ${dotClass}"></span>
                <span class="event-cat-name">${catName}</span></div>
            <span class="event-title">${m.t}</span>
            <span class="event-date">${m.d}</span></div>`;
    });
    animateFeedIn(list);
}

// ── RELIEFWEB REPORTS ──────────────────────────────────────────────────────
async function fetchReports() {
    const grid = document.getElementById('reports-grid');
    try {
        const url = 'https://api.reliefweb.int/v2/reports?appname=elnino-viz'
            + '&query[value]=el+nino+OR+drought+OR+flood+OR+climate'
            + '&limit=8&sort[]=date.created:desc'
            + '&fields[include][]=title'
            + '&fields[include][]=date.created'
            + '&fields[include][]=source.shortname'
            + '&fields[include][]=source.name';

        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error('ReliefWeb error');
        const data = await res.json();
        if (!data.data || !data.data.length) throw new Error('No reports');

        grid.innerHTML = '';
        data.data.forEach(item => {
            const f = item.fields;
            const source = f.source?.[0]?.shortname || f.source?.[0]?.name || 'ReliefWeb';
            const date = f.date?.created ? fmtDate(f.date.created) : '';
            const rwUrl = `https://reliefweb.int/node/${item.id}`;

            const card = document.createElement('a');
            card.className = 'report-card';
            card.href = rwUrl;
            card.target = '_blank';
            card.rel = 'noopener noreferrer';
            card.innerHTML = `
                <span class="report-source">${source}</span>
                <h4 class="report-title">${f.title || 'Untitled Report'}</h4>
                <span class="report-date">${date}</span>
                <span class="report-link">Read Report →</span>`;
            grid.appendChild(card);
        });

        animateFeedIn(grid);
    } catch (err) {
        console.warn('ReliefWeb fetch failed:', err);
        renderMockReports(grid);
    }
}

function renderMockReports(grid) {
    const mock = [
        { s: 'OCHA', t: 'El Niño: Anticipatory Action Framework — Global Overview', d: 'Jul 8, 2026' },
        { s: 'WFP', t: 'Food Security Impact Assessment: Pacific El Niño 2026', d: 'Jul 5, 2026' },
        { s: 'IFRC', t: 'Emergency Appeal: Drought Response in Southern Africa', d: 'Jul 3, 2026' },
        { s: 'FAO', t: 'Crop Monitoring Bulletin: El Niño Impacts on Agriculture', d: 'Jun 30, 2026' },
        { s: 'UNICEF', t: 'Children at Risk: Climate-Driven Displacement Report', d: 'Jun 28, 2026' },
        { s: 'WHO', t: 'Health Impacts of El Niño: Disease Surveillance Update', d: 'Jun 25, 2026' },
    ];
    grid.innerHTML = '';
    mock.forEach(m => {
        grid.innerHTML += `<a class="report-card" href="#" onclick="return false">
            <span class="report-source">${m.s}</span>
            <h4 class="report-title">${m.t}</h4>
            <span class="report-date">${m.d}</span>
            <span class="report-link">Read Report →</span></a>`;
    });
    animateFeedIn(grid);
}

// ── YOUTUBE VIDEOS & HORIZONTAL SCROLL ──────────────────────────────────────
const modal    = document.getElementById('video-modal');
const iframe   = document.getElementById('modal-iframe');
const closeBtn = document.getElementById('video-modal-close');
const modalBg  = document.getElementById('video-modal-bg');

function openVideoModal(videoId) {
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

if (closeBtn) closeBtn.addEventListener('click', closeVideoModal);
if (modalBg)  modalBg.addEventListener('click', closeVideoModal);

// Close on ESC
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeVideoModal();
    }
});

function initHorizontalScroll() {
    if (IS_MOBILE) return;
    const track = document.getElementById('video-carousel-track');
    const pinContainer = document.querySelector('.video-pin-container');
    const stickyWrap = pinContainer ? pinContainer.querySelector('.video-sticky-wrap') : null;
    if (!track || !pinContainer || !stickyWrap) return;

    // Build the horizontal scroll pin trigger
    const scrollTween = gsap.to(track, {
        x: () => -(track.scrollWidth - window.innerWidth),
        ease: 'none',
        scrollTrigger: {
            trigger: pinContainer,
            pin: stickyWrap,
            scrub: 1,
            start: 'top top',
            end: () => '+=' + (track.scrollWidth - window.innerWidth),
            invalidateOnRefresh: true
        }
    });

    // Parallax on card background images
    const imgs = track.querySelectorAll('.video-card-image');
    imgs.forEach(img => {
        gsap.fromTo(img, 
            { xPercent: -15 },
            {
                xPercent: 15,
                ease: 'none',
                scrollTrigger: {
                    trigger: img.closest('.video-card'),
                    containerAnimation: scrollTween,
                    start: 'left right',
                    end: 'right left',
                    scrub: true
                }
            }
        );
    });
}

function renderVideoCards(videos) {
    const track = document.getElementById('video-carousel-track');
    if (!track) return;
    track.innerHTML = '';

    videos.forEach((v, index) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.dataset.videoId = v.id;
        
        const idxStr = String(index + 1).padStart(2, '0');

        card.innerHTML = `
            <div class="video-card-image-wrap">
                <div class="video-card-image" style="background-image:url('${v.thumb}')"></div>
            </div>
            <div class="video-card-overlay"></div>
            <div class="video-card-num">${idxStr}</div>
            <div class="video-card-content">
                <span class="video-card-source">${v.source}</span>
                <h3 class="video-card-title">${v.title}</h3>
            </div>
        `;

        // Click handler to launch modal
        card.addEventListener('click', () => {
            openVideoModal(v.id);
        });

        // Interactive cursor state overrides
        if (!IS_MOBILE && cursorRing) {
            card.addEventListener('mouseenter', () => {
                cursorRing.classList.add('is-video-hover');
            });
            card.addEventListener('mouseleave', () => {
                cursorRing.classList.remove('is-video-hover');
            });
        }

        track.appendChild(card);
    });

    // Let layouts calculate before initializing ScrollTrigger
    setTimeout(() => {
        initHorizontalScroll();
        ScrollTrigger.refresh();
    }, 150);
}

async function loadVideos() {
    const track = document.getElementById('video-carousel-track');
    if (!track) return;

    const apiKey = 'AIzaSyCjsxcyfvTBboUQkPJj_213Bja0J1LH1J0';
    const query = 'El Nino climate documentary';
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=6&key=${apiKey}`;

    const fallback = [
        { id: 'w5n_G7b9C2E', title: 'El Niño: The Pacific Heat Engine Explained', source: 'NOAA Climate.gov', thumb: 'https://img.youtube.com/vi/w5n_G7b9C2E/maxresdefault.jpg' },
        { id: 'uYoS8S6ZfYo', title: 'How El Niño is Changing Global Weather Patterns', source: 'DW Documentary', thumb: 'https://img.youtube.com/vi/uYoS8S6ZfYo/maxresdefault.jpg' },
        { id: 'tyPz10c4K4E', title: 'NASA Visualization: The Ocean Under Stress', source: 'NASA Earth Observatory', thumb: 'https://img.youtube.com/vi/tyPz10c4K4E/maxresdefault.jpg' },
        { id: 'gB2k0L10B-0', title: 'The Human and Economic Cost of Global Warming', source: 'Climate Action Network', thumb: 'https://img.youtube.com/vi/gB2k0L10B-0/maxresdefault.jpg' },
        { id: 'j0b4oKjV6O0', title: 'Deep Sea Current Disruptions & Marine Bleaching', source: 'National Geographic', thumb: 'https://img.youtube.com/vi/j0b4oKjV6O0/maxresdefault.jpg' }
    ];

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('YouTube API response error');
        const data = await res.json();
        if (!data.items || !data.items.length) throw new Error('Empty YouTube items');

        const items = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            source: item.snippet.channelTitle,
            thumb: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url
        }));
        renderVideoCards(items);
    } catch(err) {
        console.warn('YouTube API call failed or rate limited. Using curated documentary set:', err);
        renderVideoCards(fallback);
    }
}

// ── FEED ANIMATION HELPER ──────────────────────────────────────────────────
function animateFeedIn(container) {
    if (PREFERS_REDUCED) return;
    const items = container.children;
    gsap.fromTo(items, 
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' }
    );
}

// ── GSAP ANIMATIONS FOR NEW SECTIONS ───────────────────────────────────────
gsap.fromTo('.intel-header', 
    { opacity: 0, y: 40 },
    { opacity: 1, y: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#intel', start: 'top 70%' } }
);

gsap.fromTo('.intel-tabs',
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out',
      scrollTrigger: { trigger: '#intel', start: 'top 60%' } }
);

// Video section header reveal
gsap.fromTo('.video-section .video-header',
    { opacity: 0, y: 40 },
    { opacity: 1, y: 0, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: '#videos', start: 'top 70%' } }
);

// ── INIT ALL FEEDS ─────────────────────────────────────────────────────────
fetchNews();
fetchEvents();
fetchReports();
loadVideos();

})();
