(function () {
  "use strict";

  if (window.__novaRoseGalaxy?.init) {
    window.__novaRoseGalaxy.init();
    return;
  }

  /**
   * Rose Galaxy — real visible motion version
   * Goal:
   * 1. Particles must drift even when the mouse does nothing.
   * 2. Mouse only creates local attraction.
   * 3. Mouse stop / leave creates local outward scatter and then natural recovery.
   * 4. Sections can opt out with no-galaxy-section or data-galaxy="off".
   */

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");

  const STAR_COLORS = [
    { r: 255, g: 250, b: 248, a: 0.92 },
    { r: 255, g: 232, b: 234, a: 0.88 },
    { r: 238, g: 150, b: 166, a: 0.84 },
    { r: 218, g: 82, b: 112, a: 0.78 },
    { r: 168, g: 48, b: 72, a: 0.72 },
    { r: 195, g: 184, b: 205, a: 0.68 },
  ];

  const LINK_COLORS = [
    { r: 255, g: 226, b: 230 },
    { r: 238, g: 154, b: 170 },
    { r: 210, g: 92, b: 120 },
    { r: 188, g: 166, b: 204 },
  ];
  const LIGHT_STAR_COLORS = [
    { r: 151, g: 103, b: 122, a: 0.48 },
    { r: 169, g: 135, b: 158, a: 0.44 },
    { r: 139, g: 128, b: 171, a: 0.42 },
    { r: 190, g: 171, b: 183, a: 0.38 },
    { r: 236, g: 226, b: 221, a: 0.34 },
  ];
  const LIGHT_LINK_COLORS = [
    { r: 145, g: 112, b: 129 },
    { r: 151, g: 137, b: 173 },
    { r: 184, g: 153, b: 164 },
  ];
  const DARK_GLOW_COLORS = [
    { r: 242, g: 232, b: 233 },
    { r: 224, g: 193, b: 206 },
    { r: 211, g: 214, b: 229 },
    { r: 196, g: 176, b: 205 },
  ];
  const LIGHT_GLOW_COLORS = [
    { r: 174, g: 157, b: 164 },
    { r: 190, g: 163, b: 171 },
    { r: 162, g: 153, b: 161 },
    { r: 199, g: 181, b: 184 },
  ];
  const LIGHT_PETAL_COLOR = { r: 218, g: 171, b: 180 };

  const scenes = [];
  const FRAME_INTERVAL = 1000 / 30;
  let rafId = 0;
  let resizeTimer = 0;
  let lastFrameTime = 0;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function rgba(c, a) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${clamp(a, 0, 1)})`;
  }

  function isMobile() {
    return window.innerWidth < 768 || coarsePointerQuery.matches;
  }

  function isLightTheme() {
    return document.documentElement.dataset.theme === "light";
  }

  function displayColor(particle) {
    if (!isLightTheme()) return particle.color;
    return LIGHT_STAR_COLORS[particle.paletteIndex % LIGHT_STAR_COLORS.length];
  }

  function shouldDrawParticle(scene, particle) {
    return !(isLightTheme() && scene.mode === "hero" && particle.themeSeed < 0.24);
  }

  function isMusicSection(el) {
    return Boolean(el.closest(".no-galaxy-section, [data-galaxy='off']"));
  }

  function softStep(t) {
    return t * t * (3 - 2 * t);
  }

  class RoseGalaxyScene {
    constructor(host, canvas, mode) {
      this.host = host;
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: true });
      this.mode = mode;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.visible = true;
      this.particles = [];
      this.microParticles = [];
      this.clusters = [];
      this.textRects = [];
      this.idleTimer = 0;
      this.lastTime = performance.now();

      this.mouse = {
        x: -9999,
        y: -9999,
        inside: false,
        active: false,
        idle: true,
      };

      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerLeave = this.onPointerLeave.bind(this);

      this.host.addEventListener("pointermove", this.onPointerMove, { passive: true });
      this.host.addEventListener("pointerleave", this.onPointerLeave, { passive: true });

      if ("IntersectionObserver" in window) {
        this.observer = new IntersectionObserver(
          (entries) => {
            this.visible = entries.some((entry) => entry.isIntersecting);
          },
          { threshold: 0.01 }
        );
        this.observer.observe(this.host);
      }

      this.resize();
    }

    destroy() {
      clearTimeout(this.idleTimer);
      this.observer?.disconnect();
      this.host.removeEventListener("pointermove", this.onPointerMove);
      this.host.removeEventListener("pointerleave", this.onPointerLeave);
      this.ctx.clearRect(0, 0, this.width, this.height);
    }

    motionScale() {
      return 1;
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      this.width = Math.max(1, Math.round(rect.width));
      this.height = Math.max(1, Math.round(rect.height));
      this.dpr = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 2);

      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      this.updateTextRects();
      this.buildParticles();
      this.draw(performance.now(), false);
    }

    updateTextRects() {
      const hostRect = this.host.getBoundingClientRect();
      const selectors = [".hero-copy", ".nova-current-note", ".showcase-text", ".showcase-visual", ".footer-content"];

      this.textRects = selectors
        .flatMap((selector) => Array.from(this.host.querySelectorAll(selector)))
        .map((el) => {
          const r = el.getBoundingClientRect();
          const padX = this.mode === "hero" ? 42 : 28;
          const padY = this.mode === "hero" ? 30 : 22;
          return {
            left: r.left - hostRect.left - padX,
            top: r.top - hostRect.top - padY,
            right: r.right - hostRect.left + padX,
            bottom: r.bottom - hostRect.top + padY,
          };
        });
    }

    textFactor(x, y) {
      for (const r of this.textRects) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          if (this.mode === "hero") return isLightTheme() ? 0.08 : 0.14;
          return 0.62;
        }
      }
      return 1;
    }

    createClusters() {
      const w = this.width;
      const h = this.height;

      if (this.mode === "hero") {
        this.clusters = [
          { x: w * random(0.56, 0.70), y: h * random(0.15, 0.34), rx: w * random(0.12, 0.19), ry: h * random(0.10, 0.18), weight: 0.33 },
          { x: w * random(0.70, 0.90), y: h * random(0.43, 0.72), rx: w * random(0.14, 0.23), ry: h * random(0.12, 0.20), weight: 0.37 },
          { x: w * random(0.13, 0.34), y: h * random(0.15, 0.42), rx: w * random(0.11, 0.20), ry: h * random(0.10, 0.18), weight: 0.30 },
        ];
        return;
      }

      if (this.mode === "footer") {
        this.clusters = [
          { x: w * random(0.15, 0.35), y: h * random(0.25, 0.70), rx: w * random(0.16, 0.28), ry: h * random(0.18, 0.30), weight: 0.50 },
          { x: w * random(0.64, 0.86), y: h * random(0.25, 0.70), rx: w * random(0.16, 0.28), ry: h * random(0.18, 0.30), weight: 0.50 },
        ];
        return;
      }

      this.clusters = [
        { x: w * random(0.15, 0.36), y: h * random(0.22, 0.60), rx: w * random(0.15, 0.25), ry: h * random(0.14, 0.28), weight: 0.32 },
        { x: w * random(0.58, 0.84), y: h * random(0.18, 0.50), rx: w * random(0.15, 0.25), ry: h * random(0.14, 0.28), weight: 0.35 },
        { x: w * random(0.42, 0.78), y: h * random(0.54, 0.84), rx: w * random(0.14, 0.24), ry: h * random(0.14, 0.27), weight: 0.33 },
      ];
    }

    pickCluster() {
      const total = this.clusters.reduce((sum, c) => sum + c.weight, 0);
      let cursor = Math.random() * total;
      for (let i = 0; i < this.clusters.length; i += 1) {
        cursor -= this.clusters[i].weight;
        if (cursor <= 0) return { cluster: this.clusters[i], id: i };
      }
      return { cluster: this.clusters[0], id: 0 };
    }

    particleTotal() {
      if (this.mode === "hero") {
        const lightScale = isLightTheme() ? 0.68 : 1;
        const range = isMobile()
          ? [24, 30]
          : (window.innerWidth < 1100 ? [34, 40] : [48, 56]);
        return Math.round(random(range[0], range[1]) * lightScale);
      }
      if (isMobile()) {
        if (this.mode === "footer") return Math.round(random(20, 28));
        return Math.round(random(20, 32));
      }
      if (this.mode === "footer") return Math.round(random(55, 65));
      return Math.round(random(55, 75));
    }

    microTotal() {
      if (this.mode === "hero") return 0;
      if (isMobile()) return Math.round(random(10, 18));
      return Math.round(random(25, 35));
    }

    pickHeroPosition() {
      const roll = Math.random();
      if (roll < 0.43) {
        return { x: random(this.width * 0.42, this.width * 0.98), y: random(this.height * 0.07, this.height * 0.42) };
      }
      if (roll < 0.72) {
        return { x: random(this.width * 0.3, this.width * 0.96), y: random(this.height * 0.18, this.height * 0.61) };
      }
      if (roll < 0.92) {
        return { x: random(this.width * 0.49, this.width * 0.97), y: random(this.height * 0.43, this.height * 0.86) };
      }
      return { x: random(this.width * 0.08, this.width * 0.42), y: random(this.height * 0.07, this.height * 0.3) };
    }

    createHeroParticle(index, total) {
      const depth = random(0.42, 1);
      const kindRoll = Math.random();
      const kind = kindRoll < 0.02 ? "petal" : (kindRoll < 0.08 ? "glint" : "dust");
      const motionRoll = Math.random();
      const motionFactor = motionRoll < 0.7
        ? random(0.34, 0.48)
        : (motionRoll < 0.95 ? random(0.52, 0.7) : random(0.78, 0.92));
      const position = this.pickHeroPosition();
      const x = position.x;
      const y = position.y;

      return {
        kind,
        baseX: x,
        baseY: y,
        x,
        y,
        prevX: x,
        prevY: y,
        depth,
        size: kind === "petal" ? random(1.8, 3) * depth : (kind === "glint" ? random(1.15, 1.8) : random(0.55, 1.25)) * depth,
        alpha: kind === "petal" ? random(0.11, 0.2) : (kind === "glint" ? random(0.2, 0.34) : random(0.12, 0.28)),
        phase: (index / total) * Math.PI * 2 + random(-Math.PI, Math.PI),
        verticalSpeed: random(-0.004, 0.007) * depth * motionFactor,
        lightFallSpeed: random(0.003, 0.006) * depth * motionFactor,
        sway: random(5, 18) * depth * motionFactor,
        swaySpeed: random(0.0001, 0.00025),
        breeze: random(-0.0025, 0.0035) * motionFactor,
        twinkle: random(0.00055, 0.00135),
        halo: kind === "glint" ? random(3.2, 4.8) : 0,
        tilt: random(-0.18, 0.18),
        colorIndex: index % DARK_GLOW_COLORS.length,
        themeSeed: Math.random(),
        focus: 0,
        attractX: 0,
        attractY: 0,
      };
    }

    createParticle(index, total) {
      if (this.mode === "hero") return this.createHeroParticle(index, total);

      const clustered = Math.random() < (this.mode === "hero" ? 0.84 : 0.80);
      let baseX;
      let baseY;
      let clusterId = -1;

      if (clustered) {
        const picked = this.pickCluster();
        const c = picked.cluster;
        clusterId = picked.id;
        const angle = random(0, Math.PI * 2);
        const radius = Math.pow(Math.random(), 0.60);
        baseX = c.x + Math.cos(angle) * c.rx * radius * random(0.74, 1.20) + random(-28, 28);
        baseY = c.y + Math.sin(angle) * c.ry * radius * random(0.74, 1.20) + random(-24, 24);
      } else {
        baseX = random(this.width * 0.04, this.width * 0.97);
        baseY = random(this.height * 0.07, this.height * 0.92);
      }

      baseX = clamp(baseX, 14, this.width - 14);
      baseY = clamp(baseY, 14, this.height - 14);

      const keyStar = Math.random() > 0.86;
      const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
      const phase = (index / total) * Math.PI * 2 + random(-Math.PI, Math.PI);

      return {
        baseX,
        baseY,
        x: baseX + random(-26, 26),
        y: baseY + random(-22, 22),
        prevX: baseX,
        prevY: baseY,
        vx: random(-0.18, 0.18),
        vy: random(-0.18, 0.18),
        size: keyStar ? random(2.46, 3.49) : random(1.31, 2.34),
        color,
        paletteIndex: index,
        themeSeed: Math.random(),
        alpha: random(0.60, 0.93) * color.a * (color.r > 245 && color.g > 240 ? 0.85 : 1),
        phase,
        speed: random(0.00175, 0.00335),
        driftX: random(24, 46),
        driftY: random(18, 38),
        orbit: random(8, 22),
        orbitSpeed: random(0.00072, 0.00165),
        flowSpeed: random(0.00038, 0.00076),
        clusterId,
        linkSeed: Math.random(),
        maxAttract: random(36, 54),
        focus: 0,
        lastInfluenced: false,
        scatterX: 0,
        scatterY: 0,
        scatterStart: -1,
        scatterDuration: random(720, 1320),
        scatterPower: 0,
      };
    }

    createMicroParticle() {
      const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
      return {
        x: random(0, this.width),
        y: random(0, this.height),
        vx: random(-0.020, 0.038),
        vy: random(-0.032, 0.022),
        size: random(0.62, 1.27),
        alpha: random(0.20, 0.48) * (color.r > 245 && color.g > 240 ? 0.85 : 1),
        color,
        paletteIndex: Math.floor(Math.random() * LIGHT_STAR_COLORS.length),
        themeSeed: Math.random(),
        phase: random(0, Math.PI * 2),
        twinkle: random(0.0022, 0.0052),
      };
    }

    buildParticles() {
      this.createClusters();
      const count = this.particleTotal();
      this.particles = Array.from({ length: count }, (_, i) => this.createParticle(i, count));
      this.microParticles = Array.from({ length: this.microTotal() }, () => this.createMicroParticle());
    }

    driftTarget(p, time) {
      const motion = this.motionScale();
      const clusterWave = p.clusterId >= 0 ? p.clusterId + 1 : 0.55;

      const mainX = Math.sin(time * p.speed + p.phase) * p.driftX * motion;
      const mainY = Math.cos(time * p.speed * 0.82 + p.phase * 1.37) * p.driftY * motion;
      const orbitX = Math.cos(time * p.orbitSpeed + p.phase * 2.1) * p.orbit * motion;
      const orbitY = Math.sin(time * p.orbitSpeed * 1.22 + p.phase * 1.66) * p.orbit * 0.78 * motion;

      /* Slow group flow makes the whole galaxy breathe without becoming a rigid grid. */
      const flowX = Math.sin(time * p.flowSpeed + clusterWave * 1.85) * (this.mode === "hero" ? 10 : 7) * motion;
      const flowY = Math.cos(time * p.flowSpeed * 0.84 + clusterWave * 2.24) * (this.mode === "hero" ? 8 : 6) * motion;

      return {
        x: p.baseX + mainX + orbitX + flowX,
        y: p.baseY + mainY + orbitY + flowY,
      };
    }

    scatterOffset(p, time) {
      if (p.scatterStart < 0 || p.scatterPower <= 0) return { x: 0, y: 0 };
      const progress = (time - p.scatterStart) / p.scatterDuration;
      if (progress >= 1) {
        p.scatterStart = -1;
        p.scatterPower = 0;
        p.scatterX = 0;
        p.scatterY = 0;
        return { x: 0, y: 0 };
      }

      const expand = Math.sin(softStep(clamp(progress, 0, 1)) * Math.PI * 0.86);
      const decay = Math.pow(1 - progress, 1.12);
      const amount = expand * decay;
      return { x: p.scatterX * amount, y: p.scatterY * amount };
    }

    updateMicroParticles(time, dt) {
      const motion = this.motionScale();
      for (const p of this.microParticles) {
        p.x += p.vx * dt * motion;
        p.y += p.vy * dt * motion;

        /* A tiny wave stops the micro-particles from looking like falling snow. */
        p.x += Math.sin(time * 0.0011 + p.phase) * 0.018 * dt * motion;
        p.y += Math.cos(time * 0.0009 + p.phase) * 0.012 * dt * motion;

        if (p.x < -10) p.x = this.width + 10;
        if (p.x > this.width + 10) p.x = -10;
        if (p.y < -10) p.y = this.height + 10;
        if (p.y > this.height + 10) p.y = -10;
      }
    }

    resetHeroParticle(p) {
      const position = this.pickHeroPosition();
      p.baseX = position.x;
      p.baseY = position.y;
      p.x = p.baseX;
      p.y = p.baseY;
      p.prevX = p.x;
      p.prevY = p.y;
      p.attractX = 0;
      p.attractY = 0;
      p.focus = 0;
    }

    updateHeroParticle(p, time, dt) {
      const light = isLightTheme();
      const themeMotion = light ? 0.22 : 0.5;
      p.prevX = p.x;
      p.prevY = p.y;
      const verticalSpeed = light ? p.lightFallSpeed : p.verticalSpeed;
      p.baseY += verticalSpeed * dt * this.motionScale() * themeMotion;
      p.baseX += p.breeze * dt * this.motionScale() * themeMotion;

      const naturalX = p.baseX + Math.sin(time * p.swaySpeed + p.phase) * p.sway * themeMotion;
      const naturalY = p.baseY + Math.cos(time * p.swaySpeed * 0.72 + p.phase) * p.sway * 0.16 * themeMotion;
      let targetAttractX = 0;
      let targetAttractY = 0;
      let targetFocus = 0;

      if (this.mouse.active && this.mouse.inside && finePointerQuery.matches && !isMobile()) {
        const dx = this.mouse.x - naturalX;
        const dy = this.mouse.y - naturalY;
        const dist = Math.hypot(dx, dy) || 1;
        const radius = 120;
        if (dist < radius) {
          const influence = Math.pow(1 - dist / radius, 1.6);
          const interaction = light ? 0.012 : 0.028;
          targetAttractX = dx * influence * interaction;
          targetAttractY = dy * influence * interaction;
          targetFocus = influence * (light ? 0.1 : 0.22);
        }
      }

      p.attractX += (targetAttractX - p.attractX) * 0.035;
      p.attractY += (targetAttractY - p.attractY) * 0.035;
      p.focus += (targetFocus - p.focus) * 0.045;
      p.x = naturalX + p.attractX;
      p.y = naturalY + p.attractY;

      if ((verticalSpeed >= 0 && p.baseY > this.height + 28) || (verticalSpeed < 0 && p.baseY < -28)) {
        this.resetHeroParticle(p);
        return;
      }
      if (p.baseX < -50) p.baseX = this.width + 30;
      if (p.baseX > this.width + 50) p.baseX = -30;
    }

    updateParticle(p, time, dt) {
      if (p.kind === "dust" || p.kind === "glint" || p.kind === "petal") {
        this.updateHeroParticle(p, time, dt);
        return;
      }

      const natural = this.driftTarget(p, time);
      let targetX = natural.x;
      let targetY = natural.y;

      p.prevX = p.x;
      p.prevY = p.y;
      p.focus *= 0.90;
      p.lastInfluenced = false;

      const canAttract = this.mouse.active && this.mouse.inside && finePointerQuery.matches && !isMobile();

      if (canAttract) {
        const dx = this.mouse.x - natural.x;
        const dy = this.mouse.y - natural.y;
        const dist = Math.hypot(dx, dy) || 1;
        const radius = this.mode === "hero" ? 250 : 235;

        if (dist < radius) {
          const influence = Math.pow(1 - dist / radius, 1.12);
          const pull = p.maxAttract * influence;
          targetX += (dx / dist) * pull;
          targetY += (dy / dist) * pull;
          p.focus = Math.max(p.focus, influence);
          p.lastInfluenced = true;
        }
      } else {
        const scatter = this.scatterOffset(p, time);
        targetX += scatter.x;
        targetY += scatter.y;
        if (p.scatterPower > 0) {
          p.focus = Math.max(p.focus, Math.min(0.64, p.scatterPower / 30));
        }
      }

      /* This is the core visible-motion fix.
         A stronger easing plus higher drift target means stars move even without mouse input. */
      p.vx += (targetX - p.x) * 0.092;
      p.vy += (targetY - p.y) * 0.092;
      p.vx *= 0.68;
      p.vy *= 0.68;
      p.x += p.vx;
      p.y += p.vy;

      const ox = p.x - natural.x;
      const oy = p.y - natural.y;
      const offset = Math.hypot(ox, oy);
      const maxOffset = 92;
      if (offset > maxOffset) {
        p.x = natural.x + (ox / offset) * maxOffset;
        p.y = natural.y + (oy / offset) * maxOffset;
        p.vx *= 0.35;
        p.vy *= 0.35;
      }
    }

    triggerScatter() {
      if (!finePointerQuery.matches || isMobile()) return;

      if (this.mode === "hero") {
        this.mouse.active = false;
        this.mouse.idle = true;
        return;
      }

      const mx = this.mouse.x;
      const my = this.mouse.y;
      const now = performance.now();
      const radius = this.mode === "hero" ? 255 : 240;

      this.mouse.active = false;
      this.mouse.idle = true;

      for (const p of this.particles) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > radius) continue;

        const influence = Math.pow(1 - dist / radius, 1.10);
        const power = random(16, 30) * influence;
        p.scatterX = (dx / dist) * power;
        p.scatterY = (dy / dist) * power;
        p.scatterStart = now;
        p.scatterDuration = random(760, 1360);
        p.scatterPower = power;
      }
    }

    drawNebula(time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < this.clusters.length; i += 1) {
        const c = this.clusters[i];
        const wobbleX = Math.sin(time * 0.00042 + i * 2.1) * 12 * this.motionScale();
        const wobbleY = Math.cos(time * 0.00036 + i * 1.8) * 9 * this.motionScale();
        const cx = c.x + wobbleX;
        const cy = c.y + wobbleY;
        const radius = Math.max(c.rx, c.ry) * (this.mode === "hero" ? 1.42 : 1.32);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        if (isLightTheme()) {
          g.addColorStop(0, "rgba(145, 105, 130, 0.018)");
          g.addColorStop(0.42, "rgba(135, 119, 160, 0.009)");
          g.addColorStop(1, "rgba(135, 119, 160, 0)");
        } else {
          g.addColorStop(0, "rgba(196, 62, 92, 0.044)");
          g.addColorStop(0.38, "rgba(150, 44, 68, 0.020)");
          g.addColorStop(0.78, "rgba(115, 36, 58, 0.007)");
          g.addColorStop(1, "rgba(115, 36, 58, 0)");
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      ctx.restore();
    }

    drawMicroParticles(time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (const p of this.microParticles) {
        if (!shouldDrawParticle(this, p)) continue;
        const pulse = 0.72 + Math.sin(time * p.twinkle + p.phase) * 0.28;
        const factor = this.textFactor(p.x, p.y);
        const alphaScale = isLightTheme() ? 0.52 : 1;
        const alpha = clamp(p.alpha * pulse * factor * alphaScale, 0.05, isLightTheme() ? 0.2 : 0.46);
        ctx.fillStyle = rgba(displayColor(p), alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawTrails() {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";

      for (const p of this.particles) {
        if (!shouldDrawParticle(this, p)) continue;
        const dx = p.x - p.prevX;
        const dy = p.y - p.prevY;
        const speed = Math.hypot(dx, dy);
        if (speed < 0.06) continue;

        const angle = Math.atan2(dy, dx);
        const tail = clamp(speed * 18, 2.5, p.focus > 0.15 ? 10 : 7.5);
        const sx = p.x - Math.cos(angle) * tail;
        const sy = p.y - Math.sin(angle) * tail;
        const factor = this.textFactor(p.x, p.y);
        const alpha = clamp((0.040 + speed * 0.075 + p.focus * 0.11) * factor, 0.020, 0.18);

        const g = ctx.createLinearGradient(sx, sy, p.x, p.y);
        g.addColorStop(0, rgba(p.color, 0));
        g.addColorStop(1, rgba(displayColor(p), isLightTheme() ? alpha * 0.48 : alpha));
        ctx.strokeStyle = g;
        ctx.lineWidth = clamp(p.size * 0.40, 0.55, 1.18);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawLinks(time) {
      const ctx = this.ctx;
      const baseThreshold = isMobile() ? 82 : (this.mode === "hero" ? 105 : 104);
      const mouseRadius = this.mode === "hero" ? 250 : 235;
      const mouseRadiusSq = mouseRadius * mouseRadius;
      const mouseActive = this.mouse.active && this.mouse.inside;
      const maxThreshold = baseThreshold + 34;
      const linkCount = new Array(this.particles.length).fill(0);

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      ctx.lineWidth = isMobile() ? 0.64 : 0.82;

      for (let i = 0; i < this.particles.length; i += 1) {
        const a = this.particles[i];
        if (!shouldDrawParticle(this, a)) continue;

        for (let j = i + 1; j < this.particles.length; j += 1) {
          const b = this.particles[j];
          if (!shouldDrawParticle(this, b)) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > maxThreshold || Math.abs(dy) > maxThreshold) continue;
          const distSq = dx * dx + dy * dy;
          if (distSq > maxThreshold * maxThreshold) continue;

          const mouseDxA = a.x - this.mouse.x;
          const mouseDyA = a.y - this.mouse.y;
          const mouseDxB = b.x - this.mouse.x;
          const mouseDyB = b.y - this.mouse.y;
          const nearASq = mouseDxA * mouseDxA + mouseDyA * mouseDyA;
          const nearBSq = mouseDxB * mouseDxB + mouseDyB * mouseDyB;
          const nearestMouseSq = Math.min(nearASq, nearBSq);
          const nearMouse = mouseActive && nearestMouseSq < mouseRadiusSq;
          const threshold = nearMouse ? baseThreshold + 34 : baseThreshold;

          if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) continue;
          if (distSq > threshold * threshold) continue;
          if (this.mode === "hero" && (a.y < 88 || b.y < 88)) continue;
          if (this.mode === "hero" && !nearMouse && a.x < this.width * 0.43 && b.x < this.width * 0.43) continue;

          const sameCluster = a.clusterId >= 0 && a.clusterId === b.clusterId;
          const seedGap = Math.abs(a.linkSeed - b.linkSeed);
          if (!nearMouse) {
            if (!sameCluster && seedGap > 0.24) continue;
            if (sameCluster && seedGap > 0.58) continue;
          }

          const maxLinks = nearMouse ? 3 : 1;
          if (linkCount[i] >= maxLinks || linkCount[j] >= maxLinks) continue;

          const dist = Math.sqrt(distSq);
          const distanceAlpha = Math.pow(1 - dist / threshold, 1.18);
          const mouseBoost = nearMouse
            ? Math.pow(1 - Math.sqrt(nearestMouseSq) / mouseRadius, 0.92)
            : 0;
          const breathe = 0.72 + Math.sin(time * 0.0022 + a.phase + b.phase) * 0.28;
          let alpha = (0.028 + distanceAlpha * 0.08 + mouseBoost * 0.12) * breathe;
          alpha = clamp(alpha, nearMouse ? 0.058 : 0.020, nearMouse ? 0.20 : 0.10);
          alpha *= Math.min(this.textFactor(a.x, a.y), this.textFactor(b.x, b.y));
          if (alpha < 0.020) continue;

          const colors = isLightTheme() ? LIGHT_LINK_COLORS : LINK_COLORS;
          const color = colors[(a.clusterId + b.clusterId + 8) % colors.length];
          ctx.strokeStyle = rgba(color, isLightTheme() ? alpha * 0.42 : alpha);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          linkCount[i] += 1;
          linkCount[j] += 1;
        }
      }
      ctx.restore();
    }

    drawStars(time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      for (const p of this.particles) {
        if (!shouldDrawParticle(this, p)) continue;
        const pulse = 0.72 + Math.sin(time * 0.0042 + p.phase) * 0.34 + Math.sin(time * 0.0018 + p.phase * 2.6) * 0.12;
        const factor = this.textFactor(p.x, p.y);
        const lightScale = isLightTheme() ? 0.5 : 1;
        const alpha = clamp((p.alpha * pulse + p.focus * 0.34) * factor * lightScale, isLightTheme() ? 0.08 : 0.22, isLightTheme() ? 0.38 : 0.94);
        const radius = p.size * (1 + p.focus * 0.40 + Math.max(0, pulse - 1) * 0.13);
        const color = displayColor(p);

        const glowRadius = radius * (p.focus > 0.18 ? 8 : 5.4);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        g.addColorStop(0, rgba(color, alpha * 0.30));
        g.addColorStop(0.36, rgba(color, alpha * 0.105));
        g.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    heroParticleVisible(p) {
      return !isLightTheme() || p.themeSeed < 0.68;
    }

    drawHeroParticles(time) {
      const ctx = this.ctx;
      const light = isLightTheme();
      const glowColors = light ? LIGHT_GLOW_COLORS : DARK_GLOW_COLORS;
      ctx.save();
      ctx.globalCompositeOperation = light ? "source-over" : "screen";

      for (const p of this.particles) {
        if (!this.heroParticleVisible(p)) continue;
        const factor = this.textFactor(p.x, p.y);
        const color = light && p.kind === "petal"
          ? LIGHT_PETAL_COLOR
          : glowColors[p.colorIndex % glowColors.length];
        const pulse = p.kind === "glint"
          ? 0.86 + Math.sin(time * p.twinkle + p.phase) * 0.06
          : 0.9;
        const focusBoost = p.focus * (light ? 0.04 : 0.08);
        const alpha = clamp((p.alpha * pulse + focusBoost) * factor, 0.008, light ? 0.16 : 0.34);

        if (p.kind === "petal") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.tilt);
          ctx.strokeStyle = rgba(color, alpha * (light ? 0.24 : 0.42));
          ctx.fillStyle = rgba(color, alpha * (light ? 0.08 : 0.1));
          ctx.lineWidth = Math.max(0.45, p.size * 0.14);
          ctx.beginPath();
          ctx.moveTo(0, p.size);
          ctx.bezierCurveTo(-p.size * 0.72, p.size * 0.28, -p.size * 0.7, -p.size * 0.58, -p.size * 0.2, -p.size * 0.78);
          ctx.quadraticCurveTo(0, -p.size * 0.45, p.size * 0.2, -p.size * 0.78);
          ctx.bezierCurveTo(p.size * 0.7, -p.size * 0.58, p.size * 0.72, p.size * 0.28, 0, p.size);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          continue;
        }

        if (p.kind === "glint") {
          const radius = p.size * p.halo;
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          halo.addColorStop(0, rgba(color, alpha * 0.28));
          halo.addColorStop(0.28, rgba(color, alpha * 0.08));
          halo.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = rgba(color, alpha * (p.kind === "glint" ? 0.72 : 0.62));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "glint" ? 0.42 : 0.36), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    update(time) {
      const rawDt = time - this.lastTime;
      const dt = clamp(rawDt, 12, 34);
      this.lastTime = time;

      this.updateMicroParticles(time, dt);
      for (const p of this.particles) this.updateParticle(p, time, dt);
    }

    draw(time, shouldUpdate) {
      const ctx = this.ctx;
      if (shouldUpdate) this.update(time);

      ctx.clearRect(0, 0, this.width, this.height);
      if (this.mode === "hero") {
        this.drawHeroParticles(time);
        return;
      }
      this.drawNebula(time);
      this.drawMicroParticles(time);
      this.drawTrails();
      this.drawLinks(time);
      this.drawStars(time);
    }

    pointerToHost(event) {
      const r = this.host.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    }

    onPointerMove(event) {
      if (!finePointerQuery.matches || isMobile()) return;
      const p = this.pointerToHost(event);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height;
      this.mouse.active = this.mouse.inside;
      this.mouse.idle = false;

      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => this.triggerScatter(), 360);
    }

    onPointerLeave() {
      if (!finePointerQuery.matches || isMobile()) return;
      this.triggerScatter();
      this.mouse.inside = false;
    }
  }

  function setupScenes() {
    scenes.length = 0;

    const hero = document.getElementById("hero");
    const heroCanvas = document.getElementById("nova-particle-canvas") ||
      document.getElementById("hero-galaxy-canvas");
    if (hero && heroCanvas && !isMusicSection(hero)) {
      scenes.push(new RoseGalaxyScene(hero, heroCanvas, "hero"));
    }

    const hosts = Array.from(document.querySelectorAll(".showcase-section, .melody-page, .footer-section"))
      .filter((host) => !isMusicSection(host));

    for (const host of hosts) {
      let canvas = host.querySelector(":scope > .section-galaxy-canvas");
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "section-galaxy-canvas";
        canvas.setAttribute("aria-hidden", "true");
        host.insertBefore(canvas, host.firstChild);
      }
      const mode = host.classList.contains("footer-section") ? "footer" : "section";
      scenes.push(new RoseGalaxyScene(host, canvas, mode));
    }
  }

  function loop(time) {
    if (document.hidden) {
      rafId = 0;
      lastFrameTime = 0;
      window.__novaRoseGalaxy.rafId = 0;
      return;
    }
    if (!lastFrameTime || time - lastFrameTime >= FRAME_INTERVAL) {
      lastFrameTime = time - ((time - lastFrameTime) % FRAME_INTERVAL);
      for (const scene of scenes) {
        if (scene.visible) scene.draw(time, true);
      }
    }
    rafId = window.requestAnimationFrame(loop);
    window.__novaRoseGalaxy.rafId = rafId;
  }

  function resizeAll() {
    if (!scenes.length) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const scene of scenes) scene.resize();
    }, 120);
  }

  function restart() {
    if (reducedMotionQuery.matches) {
      destroy();
      return;
    }
    window.cancelAnimationFrame(rafId);
    rafId = 0;
    lastFrameTime = 0;
    window.__novaRoseGalaxy.rafId = 0;
    if (!scenes.length) return;
    for (const scene of scenes) scene.resize();
    rafId = window.requestAnimationFrame(loop);
    window.__novaRoseGalaxy.rafId = rafId;
  }

  function handleVisibility() {
    if (!reducedMotionQuery.matches && !document.hidden && !rafId && scenes.length) {
      lastFrameTime = 0;
      rafId = window.requestAnimationFrame(loop);
      window.__novaRoseGalaxy.rafId = rafId;
    }
  }

  function destroy() {
    window.cancelAnimationFrame(rafId);
    window.clearTimeout(resizeTimer);
    rafId = 0;
    resizeTimer = 0;
    lastFrameTime = 0;
    scenes.splice(0).forEach((scene) => scene.destroy());
    window.__novaRoseGalaxy.running = false;
    window.__novaRoseGalaxy.rafId = 0;
  }

  function init() {
    if (reducedMotionQuery.matches) {
      destroy();
      return;
    }
    const hero = document.getElementById("hero");
    if (
      scenes.length &&
      scenes.some((scene) => scene.host === hero) &&
      scenes.every((scene) => scene.host.isConnected)
    ) {
      return;
    }
    destroy();
    setupScenes();
    if (!scenes.length) return;
    window.__novaRoseGalaxy.running = true;
    lastFrameTime = 0;
    rafId = window.requestAnimationFrame(loop);
    window.__novaRoseGalaxy.rafId = rafId;
  }

  const syncTheme = () => {
    if (!window.document?.documentElement) return;
    destroy();
    init();
  };

  const themeObserver = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "data-theme")) syncTheme();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  window.__novaRoseGalaxy = { running: false, rafId: 0, init, destroy, syncTheme };
  window.addEventListener("resize", resizeAll, { passive: true });
  document.addEventListener("visibilitychange", handleVisibility);
  document.addEventListener("pjax:send", destroy);
  document.addEventListener("pjax:complete", init);

  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", () => {
      if (reducedMotionQuery.matches) destroy();
      else init();
    });
  } else if (reducedMotionQuery.addListener) {
    reducedMotionQuery.addListener(() => {
      if (reducedMotionQuery.matches) destroy();
      else init();
    });
  }

  init();
})();
