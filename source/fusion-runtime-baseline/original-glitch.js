(function (root) {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const rgba = (color, alpha) => `rgba(${color.join(',')},${Math.max(0, Math.min(1, alpha))})`;

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ result >>> 15, result | 1);
      result ^= result + Math.imul(result ^ result >>> 7, result | 61);
      return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
  }

  class OriginalGlitchRenderer {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.phase = 0;
      this.lastNow = 0;
      this.lastEventId = 0;
      this.fragments = [];
      this.chromaticUntil = 0;
      this.chromaticStrength = 0;
      this.history = [];
      this.historyIndex = 0;
      this.captureCounter = 0;
      this.levels = [];
      this.ribbonLevels = [];
      this.highLevels = [];
      this.prismRotation = 0;
    }

    reset() {
      this.fragments.length = 0;
      this.lastEventId = 0;
      this.chromaticUntil = 0;
      this.chromaticStrength = 0;
      this.levels.length = 0;
      this.ribbonLevels.length = 0;
      this.highLevels.length = 0;
      this.prismRotation = 0;
      for (const frame of this.history) frame.ctx.clearRect(0, 0, frame.canvas.width, frame.canvas.height);
    }

    resize(width, height) {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      if (nextWidth === this.width && nextHeight === this.height) return;
      this.width = nextWidth;
      this.height = nextHeight;
      const scale = Math.min(.62, 960 / nextWidth);
      const memoryWidth = Math.max(240, Math.round(nextWidth * scale));
      const memoryHeight = Math.max(160, Math.round(nextHeight * scale));
      this.history = Array.from({ length: 8 }, () => {
        const canvas = document.createElement('canvas');
        canvas.width = memoryWidth;
        canvas.height = memoryHeight;
        return { canvas, ctx: canvas.getContext('2d', { alpha: false }), valid: false };
      });
      this.historyIndex = 0;
      this.fragments.length = 0;
    }

    getHistory(offset = 1) {
      if (!this.history.length) return null;
      const index = (this.historyIndex - Math.max(1, offset) + this.history.length) % this.history.length;
      return this.history[index]?.valid ? this.history[index].canvas : null;
    }

    capture(canvas) {
      if (!this.history.length || ++this.captureCounter % 4 !== 0) return;
      const frame = this.history[this.historyIndex];
      frame.ctx.globalAlpha = 1;
      frame.ctx.filter = 'none';
      frame.ctx.drawImage(canvas, 0, 0, frame.canvas.width, frame.canvas.height);
      frame.valid = true;
      this.historyIndex = (this.historyIndex + 1) % this.history.length;
    }

    spawnEvent(event, width, height) {
      if (!event || event.id === this.lastEventId) return;
      this.lastEventId = event.id;
      const random = mulberry32(event.seed);
      const countBase = event.type === 'rupture' ? 12 : event.type === 'sort' ? 11 : 8;
      const count = Math.round(countBase * (.55 + event.strength));
      for (let index = 0; index < count; index++) {
        let x = 0;
        let y = random() * height;
        let fragmentWidth = width;
        let fragmentHeight = 5 + random() * (18 + height * .07 * event.strength);
        let dx = event.direction * (18 + random() * width * (.04 + event.strength * .12));
        let dy = (random() * 2 - 1) * 8;

        if (event.type === 'sort') {
          fragmentWidth = width * (.06 + random() * .22);
          fragmentHeight = height * (.05 + random() * .2);
          x = random() * Math.max(1, width - fragmentWidth);
          y = random() * Math.max(1, height - fragmentHeight);
          dx *= 1.4;
          dy *= 2.2;
        } else if (event.type === 'chromatic') {
          fragmentHeight = height * (.08 + random() * .28);
          y = random() * Math.max(1, height - fragmentHeight);
          dx *= 1.7;
          this.chromaticUntil = event.at + event.duration * 1.25;
          this.chromaticStrength = event.strength;
        } else if (event.type === 'block') {
          fragmentWidth = width * (.24 + random() * .62);
          x = random() * Math.max(1, width - fragmentWidth);
          fragmentHeight = 12 + random() * height * .12;
          dx *= 1.25;
        } else if (event.type === 'rupture' && random() > .72) {
          fragmentWidth = width * (.08 + random() * .34);
          fragmentHeight = height * (.035 + random() * .16);
          x = random() * Math.max(1, width - fragmentWidth);
          y = random() * Math.max(1, height - fragmentHeight);
          dx *= 1.6;
          dy *= 3;
        }

        this.fragments.push({
          x,
          y,
          width: fragmentWidth,
          height: fragmentHeight,
          dx,
          dy,
          bornAt: event.at,
          duration: event.duration * (.55 + random() * .85),
          memoryOffset: 1 + Math.floor(random() * Math.max(1, this.history.length - 1)),
          hue: (random() * 2 - 1) * (20 + event.strength * 110),
          alpha: .12 + random() * .38,
          seed: Math.floor(random() * 10000)
        });
      }
      if (this.fragments.length > 110) this.fragments.splice(0, this.fragments.length - 110);
    }

    drawBackground(ctx, palette, mapping) {
      const width = this.width;
      const height = this.height;
      const glowX = width * (.5 + (mapping.source.centroid - .5) * .16);
      const glowY = height * (.48 - mapping.tension * .09);
      const background = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * .76);
      const lifted = palette.dark.map(value => Math.min(255, value + 3 + mapping.arousal * 12));
      background.addColorStop(0, rgba(lifted, .95));
      background.addColorStop(.46, rgba(palette.dark, .72));
      background.addColorStop(1, 'rgba(2,3,8,1)');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      if (mapping.arousal > .035) {
        const aura = ctx.createRadialGradient(width * .5, height * .66, 0, width * .5, height * .66, Math.min(width, height) * .54);
        aura.addColorStop(0, rgba(palette.main, .025 + mapping.arousal * .075));
        aura.addColorStop(1, rgba(palette.main, 0));
        ctx.fillStyle = aura;
        ctx.fillRect(0, 0, width, height);
      }
    }

    traceOpen(ctx, points) {
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 0; index < points.length - 1; index++) {
        const p0 = points[Math.max(0, index - 1)];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[Math.min(points.length - 1, index + 2)];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y
        );
      }
    }

    traceClosed(ctx, points, tension = .78) {
      if (points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let index = 0; index < points.length; index++) {
        const p0 = points[(index - 1 + points.length) % points.length];
        const p1 = points[index];
        const p2 = points[(index + 1) % points.length];
        const p3 = points[(index + 2) % points.length];
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6 * tension,
          p1.y + (p2.y - p0.y) / 6 * tension,
          p2.x - (p3.x - p1.x) / 6 * tension,
          p2.y - (p3.y - p1.y) / 6 * tension,
          p2.x,
          p2.y
        );
      }
      ctx.closePath();
    }

    sampleRange(spectrumValue, from, to, position, total = 144) {
      const normalized = from + (to - from) * clamp(position);
      return spectrumValue(Math.min(total - 1, Math.max(0, Math.floor(normalized * total))), total);
    }

    drawBassAtmosphere(ctx, palette, mapping) {
      const width = this.width;
      const height = this.height;
      const bass = mapping.source.bass;
      const centerX = width * (.5 + (mapping.source.centroid - .5) * .08);
      const centerY = height * .67;
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * (.35 + bass * .24));
      glow.addColorStop(0, rgba(palette.main, .035 + bass * .13));
      glow.addColorStop(.45, rgba(palette.hot, .012 + bass * .035));
      glow.addColorStop(1, rgba(palette.dark, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let ring = 0; ring < 4; ring++) {
        const radius = Math.min(width, height) * (.2 + ring * .095 + bass * .055);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radius * 1.72, radius * (.34 + ring * .035), 0, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(ring % 2 ? palette.hot : palette.main, .025 + bass * (.075 - ring * .009));
        ctx.lineWidth = .7 + bass * 1.2;
        ctx.shadowColor = rgba(palette.main, .35);
        ctx.shadowBlur = 8 + bass * 25;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawMidPrism(ctx, palette, mapping, spectrumValue, dt) {
      const width = this.width;
      const height = this.height;
      const minSize = Math.min(width, height);
      const orchestration = mapping.orchestration || 0;
      const mid = mapping.source.mid;
      const pointCount = 168;
      const petals = 7 + Math.round(orchestration * 4);
      this.prismRotation += dt * (.018 + mid * .045 + mapping.orchestrationSurge * .09);
      const cx = width * (.5 + (mapping.source.centroid - .5) * .12);
      const cy = height * .48;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.prismRotation);
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let layer = 0; layer < 5; layer++) {
        const points = [];
        for (let index = 0; index < pointCount; index++) {
          const t = index / pointCount;
          const angle = t * Math.PI * 2;
          const value = this.sampleRange(spectrumValue, .34, .7, t);
          const petalPhase = .5 - .5 * Math.cos(angle * petals + layer * .11);
          const petal = petalPhase * petalPhase * (3 - 2 * petalPhase);
          const base = minSize * (.105 + layer * .025 + orchestration * .035);
          const harmonic = Math.sin(angle * 3 - this.phase * 2.1 + layer * .83) * minSize * (.004 + mid * .009);
          const radius = base
            + petal * minSize * (.032 + mid * .075 + orchestration * .03)
            + value * minSize * (.012 + mid * .035)
            + harmonic;
          points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
        }
        this.traceClosed(ctx, points);
        const color = layer % 2 ? palette.hot : palette.main;
        ctx.strokeStyle = rgba(color, .075 + orchestration * .12 + layer * .026);
        ctx.lineWidth = .65 + layer * .12 + mid * .75;
        ctx.shadowColor = rgba(color, .6);
        ctx.shadowBlur = 5 + mid * 18 + mapping.tension * 10;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawStringRibbons(ctx, palette, mapping, spectrumValue) {
      const width = this.width;
      const height = this.height;
      const orchestration = mapping.orchestration || 0;
      const count = 3 + Math.round(orchestration * 6);
      const pointsPerRibbon = width < 900 ? 56 : 78;
      const pad = width * .045;
      const usable = width - pad * 2;
      const required = count * pointsPerRibbon;
      while (this.ribbonLevels.length < required) this.ribbonLevels.push(0);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let ribbon = 0; ribbon < count; ribbon++) {
        const points = [];
        const center = height * (.25 + ribbon / Math.max(1, count - 1) * .5);
        for (let point = 0; point < pointsPerRibbon; point++) {
          const t = point / (pointsPerRibbon - 1);
          const raw = this.sampleRange(spectrumValue, .28, .82, t);
          const slot = ribbon * pointsPerRibbon + point;
          const previous = this.ribbonLevels[slot] || 0;
          this.ribbonLevels[slot] = previous + (raw - previous) * (raw > previous ? .22 : .055);
          const level = this.ribbonLevels[slot];
          const carrier = Math.sin(t * Math.PI * (2.15 + ribbon * .17) + this.phase * (1.1 + ribbon * .08) + ribbon * .92);
          const counter = Math.sin(t * Math.PI * .86 - this.phase * .62 + ribbon * 1.37) * .42;
          const frequencyShape = (level - .28) * height * (.055 + mapping.source.mid * .075) * (ribbon % 2 ? -1 : 1);
          points.push({
            x: pad + t * usable,
            y: center + (carrier + counter) * height * (.018 + mapping.source.bass * .025 + orchestration * .012) + frequencyShape
          });
        }
        this.traceOpen(ctx, points);
        const color = ribbon % 2 ? palette.hot : palette.main;
        ctx.strokeStyle = rgba(color, .16 + orchestration * .27 - ribbon * .009);
        ctx.lineWidth = .75 + mapping.source.mid * 1.35;
        ctx.shadowColor = rgba(color, .72);
        ctx.shadowBlur = 7 + mapping.source.mid * 21 + orchestration * 9;
        ctx.stroke();
        ctx.globalAlpha = .16 + orchestration * .16;
        ctx.lineWidth = 5 + mapping.source.bass * 8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    drawHighSpectrum(ctx, palette, mapping, spectrumValue) {
      const width = this.width;
      const height = this.height;
      const bars = Math.max(72, Math.min(156, Math.floor(width / 9)));
      while (this.highLevels.length < bars) this.highLevels.push(0);
      if (this.highLevels.length > bars) this.highLevels.length = bars;
      const treble = mapping.source.treble;
      const surge = mapping.orchestrationSurge || 0;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let index = 0; index < bars; index++) {
        const t = index / Math.max(1, bars - 1);
        const raw = this.sampleRange(spectrumValue, .67, 1, t);
        const previous = this.highLevels[index] || 0;
        this.highLevels[index] = previous + (raw - previous) * (raw > previous ? .58 : .16);
        const value = this.highLevels[index];
        const edgeFade = Math.sin(t * Math.PI);
        const length = (5 + value * height * (.13 + treble * .18) + surge * height * .035) * (.38 + edgeFade * .62);
        const x = t * width;
        const alpha = .035 + value * (.25 + treble * .34);
        ctx.strokeStyle = rgba(index % 7 === 0 ? palette.hot : palette.main, alpha);
        ctx.lineWidth = index % 9 === 0 ? 1.15 : .55;
        ctx.shadowColor = rgba(palette.hot, .48);
        ctx.shadowBlur = value > .42 ? 7 + treble * 10 : 0;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, length);
        ctx.moveTo(width - x, height);
        ctx.lineTo(width - x, height - length * .42);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawTemporalFeedback(ctx, mapping, now) {
      const source = this.getHistory(mapping.state === 'AFTERMATH' ? 2 : 1);
      if (!source) return;
      if (mapping.state !== 'AFTERMATH' && mapping.state !== 'SUSPENSION') return;
      const strength = mapping.state === 'AFTERMATH' ? .055 + mapping.tension * .11 : .025 + mapping.tension * .06;
      const scale = 1.003 + mapping.tension * .009;
      const width = this.width * scale;
      const height = this.height * scale;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = strength;
      ctx.filter = `hue-rotate(${Math.sin(now * .0002) * 8}deg)`;
      ctx.drawImage(source, (this.width - width) * .5, (this.height - height) * .5, width, height);
      ctx.restore();
    }

    drawFragments(ctx, mapping, now) {
      const scaleX = this.history[0]?.canvas.width / Math.max(1, this.width) || 1;
      const scaleY = this.history[0]?.canvas.height / Math.max(1, this.height) || 1;
      ctx.save();
      for (let index = this.fragments.length - 1; index >= 0; index--) {
        const fragment = this.fragments[index];
        const age = now - fragment.bornAt;
        const life = 1 - age / fragment.duration;
        if (life <= 0) {
          this.fragments.splice(index, 1);
          continue;
        }
        const source = this.getHistory(fragment.memoryOffset);
        if (!source) continue;
        const envelope = Math.sin(Math.min(1, age / Math.max(1, fragment.duration)) * Math.PI);
        const corrosion = mapping.layers.corrosion || 0;
        const motion = envelope * (fragment.dx * (.45 + mapping.layers.destruction + corrosion * .34));
        ctx.globalAlpha = fragment.alpha * Math.pow(life, .7) * (.45 + mapping.arousal * .55);
        // Screen compositing keeps the fracture luminous; source-over copied the
        // dark background too and produced ugly opaque rectangles.
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = `hue-rotate(${fragment.hue * envelope + corrosion * 42}deg) saturate(${1 + mapping.source.density * 1.6 + corrosion * .8}) contrast(${1 + mapping.tension * .55})`;
        try {
          ctx.drawImage(
            source,
            fragment.x * scaleX,
            fragment.y * scaleY,
            fragment.width * scaleX,
            fragment.height * scaleY,
            fragment.x + motion,
            fragment.y + fragment.dy * envelope,
            fragment.width,
            fragment.height
          );
        } catch (_) {}
      }
      ctx.restore();
    }

    drawChromaticMemory(ctx, mapping, now) {
      const corrosion = mapping.layers.corrosion || 0;
      const eventLife = now < this.chromaticUntil ? clamp((this.chromaticUntil - now) / 1500) : 0;
      const strength = Math.max(this.chromaticStrength * eventLife, corrosion);
      if (strength < .025) return;
      const offset = 1.5 + strength * 23;
      const red = this.getHistory(1);
      const cyan = this.getHistory(3);
      if (!red || !cyan) return;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .018 + strength * .115;
      ctx.filter = 'sepia(1) saturate(9) hue-rotate(285deg)';
      ctx.drawImage(red, -offset, 0, this.width, this.height);
      ctx.filter = 'sepia(1) saturate(9) hue-rotate(90deg)';
      ctx.drawImage(cyan, offset, 0, this.width, this.height);
      ctx.restore();
    }

    drawNoiseLayer(ctx, palette, mapping, frame) {
      const noise = clamp(mapping.layers.noise + (mapping.layers.corrosion || 0) * .22);
      if (noise < .008) return;
      const width = this.width;
      const height = this.height;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const lines = Math.round(3 + noise * 45);
      for (let index = 0; index < lines; index++) {
        const hash = Math.abs(Math.sin((frame + 1) * 12.9898 + index * 78.233));
        const y = (hash * 43758.5453 % 1) * height;
        const lineWidth = width * (.08 + ((hash * 31.7) % 1) * .72);
        const x = ((hash * 17.2) % 1) * Math.max(1, width - lineWidth);
        ctx.globalAlpha = .018 + noise * .12;
        ctx.fillStyle = index % 4 ? rgba(palette.main, 1) : rgba(palette.hot, 1);
        ctx.fillRect(x, y, lineWidth, index % 5 === 0 ? 2 : .65);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = .035 + noise * .08;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      for (let y = frame % 3; y < height; y += 4) ctx.fillRect(0, y, width, 1);
      ctx.restore();
    }

    draw(options) {
      const { ctx, canvas, width, height, palette, mapping, spectrumValue, frame, now = performance.now() } = options;
      this.resize(width, height);
      const dt = this.lastNow ? Math.min(.08, Math.max(0, (now - this.lastNow) / 1000)) : 1 / 60;
      this.lastNow = now;
      const speed = mapping.state === 'SILENCE' ? 0 : mapping.state === 'SUSPENSION' ? .05 : .16 + mapping.arousal * .52;
      this.phase += dt * speed;
      this.spawnEvent(mapping.event, width, height);
      this.drawBackground(ctx, palette, mapping);
      this.drawTemporalFeedback(ctx, mapping, now);
      this.drawBassAtmosphere(ctx, palette, mapping);
      this.drawMidPrism(ctx, palette, mapping, spectrumValue, dt);
      this.drawStringRibbons(ctx, palette, mapping, spectrumValue);
      this.drawHighSpectrum(ctx, palette, mapping, spectrumValue);
      this.drawFragments(ctx, mapping, now);
      this.drawChromaticMemory(ctx, mapping, now);
      this.drawNoiseLayer(ctx, palette, mapping, frame);
      this.capture(canvas);
    }
  }

  root.SmokeResonanceOriginalGlitch = Object.freeze({
    create: () => new OriginalGlitchRenderer()
  });
})(window);
