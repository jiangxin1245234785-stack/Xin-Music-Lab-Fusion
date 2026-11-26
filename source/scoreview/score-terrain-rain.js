(() => {
  'use strict';

  const root = globalThis;
  const baseUrl = typeof document === 'object' && document.currentScript?.src
    ? new URL('assets/terrain-weather/', document.currentScript.src) : null;
  const names = ['cloud-thin', 'cloud-low'];
  const materials = new Map();
  let loadingMaterials;
  let loadingBundle;
  let warmingMaterials;
  let graphics;
  let preparingGraphics;
  let preparingWeather;
  // A later graphics failure leaves the already-loaded 2D exterior available.
  let exteriorReady = false;
  let canRecoverGraphics = true;
  const sessions = new WeakMap();

  function loadBitmap(name) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error('Missing weather material: ' + name));
      image.src = new URL(name + '.png', baseUrl).href;
    });
  }

  function loadBundle() {
    if (typeof root.RaindropFX === 'function') return Promise.resolve(root.RaindropFX);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('vendor/raindrop-fx/bundle/index.js', baseUrl).href;
      script.onload = () => typeof root.RaindropFX === 'function'
        ? resolve(root.RaindropFX) : reject(Error('Raindrop FX did not load'));
      script.onerror = () => reject(Error('Missing Raindrop FX bundle'));
      document.head.append(script);
    });
  }

  function loadMaterials() {
    if (!baseUrl) return Promise.resolve(false);
    loadingMaterials ??= Promise.all(names.map(loadBitmap)).then(images => {
      names.forEach((name, index) => materials.set(name, images[index]));
      warmingMaterials = warmValleyMaterials().then(() => exteriorReady = true).catch(error => {
        console.warn('Terrain weather: exterior unavailable', error);
        return false;
      });
      return true;
    }).catch(error => {
      console.warn(error);
      return false;
    });
    return loadingMaterials;
  }

  function ready() {
    if (!baseUrl) return Promise.resolve(false);
    prepareGraphics();
    return loadMaterials().then(loaded => loaded && warmingMaterials);
  }

  const clamp = n => Math.max(0, Math.min(1, n));
  function ease(n) {
    const p = clamp(n);
    return p * p * (3 - 2 * p);
  }

  // Instantaneous precipitation can rise before the slower musical storm envelope catches up.
  function weatherStrength(weather) {
    const amount = Number.isFinite(weather?.intensity) ? clamp(weather.intensity) : 0;
    const storm = Number.isFinite(weather?.stormDrive) ? clamp(weather.stormDrive) : amount;
    return .55 * amount + .45 * storm;
  }

  function strengthRamp(strength, start, full) {
    return ease((strength - start) / (full - start));
  }

  const lights = new WeakMap();
  function overcastLight(base) {
    const existing = lights.get(base);
    if (existing) return existing;
    const mix = (a, b, p) => a.map((value, i) => value + (b[i] - value) * p);
    const haze = mix(base.haze, [171, 182, 178], .56);
    const sky = [[72, 89, 110], [103, 122, 138], [155, 168, 172], [186, 185, 167]];
    const output = {
      ...base, name: base.name + ' · overcast', weatherOvercast: true,
      sky: base.sky.map(([at, color], i) => [at, mix(sky[i], color, .15)]),
      glow: {...base.glow, c: mix(base.glow.c, [177, 179, 170], .8), a: .2},
      virga: {...base.virga, a: 0},
      haze,
      light: mix(base.light, [189, 188, 168], .48),
      shade: mix(base.shade, [53, 64, 70], .35),
      band: {c: mix(base.band.c, haze, .56), a: .37},
      air: {c: mix(base.air.c, haze, .52), a: .10},
      litK: base.litK * .83,
      castA: base.castA * .68,
    };
    lights.set(base, output);
    return output;
  }

  function drawMaterial(ctx, key, x, y, w, h, opacity) {
    const image = materials.get(key);
    if (!image || opacity <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(opacity);
    ctx.drawImage(image, x, y, w, h);
    ctx.restore();
  }

  const stormClouds = new Map();
  function stormCloud(key) {
    if (stormClouds.has(key)) return stormClouds.get(key);
    const source = materials.get(key);
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const g = canvas.getContext('2d');
    g.filter = 'brightness(.56) contrast(1.08) saturate(.69)';
    g.drawImage(source, 0, 0);
    stormClouds.set(key, canvas);
    return canvas;
  }

  // Intra-cloud distant sheet lightning: soft radial cloud-belly bloom + subtle sky backlight + faint veiled
  // upper-cloud filament on primary peak, drawn behind the dark foreground storm cloud deck for silhouette contrast.
  function drawSheetLightning(ctx, L, weather) {
    const fl = weather?.lightning;
    const flash = fl && Number.isFinite(fl.intensity) ? clamp(fl.intensity) : 0;
    if (flash <= .01) return;
    const primary = Number.isFinite(fl.primary) ? clamp(fl.primary) : 0;
    const xNorm = Number.isFinite(fl.xNorm) ? clamp(fl.xNorm) : .5;
    const idx = Number.isFinite(fl.index) ? fl.index : 0;
    const cx = L.left + xNorm * L.Wm;
    const cy = 278;

    ctx.save();
    // 1. Soft horizon & upper-sky cool silver-blue backlight (pops distant mountain peaks into crisp silhouette).
    const wash = ctx.createLinearGradient(0, 130, 0, 540);
    wash.addColorStop(0, 'rgba(182,214,252,' + (.26 * flash).toFixed(4) + ')');
    wash.addColorStop(.52, 'rgba(196,224,255,' + (.19 * flash).toFixed(4) + ')');
    wash.addColorStop(1, 'rgba(196,224,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(L.left, 130, L.Wm, 410);

    // 2. Broad elliptical intra-cloud sheet bloom centered in the distant thundercloud pocket.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(2.25, 1);
    const bloom = ctx.createRadialGradient(0, 0, 12, 0, 0, 235);
    bloom.addColorStop(0, 'rgba(236,247,255,' + (.76 * flash).toFixed(4) + ')');
    bloom.addColorStop(.32, 'rgba(186,218,252,' + (.46 * flash).toFixed(4) + ')');
    bloom.addColorStop(.72, 'rgba(130,170,220,' + (.16 * flash).toFixed(4) + ')');
    bloom.addColorStop(1, 'rgba(130,170,220,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(-240, -240, 480, 480);
    ctx.restore();

    // 3. Delicate diffused intra-cloud vein shimmer (only on primary peak, veiled inside upper cloud bank).
    if (primary > .34) {
      const a = clamp((primary - .34) / .66);
      const pts = [[cx, 174]];
      let px = cx, py = 174;
      for (let s = 1; s <= 5; s++) {
        const sign = ((s + idx) % 2 === 0 ? 1 : -1);
        const step = 12 + Math.abs(Math.sin((idx + 1) * 19.7 + s * 11.3)) * 24;
        px += sign * step;
        py += 22 + (s % 2) * 10;
        pts.push([px, py]);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Wide soft cloud-diffused glow around the vein.
      ctx.strokeStyle = 'rgba(202,230,255,' + (.20 * a).toFixed(4) + ')';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
      ctx.stroke();
      // Subtle translucent inner filament + short cloud branch.
      ctx.strokeStyle = 'rgba(240,249,255,' + (.30 * a).toFixed(4) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
      const br = pts[2], dir = idx % 2 === 0 ? 1 : -1;
      ctx.moveTo(br[0], br[1]);
      ctx.lineTo(br[0] + dir * 20, br[1] + 18);
      ctx.lineTo(br[0] + dir * 32, br[1] + 38);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSky(ctx, L, t, weather) {
    const rain = weather.farRain || 0;
    const storm = weather.stormDrive || 0;
    const tension = Number.isFinite(weather.tension) ? weather.tension : .5;
    const ceiling = clamp((.32 * ease((rain - .12) / .7) + .68 * storm) * (.82 + .36 * tension));
    const drift = Math.sin(windTravel(weather, t, .57) * .04);
    const x = L.left - (.17 + .15 * drift) * L.Wm;
    const w = 1.46 * L.Wm;
    const lowX = L.left - (.16 + .15 * drift) * L.Wm;
    const lowW = 1.42 * L.Wm;
    // Cool the light beneath the moving ceiling. The brighter opening near the
    // horizon is left to the terrain and the valley-specific rain volumes.
    const sky = ctx.createLinearGradient(0, 130, 0, 575);
    sky.addColorStop(0, 'rgba(29,43,61,' + (.78 * ceiling) + ')');
    sky.addColorStop(.47, 'rgba(31,49,67,' + (.63 * ceiling) + ')');
    sky.addColorStop(.81, 'rgba(55,72,88,' + (.31 * ceiling) + ')');
    sky.addColorStop(1, 'transparent');
    ctx.fillStyle = sky;
    ctx.fillRect(L.left, 130, L.Wm, 445);

    drawMaterial(ctx, 'cloud-thin', x, 90, w, 319, .68 - .23 * storm);
    drawMaterial(ctx, 'cloud-low', lowX, 160, lowW, 320, .60 - .30 * storm);
    drawSheetLightning(ctx, L, weather);
    if (ceiling < .003) return;
    const thin = stormCloud('cloud-thin');
    const low = stormCloud('cloud-low');
    if (!thin || !low) return;
    ctx.save();
    ctx.globalAlpha *= .76 * ceiling;
    ctx.drawImage(thin, x - .10 * L.Wm, 93 + 7 * storm, w * 1.18, 336 + 52 * storm);
    ctx.globalAlpha *= .93;
    const foregroundX = L.left - (.20 + .18 * Math.sin(windTravel(weather, t, .57) * .087 + .7)) * L.Wm;
    ctx.drawImage(low, foregroundX, 151 + 32 * storm, lowW * 1.11, 321 + 50 * storm);
    ctx.restore();
  }

  function drawStormLight(ctx, L, storm, tension = .5, flash = 0) {
    const moody = clamp(storm * (.74 + .52 * (Number.isFinite(tension) ? tension : .5)));
    const tint = ctx.createLinearGradient(0, 611, 0, 832);
    tint.addColorStop(0, 'transparent');
    tint.addColorStop(.38, 'rgba(61,70,63,' + (.36 * moody) + ')');
    tint.addColorStop(.74, 'rgba(50,67,65,' + (.62 * moody) + ')');
    tint.addColorStop(1, 'rgba(66,76,68,' + (.53 * moody) + ')');
    ctx.fillStyle = tint;
    ctx.fillRect(L.left, 611, L.Wm, 221);
    if (flash > .01) {
      const sheen = ctx.createLinearGradient(0, 380, 0, 832);
      sheen.addColorStop(0, 'rgba(198,224,252,0)');
      sheen.addColorStop(.45, 'rgba(198,224,252,' + (.11 * flash).toFixed(4) + ')');
      sheen.addColorStop(.78, 'rgba(182,212,246,' + (.07 * flash).toFixed(4) + ')');
      sheen.addColorStop(1, 'rgba(182,212,246,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(L.left, 380, L.Wm, 452);
    }
  }

  const RAIN_WIDTH = 790;
  const CLOUD_TOP = 248;
  const VALLEY_VARIANTS = 7;
  const rasterCache = new Map();
  const rasterWork = new Map();
  let flowScratch;
  const opticalAlpha = depth => -Math.expm1(-depth);

  function valueNoise(grid, x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = ease(x - x0), fy = ease(y - y0);
    const k = (x0 & 31) + 32 * (y0 & 31);
    const nextX = ((x0 + 1) & 31) + 32 * (y0 & 31);
    const a = grid[k] + (grid[nextX] - grid[k]) * fx;
    const b = grid[(k + 32) & 1023] + (grid[(nextX + 32) & 1023] - grid[(k + 32) & 1023]) * fx;
    return a + (b - a) * fy;
  }

  function gaussian(x) {
    return Math.exp(-x * x);
  }

  function materialCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return {canvas, ctx, image: ctx.createImageData(width, height)};
  }

  function* fallingTexture(width, height, grid) {
    const period = height * 5;
    const texture = materialCanvas(width, period);
    const pixels = texture.image.data;
    for (let row = 0; row < period; row++) {
      const y = row / period * 32;
      for (let col = 0; col < width; col++) {
        const x = col / width * 32;
        const warp = valueNoise(grid, x + 12, y * 2);
        const coarse = valueNoise(grid, x + .53 * warp, y);
        const detail = valueNoise(grid, x * 2 + .62 * warp, y * 2 + 5);
        const shade = (coarse - .5) * .78 + (detail - .5) * .22;
        const k = (row * width + col) * 4;
        const light = shade > 0 ? 154 : 72;
        pixels[k] = light - 7;
        pixels[k + 1] = light + 2;
        pixels[k + 2] = light + 10;
        pixels[k + 3] = 255 * ease((Math.abs(shade) - .05) / .41) * .29;
      }
      if ((row & 15) === 15) yield;
    }
    texture.ctx.putImageData(texture.image, 0, 0);
    return texture.canvas;
  }
  // A small cached projection of three overlapping rain volumes. Optical depth
  // mixes toward diffuse cloud-shadow color, with less extinction in the gaps.
  // Only broad variation remains visible across a valley. Wind bends the density
  // within it, and both the source cloud and the rain use this same projection.
  function* buildValleyRaster(variant) {
    const width = 288, height = 176;
    const random = randomStream(0x32f197 + 1779 * variant);
    const grid = Float32Array.from({length: 1024}, () => random());
    const cells = [
      {x: -.52, spread: .245, weight: .83, fall: .87},
      {x: -.15, spread: .21, weight: 1.42, fall: 1.02},
      {x: .44, spread: .25, weight: .92, fall: .93},
    ].map(cell => ({
      ...cell,
      x: cell.x + (random() - .5) * .13,
      weight: cell.weight * (.83 + random() * .34),
      fall: cell.fall + (random() - .5) * .15,
    }));
    const veil = materialCanvas(width, height);
    const stormVeil = materialCanvas(width, height);
    const cloud = materialCanvas(width, height);
    const flow = materialCanvas(width, height);
    const V = veil.image.data, S = stormVeil.image.data;
    const C = cloud.image.data, F = flow.image.data;
    for (let j = 0; j < height; j++) {
      const y = j / (height - 1);
      for (let i = 0; i < width; i++) {
        const x = (i / (width - 1) - .5) * 2, k = (j * width + i) * 4;
        const broad = valueNoise(grid, x * 4.6 + 10, y * 3.9 + 7);
        const curl = valueNoise(grid, x * 7.3 + 16, y * 2.8 + 17);
        const flecks = valueNoise(grid, x * 24 + 14, y * 16 + 18);
        const grain = (random() - .5) * 7;
        const root = .24 + (broad - .5) * .105 + (curl - .5) * .047;
        const wind = .065 * (y - root) + .135 * ease((y - .65) / .29) + (curl - .5) * .074;
        const horizontalFade = ease((1 - Math.abs(x)) / .25);
        const fiber = valueNoise(grid, (x + wind) * 13.4 + 4, y * 2.9 + 25);
        let depth = 0;
        for (const cell of cells) {
          const offset = (x + wind - cell.x) / (cell.spread * (.83 + .37 * y));
          const reach = cell.fall + .071 * (broad - .5) + .036 * (curl - .5);
          const floor = ease((reach - y) / .245);
          depth += gaussian(offset) * cell.weight * floor;
        }
        const curtain = ease((y - root + .070) / .14);
        const stroke = 1 - .75 * ease((y - .62) / .32);
        // The core falls from the shelf and bends downwind as it reaches the
        // valley. A thinner patch in its lee lets the warm range show through.
        const drop = ease((y - root) / .62);
        const bend = .10 * drop + .19 * drop * drop + .035 * (curl - .5);
        const coreX = x + bend + .105;
        const wingX = x + .68 * bend - .41;
        const core = ease((coreX + .28) / .21) * ease((.23 - coreX) / .15);
        const wing = ease((wingX + .26) / .21) * ease((.22 - wingX) / .15);
        const clearLane = gaussian((coreX - .31) / .15);
        const overlap = 1 + .18 * core + .12 * wing - .23 * clearLane;
        const densityVariation = overlap * (.33 + .81 * broad + .19 * curl + .33 * stroke * fiber + .065 * flecks);
        const foot = ease((y - .66) / .36);
        const scud = .36 * gaussian((y - .88 - .042 * curl) / .068) *
          gaussian((x + .24 - .09 * broad) / .62) * ease((1 - y) / .12);
        const opacity = opticalAlpha(horizontalFade * ease((1 - y) / .10) * (1.65 * depth * curtain * densityVariation + scud));
        const light = 116 + 19 * foot + 15 * (broad - .5) + 6 * stroke * (fiber - .5) + grain - 9 * core + 6 * wing;
        V[k] = light - 7; V[k + 1] = light + 5; V[k + 2] = light + 13 - 5 * foot;
        V[k + 3] = 255 * opacity;
        S[k] = light * .76 - 5; S[k + 1] = light * .80 + 3; S[k + 2] = light * .83 + 8;
        S[k + 3] = 255 * opticalAlpha(horizontalFade * ease((1 - y) / .12) *
          (2.25 * depth * curtain * densityVariation * (.62 + .26 * broad + .16 * curl) + .75 * scud));
        const wisps = Math.max(gaussian((coreX + .19) / .14), gaussian((wingX - .13) / .13));
        F[k + 3] = 255 * Math.sqrt(opacity) * (.21 + .79 * wisps);

        const canopy = gaussian((x + .08) / .64) * (.62 + .52 * broad + .11 * curl);
        const crest = .015 + .071 * (broad - .5) + .039 * (curl - .5);
        const shelf = ease((y - crest) / .105) * ease((root + .078 - y) / .13);
        const cloudLight = 119 + 19 * (1 - ease(y / .29)) + 32 * (broad - .5) + 14 * (curl - .5) +
          5 * (flecks - .5) + grain;
        C[k] = cloudLight - 9; C[k + 1] = cloudLight + 2; C[k + 2] = cloudLight + 13;
        C[k + 3] = 255 * opticalAlpha(horizontalFade * canopy * shelf * (.68 + .76 * ease(y / .25)));
      }
      if ((j & 7) === 7) yield;
    }
    for (const layer of [veil, stormVeil, cloud, flow]) layer.ctx.putImageData(layer.image, 0, 0);
    cloud.ctx.filter = 'brightness(.85) saturate(.78)';
    drawMaterial(cloud.ctx, 'cloud-low', width * .014, 0, width * .972, height * .328, .88);
    cloud.ctx.filter = 'none';
    cloud.ctx.globalCompositeOperation = 'destination-in';
    for (const [x, y] of [[width, 0], [0, height]]) {
      const edge = cloud.ctx.createLinearGradient(0, 0, x, y);
      edge.addColorStop(0, 'transparent');
      edge.addColorStop(.08, '#000');
      edge.addColorStop(.92, '#000');
      edge.addColorStop(1, 'transparent');
      cloud.ctx.fillStyle = edge;
      cloud.ctx.fillRect(0, 0, width, height);
    }
    const fall = yield* fallingTexture(width, height, grid);
    return {veil: veil.canvas, stormVeil: stormVeil.canvas, cloud: cloud.canvas, flow: flow.canvas, fall};
  }

  function stepValleyRaster(variant) {
    let work = rasterWork.get(variant);
    if (!work) rasterWork.set(variant, work = buildValleyRaster(variant));
    const step = work.next();
    if (step.done) {
      rasterCache.set(variant, step.value);
      rasterWork.delete(variant);
    }
  }

  function valleyRaster(variant) {
    while (!rasterCache.has(variant)) stepValleyRaster(variant);
    return rasterCache.get(variant);
  }

  const wrapRain = (value, span) => (value % span + span) % span;

  // The density travels inside the mask. The cloud and feet inherit the
  // valley's parallax from the renderer when the masked layer is placed.
  function animatedFall(mask, fall, time, variant, across = 0) {
    const {width, height} = mask;
    if (!flowScratch) {
      const {canvas, ctx} = materialCanvas(width, height);
      const footFade = ctx.createLinearGradient(0, height * .66, 0, height * .99);
      footFade.addColorStop(0, '#000');
      footFade.addColorStop(1, 'transparent');
      flowScratch = {canvas, ctx, footFade, patterns: new WeakMap()};
    }
    const {canvas, ctx, footFade, patterns} = flowScratch;
    let pattern = patterns.get(fall);
    if (!pattern) {
      pattern = ctx.createPattern(fall, 'repeat');
      patterns.set(fall, pattern);
    }
    const phaseX = wrapRain(across, width);
    const phaseY = wrapRain(-time * 19 - variant * 37, fall.height);
    ctx.globalCompositeOperation = 'copy';
    ctx.save();
    ctx.translate(-phaseX, -phaseY);
    ctx.fillStyle = pattern;
    ctx.fillRect(phaseX, phaseY, width, height);
    ctx.restore();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.fillStyle = footFade;
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }

  function warmValleyMaterials() {
    return new Promise((resolve, reject) => {
      let variant = 0;
      const channel = typeof root.MessageChannel === 'function' ? new root.MessageChannel() : null;
      function close() {
        channel?.port1.close();
        channel?.port2.close();
      }
      function next() {
        // Prepare the fixed art before painting a rainy frame, including a first
        // seek straight into the storm. Each task yields to playback and input.
        const stopAt = performance.now() + 4;
        try {
          while (performance.now() < stopAt) {
            while (rasterCache.has(variant)) variant += 1;
            if (variant < VALLEY_VARIANTS) stepValleyRaster(variant);
            else {
              close();
              resolve();
              return;
            }
          }
        } catch (error) {
          close();
          reject(error);
          return;
        }
        schedule();
      }
      function schedule() {
        if (channel) channel.port2.postMessage(null);
        else root.setTimeout(next, 0);
      }
      if (channel) channel.port1.onmessage = () => next();
      schedule();
    });
  }

  function drawDistantRain(ctx, L, cells, layer, time, weather) {
    const travel = windTravel(weather, time, 0);
    const strength = weatherStrength(weather);
    const driving = strengthRamp(strength, .20, .76);
    const downpour = strengthRamp(strength, .57, .99);
    for (const cell of cells) {
      const width = RAIN_WIDTH * (.87 + .65 * cell.storm);
      const x = cell.x - width / 2;
      if (cell.layer !== layer || x + width <= L.left || x >= L.right || cell.strength <= 0) continue;
      const {veil, stormVeil, cloud, flow, fall} = valleyRaster(cell.variant);
      const top = CLOUD_TOP - 12 * cell.storm + (cell.lee ? 72 : 0);
      const height = cell.floor - top;
      const opacity = opticalAlpha(2.1 * cell.strength) / opticalAlpha(2.1);
      const storm = cell.storm;
      const tension = Number.isFinite(cell.tension) ? cell.tension : .5;
      ctx.save();
      const incoming = ctx.globalAlpha;
      ctx.globalAlpha = incoming * opacity * (.39 + .31 * driving + .08 * downpour);
      ctx.drawImage(veil, x, top, width, height);
      if (driving > 0) {
        const pulse = .5 + .5 * Math.sin(.92 * time + .15 * travel + 2.1 * cell.variant);
        const water = .16 * driving + downpour * (.09 + .32 * ease(pulse));
        ctx.globalAlpha = incoming * opacity * water * (cell.lee ? .79 : 1) * (.90 + .10 * tension);
        ctx.drawImage(stormVeil, x, top, width, height);
      }
      const across = .55 * time + 8.75 * travel;
      ctx.globalAlpha = incoming * opacity * (.49 + .31 * driving + .20 * downpour);
      ctx.drawImage(animatedFall(flow, fall, time, cell.variant, across), x, top, width, height);
      ctx.globalAlpha = incoming * opacity * (cell.lee ? .47 : 1);
      ctx.drawImage(cloud, x, top, width, height);
      ctx.restore();
    }
  }

  const RAIN_VOLUME_START = .53;
  const AIR_RAIN_BANDS = [
    {fall: .37, train: .19, wind: .60, exposure: [.012, .038], width: .80, color: 'rgb(176,201,214)',
      start: .01, full: .57, densities: [16, 12, 10], opacities: [.13, .18, .24]},
    {fall: .62, train: .23, wind: .70, exposure: [.018, .050], width: 1.10, color: 'rgb(184,208,220)',
      start: .13, full: .82, densities: [33, 27, 19], opacities: [.14, .20, .27]},
    {fall: .94, train: .27, wind: .74, exposure: [.028, .066], width: 1.48, color: 'rgb(199,220,230)',
      start: .32, full: .93, densities: [28, 25, 17], opacities: [.17, .25, .34]},
    {fall: 1.16, train: .30, wind: .77, exposure: [.040, .073], width: 1.75, color: 'rgb(207,225,234)',
      start: RAIN_VOLUME_START, full: .99, densities: [40, 34, 26], opacities: [.23, .31, .40], squall: true},
    {fall: .60, train: .15, wind: .61, exposure: [.034, .103], width: 1.25, color: 'rgb(186,208,221)',
      start: .70, full: .96, densities: [222, 186, 142], opacities: [.19, .25, .31], volume: true},
    {fall: .88, train: .24, wind: .77, exposure: [.036, .091], width: 1.31, color: 'rgb(207,222,232)',
      start: .74, full: .98, densities: [133, 108, 81], opacities: [.19, .27, .36], volume: true},
  ].map((band, index) => {
    const random = randomStream(0x28f79c + index * 163);
    return {...band, groups: band.densities.map(density => Array.from({length: 6 * density}, () => ({
      x: random(), y: random(), speed: .87 + .26 * random(), length: .62 + .76 * random(),
    })))};
  });
  const AIR_RAIN_WIDTHS = [.00084, .00131, .00177];

  const RAIN_VOLUME_COLS = 104, RAIN_VOLUME_ROWS = 56;
  const rainVolumeSamples = new Float32Array(RAIN_VOLUME_COLS * RAIN_VOLUME_ROWS);
  const rainVolumeNoise = Float32Array.from({length: 1024}, randomStream(0x4b27af));
  let rainScatter;

  // Three independently shaped scales of moving precipitation fill the air.
  // The broadest structures are broken vertically as well as across the wind.
  function sampleRainVolume(win, t, travel, wind, groundY, deluge) {
    const aspect = win.w / win.h;
    if (deluge > 0 && !rainScatter && typeof document === 'object' && document?.createElement) {
      rainScatter = materialCanvas(RAIN_VOLUME_COLS, RAIN_VOLUME_ROWS);
    }
    const pixels = deluge > 0 ? rainScatter?.image.data : null;
    const advance = .16 * t + .31 * travel;
    const lean = .13 + .49 * wind;
    for (let j = 0; j < RAIN_VOLUME_ROWS; j++) {
      const y = (j + .5) / RAIN_VOLUME_ROWS;
      const across = advance + lean * (y - .50);
      const driftY = y - .064 * t;
      const fallY = y - .17 * t;
      const scud = gaussian((y - groundY + .021) / .050) * ease((groundY + .045 - y) / .078);
      const depthProfile = .81 + .19 * ease(y / .56);
      const farSlope = ease((y - .21) / .39) * (1 - .52 * ease((y - .81) / .19));
      for (let i = 0; i < RAIN_VOLUME_COLS; i++) {
        const x = (i + .5) / RAIN_VOLUME_COLS * aspect + across;
        const broad = valueNoise(rainVolumeNoise, 2.34 * x + .76 * driftY + 16, 5.45 * driftY + .42 * x + 11);
        const parcel = valueNoise(rainVolumeNoise, 6.3 * x - 1.16 * driftY + 1.17 * broad, 7.7 * driftY + .67 * x + 4);
        const thread = valueNoise(rainVolumeNoise, 15.6 * x + 1.28 * parcel + 6, 8.8 * fallY + 1.16 * x);
        const mix = .49 * broad + .35 * parcel + .16 * thread;
        const density = ease((mix - .16) / .72);
        const index = j * RAIN_VOLUME_COLS + i;
        rainVolumeSamples[index] = density;
        if (pixels) {
          const burst = ease((density - .44) / .49);
          const depth = depthProfile * (.35 + .82 * density) + farSlope * (.09 + .68 * burst) +
            scud * (.12 + .35 * density);
          const light = 116 + 16 * (broad - .5) + 14 * (parcel - .5) + 7 * (thread - .5) + 21 * scud;
          const p = 4 * index;
          pixels[p] = light - 9;
          pixels[p + 1] = light + 4;
          pixels[p + 2] = light + 14;
          pixels[p + 3] = 255 * opticalAlpha(depth);
        }
      }
    }
    if (pixels) rainScatter.ctx.putImageData(rainScatter.image, 0, 0);
    return {aspect, samples: rainVolumeSamples, canvas: pixels ? rainScatter.canvas : null};
  }

  function rainVolumeAt({aspect, samples}, x, y) {
    const gx = Math.max(0, Math.min(RAIN_VOLUME_COLS - 1, x / aspect * RAIN_VOLUME_COLS - .5));
    const gy = Math.max(0, Math.min(RAIN_VOLUME_ROWS - 1, y * RAIN_VOLUME_ROWS - .5));
    const i = Math.floor(gx), j = Math.floor(gy), k = j * RAIN_VOLUME_COLS + i;
    const right = i + 1 < RAIN_VOLUME_COLS ? 1 : 0;
    const down = j + 1 < RAIN_VOLUME_ROWS ? RAIN_VOLUME_COLS : 0;
    const top = samples[k] + (samples[k + right] - samples[k]) * (gx - i);
    const bottom = samples[k + down] + (samples[k + down + right] - samples[k + down]) * (gx - i);
    return top + (bottom - top) * (gy - j);
  }

  // The long path through rain is beyond the telegraph poles. The same field
  // locates denser falling bundles and spray in the shorter foreground path.
  function drawRainFront(ctx, win, t, weather, groundY = .97) {
    const strength = weatherStrength(weather);
    if (strength <= RAIN_VOLUME_START || win.w <= 0 || win.h <= 0) return null;
    const wind = windAmount(weather, clamp(weather?.stormDrive || 0));
    const deluge = strengthRamp(strength, .68, .98);
    const field = sampleRainVolume(win, t, windTravel(weather, t, wind), wind, clamp(groundY), deluge);
    if (field.canvas) {
      ctx.save();
      ctx.globalAlpha *= .97 * deluge;
      ctx.drawImage(field.canvas, win.x, win.y, win.w, win.h);
      ctx.restore();
    }
    return field;
  }

  const rainImpacts = (() => {
    const random = randomStream(0x5c39ef);
    return Array.from({length: 66}, () => ({x: random(), depth: .13 + .72 * random(),
      period: .63 + .65 * random(), phase: random() * 2.7, life: .084 + .075 * random(),
      rise: .006 + .019 * random(), throw: .068 + .12 * random()}));
  })();

  function drawAirRainImpacts(ctx, win, t, travel, wind, groundY, field, amount) {
    const {x, y, w, h} = win;
    const aspect = w / h, bandHeight = 1 - groundY;
    if (bandHeight < .004) return;
    const drift = .80 * t + .15 * travel;
    ctx.strokeStyle = 'rgb(207,225,231)';
    ctx.lineWidth = Math.max(.62, h * .0016);
    for (const drop of rainImpacts) {
      const age = wrapRain(t + drop.phase, drop.period);
      if (age >= drop.life) continue;
      const u = age / drop.life;
      const px = wrapRain(drop.x * aspect - drift + (.80 + .15 * wind) * age, aspect);
      const base = groundY + bandHeight * drop.depth;
      const scatter = .26 + .74 * rainVolumeAt(field, px, base);
      ctx.globalAlpha = amount * scatter * (.54 + .20 * drop.depth) * (1 - u);
      const p = Math.max(0, u - .19), prior = p * (1 - p) * 4, current = u * (1 - u) * 4;
      ctx.beginPath();
      for (let j = -1; j <= 1; j++) {
        const speed = drop.throw * (.64 * j - wind - .53);
        const lift = drop.rise * (1 - .22 * Math.abs(j));
        ctx.moveTo(x + h * (px + p * drop.life * speed), y + h * (base - lift * prior));
        ctx.lineTo(x + h * (px + age * speed), y + h * (base - lift * current));
      }
      ctx.stroke();
    }
  }

  // Draw in pane-height units to keep the fall and its tangent independent of
  // aspect ratio. Seeded drops wrap beyond the crop in both axes.
  function drawAirRain(ctx, win, t, weather, groundY = .97, distant = null) {
    const strength = weatherStrength(weather);
    if (strength <= AIR_RAIN_BANDS[0].start || win.w <= 0 || win.h <= 0) return;
    const storm = clamp(weather?.stormDrive || 0);
    const wind = windAmount(weather, storm);
    const travel = windTravel(weather, t, wind);
    const {x, y, w, h} = win;
    const aspect = w / h;
    const margin = .15;
    const spanX = aspect + 2 * margin, spanY = 1 + 2 * margin;
    const deluge = strengthRamp(strength, .68, .98);
    const floor = Number.isFinite(groundY) ? clamp(groundY) : .97;
    const front = distant?.samples ? distant : null;
    const field = front || (strength > RAIN_VOLUME_START ? sampleRainVolume(win, t, travel, wind, floor, deluge) : null);

    ctx.save();
    const incoming = ctx.globalAlpha;
    ctx.lineCap = 'round';
    if (field?.canvas) {
      ctx.globalAlpha = incoming * deluge * (front ? .11 : .97);
      ctx.drawImage(field.canvas, x, y, w, h);
    }
    for (const band of AIR_RAIN_BANDS) {
      const share = strengthRamp(strength, band.start, band.full);
      if (share <= 0) continue;
      const left = band.fall * (band.train * t + band.wind * travel);
      const down = band.fall * t;
      const slope = band.train + band.wind * wind;
      const exposure = band.exposure[0] + (band.exposure[1] - band.exposure[0]) * share;
      ctx.strokeStyle = band.color;
      for (let group = 0; group < band.groups.length; group++) {
        const drops = band.groups[group];
        const coverage = Math.min(drops.length, band.densities[group] * aspect * share);
        const whole = Math.floor(coverage), count = Math.ceil(coverage);
        const alpha = incoming * band.opacities[group] * (.28 + .72 * Math.sqrt(share));
        ctx.lineWidth = h * band.width * AIR_RAIN_WIDTHS[group] * (.76 + .24 * share);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const drop = drops[i];
          const px = wrapRain(drop.x * spanX - left * drop.speed, spanX) - margin;
          const py = wrapRain(drop.y * spanY + down * drop.speed, spanY) - margin;
          if (px > aspect || py < 0) continue;
          const sheet = band.squall || band.volume ? .60 + .40 * rainVolumeAt(field, px, py) : 1;
          // Length follows shutter exposure and the passing sheet. The seeded
          // head moves on the same trajectory through strength changes.
          const dy = band.fall * exposure * drop.speed * drop.length * sheet;
          const dx = dy * slope;
          if (px + dx < 0 || py - dy > 1) continue;
          if (i === whole) {
            if (whole > 0) ctx.stroke();
            ctx.beginPath();
            ctx.globalAlpha = alpha * (coverage - whole);
          }
          ctx.moveTo(x + h * (px + dx), y + h * (py - dy));
          ctx.lineTo(x + h * px, y + h * py);
        }
        ctx.stroke();
      }
    }
    const impacts = strengthRamp(strength, .80, .985);
    if (impacts > 0) drawAirRainImpacts(ctx, win, t, travel, wind, floor, field, incoming * impacts);
    ctx.restore();
  }

  // Keep one upstream renderer per document. Each destination gets its own simulation.
  // A fixed-size pane makes live, resized and exported views sample the same water.
  const WIDTH = 1216;
  const HEIGHT = 568;
  const LIVE_WIDTH = 836;
  const LIVE_HEIGHT = 392;
  const TICK = 30;
  const COHORT = 6 * TICK;
  const TAIL = 9 * TICK;
  const DRYING = 3 * TICK;
  const DROP_SCALE = .64;
  const COHORT_CAPACITY = 228;
  const TRAIL_CAPACITY = 174;
  const RUN_CAPACITY = 62;
  const HANGING_CAPACITY = 78;
  const GL_OPTIONS = {alpha: true, antialias: false, depth: false, preserveDrawingBuffer: false};

  const stormAt = (weather, time) => clamp(weather.stormDriveAt?.(time) ?? weather.stormDrive ?? 0);
  const flowShare = storm => ease((storm - .38) / .44);
  const slideSpeed = storm => .52 + .33 * storm + 1.04 * flowShare(storm);

  function birthRate(weather, time, storm) {
    const rain = clamp(weather.rainAt?.(time) ?? weather.intensity ?? 0);
    return Math.sqrt(rain) * (.95 + 2.4 * storm + 57 * flowShare(storm) ** 2);
  }

  function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    return canvas;
  }

  function hashIdentity(song) {
    const track = song.track || {};
    const text = JSON.stringify([track.id, track.title, track.artist, track.path, track.duration, song.id]);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash;
  }

  function randomStream(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ state >>> 15, state | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  // Upstream 1.0.8 uses Math.random internally. No other asynchronous work runs inside a fixed step.
  function withRandom(random, run) {
    const original = Math.random;
    Math.random = random;
    try {
      return run();
    } finally {
      Math.random = original;
    }
  }

  async function makeGraphics() {
    const canvas = makeCanvas();
    const staging = makeCanvas();
    const input = staging.getContext('2d', {alpha: false});
    const gl = canvas.getContext('webgl2', GL_OPTIONS);
    if (!gl) return null;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (!gl.getExtension('EXT_color_buffer_float')) {
      lose?.loseContext();
      return null;
    }

    try {
      const fx = new root.RaindropFX({
        canvas,
        background: staging,
        spawnSize: [25, 67],
        spawnLimit: 180,
        gravity: 520,
        slipRate: 0.34,
        colliderSize: .92,
        initialSpread: 0.26,
        trailDistance: [10, 20],
        trailDropSize: [0.21, 0.34],
        trailDropDensity: 0.44,
        trailSpread: 0.13,
        xShifting: [0.1, 0.4],
        evaporate: 20,
        backgroundBlurSteps: 1,
        mist: true,
        mistBlurStep: 2,
        mistTime: 4.5,
        mistColor: [0.055, 0.035, 0.045, 0.22],
        dropletSize: [8 * DROP_SCALE, 20 * DROP_SCALE],
        smoothRaindrop: [0.80, 0.97],
        refractBase: 0.39,
        refractScale: 0.52,
        raindropLightPos: [-1.8, 1.2, 1.85, 0],
        raindropDiffuseLight: [0.27, 0.26, 0.26],
        raindropSpecularLight: [0.046, 0.043, 0.045],
        raindropSpecularShininess: 24,
        raindropShadowOffset: 0.68,
      });
      const renderer = fx.renderer;
      const engine = renderer.renderer;
      await renderer.loadAssets();
      const framebuffer = gl.createFramebuffer();
      const targets = [renderer.raindropComposeTex, renderer.background, renderer.dropletTexture,
        renderer.blurryBackground, renderer.mistBackground, renderer.mistTexture];
      let mistOnly = false;
      let liveFrame = false;
      const blit = engine.blit;
      engine.blit = function blitGlass(source, target, material, ...rest) {
        const unusedCompose = mistOnly && material === renderer.matrlCompose;
        const unusedErase = !fx.options.dropletsPerSeconds && material === renderer.matrlErase && target === renderer.dropletTexture;
        if (liveFrame && (unusedCompose || unusedErase)) return;
        return blit.call(this, source, target, material, ...rest);
      };
      const drawDroplet = renderer.drawDroplet;
      renderer.drawDroplet = function drawActiveDroplets(time) {
        if (!liveFrame || fx.options.dropletsPerSeconds > 0) drawDroplet.call(this, time);
      };
      const drawRaindrops = renderer.drawRaindrops;
      renderer.drawRaindrops = function drawActiveRain(drops) {
        if (!mistOnly) drawRaindrops.call(this, drops);
      };
      const clear = engine.clear;
      engine.clear = function clearTransparent(color, ...rest) {
        return clear.call(this, color?.a === 1 ? color.transparent() : color, ...rest);
      };

      // Draw only the altered pixels. The original 2D background remains at full resolution.
      // RaindropRenderer still shades and refracts using the uploaded same-frame exterior.
      const alphaBlend = {
        blendRGB: [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA],
        blendAlpha: [gl.ONE, gl.ONE_MINUS_SRC_ALPHA],
      };
      const compose = renderer.matrlCompose.shader;
      const opacity = 'float mask = smoothstep(uSmoothRaindrop.x, uSmoothRaindrop.y, compose.a);';
      // Transparent pixels do not contribute to the pane. End shading before
      // the lighting calculation and background lookup on dry glass pixels.
      if (!compose.initialized && typeof compose.fragmentShaderSouce === 'string') {
        compose.fragmentShaderSouce = compose.fragmentShaderSouce.replace(opacity, opacity + '\n    if (mask <= 0.0) discard;');
      }
      compose.setPipelineStates(alphaBlend);
      renderer.matrlMistCompose.shader.setPipelineStates(alphaBlend);
      const drawBackground = renderer.drawBackground;
      renderer.drawBackground = function drawWetBackground() {
        const originalBlit = engine.blit;
        let sharpCopy = true;
        engine.blit = function blitMistOnly(...args) {
          if (!sharpCopy) return originalBlit.apply(this, args);
          sharpCopy = false;
        };
        try {
          drawBackground.call(this);
        } finally {
          engine.blit = originalBlit;
        }
      };

      const Simulator = fx.simulator.constructor;
      const vector = fx.options.viewport.min;
      const sample = fx.simulator.spawner.spawn(vector.clone(), 1);
      const prototype = Object.getPrototypeOf(sample);
      const randomMotion = prototype.randomMotion;
      const split = prototype.split;
      if (!prototype.scoreTerrainBias) {
        prototype.randomMotion = function biasDownLeft() {
          randomMotion.call(this);
          this.shifting = -0.17 - Math.abs(this.shifting);
        };
        prototype.split = function splitWithinCapacity() {
          if (this.simulator.raindrops.length < TRAIL_CAPACITY) split.call(this);
        };
        prototype.scoreTerrainBias = true;
      }

      function render(scene, crop, drops, humidity, seed, beads, live) {
        const width = live ? LIVE_WIDTH : WIDTH;
        const height = live ? LIVE_HEIGHT : HEIGHT;
        if (canvas.width !== width || canvas.height !== height) {
          // Keep projection, drop sizes and the simulation in the original pane's
          // coordinates. Only the optical effect's raster targets change size.
          engine.setSize(width, height);
          staging.width = width;
          staging.height = height;
          for (const target of targets) target.resize(width, height);
        }
        liveFrame = live;
        mistOnly = live && !drops.length && !beads;
        input.drawImage(scene, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
        const background = renderer.background;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, background._glTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, staging);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        // A deterministic micro-bead field and condensation amount use the controller's
        // recent rain integral. Stock drawRaindrops erases along active drops and their trail.
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        for (const texture of [renderer.dropletTexture, renderer.mistTexture]) {
          texture.create();
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture._glTex, 0);
          gl.clearBufferfv(gl.COLOR, 0, zero);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        fx.options.dropletsPerSeconds = beads;
        fx.options.mist = humidity > .015;
        // Keep mist accumulation independent of repaint frequency.
        fx.options.mistTime = .85 / Math.max(.001, humidity);
        try {
          if (mistOnly) renderer.blurRenderer.blur(background, fx.options.mistBlurStep, renderer.mistBackground);
          else renderer.blurBackground();
          withRandom(randomStream(seed ^ 0x23a6614d), () => renderer.render(drops, {dt: 1, total: 0}));
        } finally {
          mistOnly = liveFrame = false;
        }
        return canvas;
      }

      return {canvas, gl, vector, Simulator, options: fx.options, render};
    } catch (error) {
      lose?.loseContext();
      throw error;
    }
  }

  const zero = new Float32Array(4);

  function prepareGraphics() {
    if (preparingGraphics) return preparingGraphics;
    loadingBundle ??= loadBundle().catch(error => {
      console.warn('Terrain weather: glass unavailable', error);
      return null;
    });
    preparingGraphics = Promise.all([loadMaterials(), loadingBundle])
      .then(([available, bundle]) => available && bundle ? makeGraphics() : null)
      .then(backend => {
        graphics = backend;
        if (!backend) return;
        backend.canvas.addEventListener('webglcontextlost', () => {
          if (graphics !== backend) return;
          graphics = null;
          preparingWeather = null;
          if (!canRecoverGraphics) return;
          canRecoverGraphics = false;
          // Raindrop FX shares WebGL shader objects within its bundle. A fresh
          // script gives the replacement context its own uninitialized assets.
          root.RaindropFX = undefined;
          loadingBundle = null;
          preparingGraphics = null;
        }, {once: true});
      }).catch(error => {
        console.warn('Terrain weather: glass unavailable', error);
      });
    return preparingGraphics;
  }

  function prepare(canvas) {
    if (!baseUrl || !canvas) return Promise.resolve(false);
    if (!sessions.has(canvas)) {
      sessions.set(canvas, {song: null, cohorts: new Map(), pool: [], report: null});
    }
    preparingWeather ??= Promise.all([ready(), prepareGraphics()]).then(([available]) => available);
    return preparingWeather;
  }

  function dispose(canvas) {
    // Each score canvas owns its simulation. All views in this document share
    // the same WebGL context so the bundle's shader and mesh caches stay valid.
    sessions.delete(canvas);
  }

  function createCohort(backend, seed, index) {
    const options = {...backend.options, spawnLimit: -1};
    const sim = new backend.Simulator(options);
    return {
      sim, random: randomStream(seed ^ Math.imul(index + 1, 0x7f4a7c15)),
      start: index * COHORT, tick: index * COHORT,
      seed, credit: 0, flowCredit: 0, previous: new Map(), current: new Map(),
    };
  }

  function createDrop(backend, cohort, x, y, size) {
    const position = backend.vector.clone();
    position.x = x;
    position.y = y;
    const drop = cohort.sim.spawner.spawn(position, size);
    cohort.sim.add(drop);
    return drop;
  }

  function spawnRun(backend, cohort, elapsed, strength, remaining, tension = .5) {
    const {sim, random} = cohort;
    const x = WIDTH * (.14 + .79 * random());
    const y = HEIGHT * (.33 + .61 * random());
    const slope = .18 + .15 * clamp(tension) + .12 * random();
    const initialSpeed = 23 + 36 * strength;
    const count = Math.min(remaining, 3 + Math.floor(3 * strength * random()));
    const group = {};
    for (let i = 0; i < count && sim.raindrops.length < COHORT_CAPACITY; i++) {
      const offset = i * (24 + 8 * random());
      const size = i === 0 ? 45 + 19 * random() : 27 + 19 * random();
      const drop = createDrop(backend, cohort, x + slope * offset + (random() - .5) * 12,
        y + offset, size);
      drop.flowGroup = group;
      drop.shifting = -slope;
      drop.velocity.y = -initialSpeed * (1 - .13 * i);
      drop.resistance = sim.options.gravity * drop.mass * (.26 + .13 * i + .1 * random());
      drop.nextRandomTime = elapsed + .90 + .30 * random();
    }
  }

  function advanceCohort(backend, cohort, weather, capture) {
    const {sim, random, tick, start} = cohort;
    const elapsed = tick / TICK;
    const storm = stormAt(weather, elapsed);
    const tension = clamp(weather.tensionAt?.(elapsed) ?? weather.tension ?? .5);
    const flow = flowShare(storm);
    withRandom(random, () => {
      if (tick < start + COHORT) {
        for (const [index, event] of (weather.events || []).entries()) {
          if (Math.ceil(event.firstDropAtSec * TICK - 1e-8) !== tick) continue;
          const placement = randomStream(Math.imul((event.index ?? index) + 1, 0x45d9f3b) ^ cohort.seed);
          const size = 83 + placement() * 12;
          const drop = createDrop(backend, cohort, WIDTH * (.36 + .27 * placement()),
            HEIGHT * (.44 + .27 * placement()), size);
          drop.resistance = sim.options.gravity * drop.mass * 1.9;
          drop.nextRandomTime = elapsed + 1.35;
          drop.shifting = -.40;
        }
        let inRuns = 0, hanging = 0;
        for (const drop of sim.raindrops) {
          if (drop.destroied || drop.parent) continue;
          if (drop.flowGroup) inRuns += 1;
          else hanging += 1;
        }
        const rain = Math.sqrt(clamp(weather.rainAt?.(elapsed) ?? weather.intensity ?? 0));
        // Bursts follow the same down-left motion as separate drops. Their
        // nearby paths can naturally merge in the existing collision model.
        cohort.flowCredit += rain * flow ** 2 * (4 + 11.5 * flow) / ((1 + inRuns / RUN_CAPACITY) * TICK);
        if (cohort.flowCredit >= 1) {
          cohort.flowCredit -= 1;
          if (inRuns < RUN_CAPACITY - 1) spawnRun(backend, cohort, elapsed, flow, RUN_CAPACITY - inRuns, tension);
        }
        const capacity = 25 + (HANGING_CAPACITY - 25) * flow;
        const births = birthRate(weather, elapsed, storm) / (1 + (hanging / capacity) ** 1.65);
        cohort.credit += births / TICK;
        while (cohort.credit >= 1) {
          cohort.credit -= 1;
          if (hanging >= capacity || sim.raindrops.length >= COHORT_CAPACITY) break;
          hanging += 1;
          // There is a broad windward bias with occasional drops in the clearer side of the pane.
          const x = random(), y = random();
          const windward = random() < .67;
          const size = 25 + random() * 42;
          const drop = createDrop(backend, cohort, WIDTH * (windward ? .20 + .8 * Math.sqrt(x) : x), HEIGHT * y, size);
          const humidity = weather.wetAt?.(elapsed) ?? 0;
          if (size < 51 && random() < humidity * (.36 + .22 * flow)) {
            drop.resistance = sim.options.gravity * drop.mass * 1.15;
            drop.nextRandomTime = elapsed + .85 + 1.5 * humidity;
          }
        }
      }

      // The song clock still controls spawning and motion state. The simulated
      // travel in each fixed tick changes smoothly with the phrase.
      const dt = slideSpeed(storm) / TICK;
      sim.options.evaporate = 22 + 79 * (1 - storm) ** 2;
      for (const drop of sim.raindrops) {
        if (drop.mass <= sim.options.evaporate * dt) drop.destroied = true;
      }
      sim.update({dt, total: elapsed});
    });
    cohort.tick += 1;
    // A direct seek replays the physics of the whole cohort, but only two
    // snapshots can contribute to the interpolated frame at its destination.
    if (!capture) return;
    const earlier = cohort.previous;
    cohort.previous = cohort.current;
    cohort.current = earlier;
    earlier.clear();
    for (const drop of sim.raindrops) {
      if (!drop.destroied && Number.isFinite(drop.size.x) && drop.size.x > 1) {
        earlier.set(drop, [drop.pos.x, drop.pos.y, drop.size.x, drop.size.y]);
      }
    }
  }

  function dropInstances(backend, session, song, time, weather, aspect) {
    const timeline = weather.stormDriveAt || weather.rainAt;
    if (session.song !== song || session.timeline !== timeline) {
      session.song = song;
      session.timeline = timeline;
      session.seed = hashIdentity(song);
      session.cohorts.clear();
    }
    const frame = Math.max(0, time * TICK);
    const baseTick = Math.floor(frame + 1e-8);
    const target = baseTick + 1;
    const fraction = clamp(frame - baseTick);
    const first = Math.max(0, Math.floor((baseTick - COHORT - TAIL) / COHORT) + 1);
    const last = Math.floor(baseTick / COHORT);
    let steps = 0;
    let visible = 0;
    let particleCount = 0;
    let primaryDrops = 0, sliding = 0, downwardTravel = 0;
    let flowingDrops = 0;
    const flowingGroups = new Set();
    const drops = [];
    for (const index of session.cohorts.keys()) {
      if (index < first || index > last) session.cohorts.delete(index);
    }
    for (let index = first; index <= last; index++) {
      let cohort = session.cohorts.get(index);
      if (!cohort || cohort.tick > target) {
        cohort = createCohort(backend, session.seed, index);
        session.cohorts.set(index, cohort);
      }
      while (cohort.tick < target) {
        advanceCohort(backend, cohort, weather, cohort.tick >= target - 2);
        steps += 1;
      }
      const fade = ease((cohort.start + COHORT + TAIL - frame) / DRYING);
      const collect = (from, to, drop) => {
        const x = from[0] + (to[0] - from[0]) * fraction;
        const y = from[1] + (to[1] - from[1]) * fraction;
        const w = Math.min(107, from[2] + (to[2] - from[2]) * fraction) * fade;
        const h = Math.min(112, from[3] + (to[3] - from[3]) * fraction) * fade;
        if (w < 1 || h < 1 || x < -w || x > WIDTH + w || y < -h || y > HEIGHT + h) return;
        let instance = session.pool[visible];
        if (!instance) {
          instance = {pos: backend.vector.clone(), size: backend.vector.clone()};
          session.pool[visible] = instance;
        }
        instance.pos.x = x;
        instance.pos.y = y;
        instance.size.x = w * aspect * DROP_SCALE;
        instance.size.y = h * DROP_SCALE;
        drops.push(instance);
        visible += 1;
        if (drop && !drop.parent) {
          primaryDrops += 1;
          const speed = (from[1] - to[1]) * TICK;
          if (speed > 10) {
            sliding += 1;
            downwardTravel += speed;
            if (drop.flowGroup) {
              flowingDrops += 1;
              flowingGroups.add(drop.flowGroup);
            }
          }
        }
      };
      for (const [drop, to] of cohort.current) {
        const from = cohort.previous.get(drop) || [to[0], to[1], to[2] * .30, to[3] * .30];
        collect(from, to, drop);
      }
      for (const [drop, from] of cohort.previous) {
        if (!cohort.current.has(drop)) collect(from, [from[0], from[1], 0, 0]);
      }
      particleCount += cohort.sim.raindrops.length;
    }
    session.report = {steps, visible, particleCount, primaryDrops, sliding, flowingDrops, flowingGroups: flowingGroups.size,
      meanSlidePxPerSec: sliding ? downwardTravel / sliding : 0,
      cohorts: session.cohorts.size, renderer: 'Raindrop FX 1.0.8'};
    return drops;
  }

  function surfaceAmount(weather, fallback = 0) {
    return clamp(Number.isFinite(weather?.surface) ? weather.surface : fallback);
  }

  function windAmount(weather, fallback) {
    return clamp(Number.isFinite(weather?.wind) ? weather.wind : fallback);
  }

  function windTravel(weather, time, fallbackWind) {
    return Number.isFinite(weather?.windTravel) ? weather.windTravel : time * fallbackWind;
  }

  function drawWetEdges(ctx, win, t, wet, wind, transomFrac) {
    if (wet <= .008) return false;
    ctx.save();
    const {x, y, w, h} = win;
    for (const lip of [transomFrac, 1]) {
      const sill = lip === 1;
      const edge = y + h * lip;
      const film = h * (.002 + .009 * wet) * (sill ? 1 : .72);
      const gradient = ctx.createLinearGradient(0, edge - film * 1.6, 0, edge);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(.58, 'rgba(62,91,108,' + .38 * wet + ')');
      gradient.addColorStop(.83, 'rgba(199,221,230,' + .34 * wet + ')');
      gradient.addColorStop(1, 'rgba(31,48,57,' + .56 * wet + ')');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, edge - film * 1.6, w, film * 1.6);
      for (let i = 0; i < (sill ? 7 : 4); i++) {
        const px = x + w * ((i + .34 + .36 * snowHash(i, sill ? 6 : 8)) / (sill ? 7 : 4));
        const run = h * (.012 + .04 * snowHash(i, 9)) * wet;
        const pulse = .55 + .45 * Math.sin(t * (1.25 + snowHash(i, 7)) + i * 2.3);
        // Narrow tracks terminate in the bead of water held by the gasket.
        const trail = ctx.createLinearGradient(0, edge - run, 0, edge);
        trail.addColorStop(0, 'transparent');
        trail.addColorStop(.74, 'rgba(204,226,236,' + (.09 + .19 * pulse) * wet + ')');
        trail.addColorStop(1, 'rgba(157,189,203,' + .36 * wet + ')');
        ctx.strokeStyle = trail;
        ctx.lineWidth = Math.max(.65, h * .0028 * wet);
        ctx.beginPath();
        ctx.moveTo(px + run * (.08 + .28 * wind), edge - run);
        ctx.quadraticCurveTo(px + run * .05, edge - run * .41, px, edge - film * .34);
        ctx.stroke();
        ctx.fillStyle = 'rgba(220,237,241,' + (.19 + .29 * pulse) * wet + ')';
        ctx.fillRect(px - h * .003, edge - film * .46, h * .006, Math.max(.55, film * .22));
      }
    }
    ctx.restore();
    return true;
  }

  function drawGlass(ctx, exterior, win, song, t, weather, enabled = true, transomFrac = .14) {
    if (!ctx.canvas || !exterior || exterior.w <= 0 || exterior.h <= 0) return false;
    const wet = clamp(weather.humidity || 0);
    const film = surfaceAmount(weather, wet);
    const wind = windAmount(weather, clamp(weather.stormDrive || 0));
    const drawFilm = () => enabled && drawWetEdges(ctx, win, t, film, wind, transomFrac);
    const backend = graphics;
    const session = sessions.get(ctx.canvas);
    if (!backend || !session || backend.gl.isContextLost()) {
      if (session) session.report = null;
      prepare(ctx.canvas);
      return drawFilm();
    }

    const recentRain = weather.intensity > 0 || wet > .001 || (weather.events || []).some(event =>
      t >= event.firstDropAtSec && t < event.firstDropAtSec + (COHORT + TAIL) / TICK);
    if (!recentRain) {
      session.report = null;
      return drawFilm();
    }
    const aspect = Math.max(.55, Math.min(2, (WIDTH / HEIGHT) / (win.w / win.h)));
    const drops = enabled ? dropInstances(backend, session, song, t, weather, aspect) : [];
    const storm = stormAt(weather, t);
    const beads = enabled ? Math.round((12 + 30 * storm + 208 * flowShare(storm)) * ease((wet - .12) / .72)) : 0;
    if (!enabled) session.report = {steps: 0, visible: 0, particleCount: 0, primaryDrops: 0, sliding: 0,
      flowingDrops: 0, flowingGroups: 0, meanSlidePxPerSec: 0, cohorts: session.cohorts.size,
      renderer: 'Raindrop FX 1.0.8'};
    session.report.beads = beads;
    session.report.humidity = wet;
    session.report.glassDrive = weather.glassDriveAt?.(t) ?? 0;
    session.report.stormDrive = storm;
    session.report.slideSpeed = slideSpeed(storm);
    session.report.potentialBirthsPerSec = birthRate(weather, t, storm);
    if (!drops.length && !beads && wet <= .015) return drawFilm();
    try {
      const live = !ctx.canvas.scoreExportRatio && ctx.canvas.scoreTerrainOpticsFull !== true;
      // Most obscuration in a cloudburst belongs to the outdoor rain volume.
      const condensation = wet * (1 - .30 * strengthRamp(weatherStrength(weather), .70, .98));
      const layer = backend.render(ctx.canvas, exterior, drops, condensation, session.seed ?? 0, beads, live);
      ctx.drawImage(layer, win.x, win.y, win.w, win.h);
      drawFilm();
      return true;
    } catch (error) {
      if (!backend.gl.isContextLost()) console.warn('Terrain weather: glass frame skipped', error);
      return drawFilm();
    }
  }

  const snowLights = new WeakMap();
  function snowLight(base) {
    const existing = snowLights.get(base);
    if (existing) return existing;
    const mix = (a, b, p) => a.map((value, i) => value + (b[i] - value) * p);
    const haze = [208, 219, 230];
    const sky = [[116, 136, 158], [150, 168, 188], [188, 201, 215], [212, 222, 232]];
    const floor = [[198, 208, 218], [176, 189, 202], [154, 168, 184]];
    const output = {
      ...base, name: base.name + ' · snow', weatherOvercast: true, weatherSnow: true,
      sky: base.sky.map(([at, color], i) => [at, mix(sky[i], color, .08)]),
      floor: base.floor.map(([at, color], i) => [at, mix(floor[Math.min(i, floor.length - 1)], color, .08)]),
      glow: {...base.glow, c: [216, 226, 238], a: .26},
      virga: {...base.virga, a: 0},
      haze,
      light: [214, 224, 234],
      shade: [68, 84, 102],
      band: {c: [216, 226, 236], a: .56},
      air: {c: [210, 222, 234], a: .22},
      litK: base.litK * .92,
      castA: base.castA * .52,
    };
    snowLights.set(base, output);
    return output;
  }

  const snowClouds = new Map();
  function snowCloud(key) {
    if (snowClouds.has(key)) return snowClouds.get(key);
    const source = materials.get(key);
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const g = canvas.getContext('2d');
    g.filter = 'brightness(.86) contrast(.92) saturate(.22)';
    g.drawImage(source, 0, 0);
    snowClouds.set(key, canvas);
    return canvas;
  }

  function drawSnowSky(ctx, L, t, weather) {
    const far = weather.farRain || 0;
    const storm = weather.stormDrive || 0;
    const tension = Number.isFinite(weather.tension) ? weather.tension : .5;
    const ceiling = clamp((.28 * ease((far - .10) / .7) + .72 * storm) * (.84 + .32 * tension));
    const drift = Math.sin(t * .028);
    const x = L.left - (.16 + .16 * drift) * L.Wm;
    const w = 1.48 * L.Wm;
    const lowX = L.left - (.15 + .16 * drift) * L.Wm;
    const lowW = 1.44 * L.Wm;

    // Cold heavy snow-laden slate-silver ceiling (brighter and icier than rain, deepening into dense snow cloud in blizzard).
    const sky = ctx.createLinearGradient(0, 125, 0, 590);
    sky.addColorStop(0, 'rgba(92,112,134,' + (.34 + .44 * ceiling).toFixed(4) + ')');
    sky.addColorStop(.45, 'rgba(138,158,178,' + (.26 + .34 * ceiling).toFixed(4) + ')');
    sky.addColorStop(.82, 'rgba(194,208,222,' + (.16 + .24 * ceiling).toFixed(4) + ')');
    sky.addColorStop(1, 'rgba(194,208,222,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(L.left - 10, 125, L.Wm + 20, 465);

    const thin = snowCloud('cloud-thin') || materials.get('cloud-thin');
    const low = snowCloud('cloud-low') || materials.get('cloud-low');
    if (thin) {
      ctx.save();
      ctx.globalAlpha *= .52 + .34 * ceiling;
      ctx.drawImage(thin, x - .08 * L.Wm, 88 + 6 * storm, w * 1.16, 330 + 46 * storm);
      ctx.restore();
    }
    if (low) {
      ctx.save();
      ctx.globalAlpha *= .46 + .42 * ceiling;
      ctx.drawImage(low, lowX, 150 + 28 * storm, lowW, 326 + 52 * storm);
      ctx.restore();
    }
  }

  function snowMotion(time, weather) {
    const wind = windAmount(weather, 0);
    const travel = windTravel(weather, time, wind);
    return {x: -.022 * time - .235 * travel, y: .124 * time,
      vx: -.022 - .235 * wind, vy: .124, wind, travel};
  }

  const snowPhase = n => n - Math.floor(n);
  function snowActivity(weather, wind) {
    const strength = weatherStrength(weather);
    return {
      active: strengthRamp(strength, .006, .24),
      moderate: strengthRamp(strength, .15, .60),
      heavy: strengthRamp(strength, .38, .96),
      squall: strengthRamp(strength, .54, .94) * (.82 + .18 * wind),
      whiteout: strengthRamp(strength, .70, .985),
      drift: strengthRamp(strength, .34, .91),
    };
  }

  let snowCurtains;
  function snowCurtain(variant) {
    snowCurtains ??= [0, 1, 2].map(salt => {
      const width = 84, height = 96;
      const {canvas, ctx, image} = materialCanvas(width, height);
      const random = randomStream(0xbc37 + 719 * salt);
      const grid = Float32Array.from({length: 1024}, random);
      const pixels = image.data;
      for (let j = 0; j < height; j++) {
        const y = j / (height - 1);
        const edgeY = ease(y / .28) * ease((1 - y) / .32);
        for (let i = 0; i < width; i++) {
          const x = i / (width - 1);
          const broad = valueNoise(grid, x * 5.7, y * 3.3);
          const detail = valueNoise(grid, x * 12.6 + 8.1, y * 7.2 + 2.9);
          const fold = x + .17 * y + .18 * (broad - .5);
          const body = ease((fold - .19) / .29) * ease((.90 - fold) / .27);
          const gaps = .15 + .85 * ease((.66 * broad + .34 * detail - .29) / .46);
          const edgeX = ease(x / .15) * ease((1 - x) / .15);
          const k = (j * width + i) * 4;
          pixels[k] = 215 + 17 * detail;
          pixels[k + 1] = 227 + 14 * detail;
          pixels[k + 2] = 240 + 12 * detail;
          pixels[k + 3] = 255 * edgeX * edgeY * body * gaps;
        }
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    });
    return snowCurtains[variant % snowCurtains.length];
  }

  // Soft snow curtains within the valley. Their edges and looping density
  // gaps vanish before a packet recirculates around the fixed valley anchor.
  function drawSnowValley(ctx, L, cells, layer, time, weather) {
    if (!cells?.length) return;
    const motion = snowMotion(time, weather);
    const {moderate, squall, whiteout} = snowActivity(weather, motion.wind);
    for (const cell of cells) {
      if (cell.layer !== layer) continue;
      const width = RAIN_WIDTH * (1.16 + .56 * squall + .33 * whiteout);
      const strength = clamp(cell.strength * (.63 + .54 * (cell.storm || 0)));
      if (strength < .01 || cell.x + width <= L.left || cell.x - width >= L.right) continue;
      const top = CLOUD_TOP + (cell.lee ? 52 : 12);
      const height = Math.max(120, (cell.floor ?? 680) - top);
      ctx.save();
      const alpha = ctx.globalAlpha * strength * (cell.lee ? .40 : .56) * (.76 + .24 * moderate);
      for (let i = 0; i < 5; i++) {
        const seed = cell.variant * 5 + i;
        const speed = .29 + .19 * snowHash(seed, 9);
        const glide = (motion.x - .18 * motion.travel) * height / (RAIN_WIDTH * 1.16);
        const x = snowPhase((i + snowHash(seed, 5)) / 5 + glide * speed);
        const y = snowPhase(snowHash(seed, 6) + motion.y * speed / .37);
        const fade = ease(x / .20) * ease((1 - x) / .20) * ease(y / .20) * ease((1 - y) / .20);
        if (fade < .01) continue;
        const w = width * (.27 + .17 * snowHash(seed, 7) + .10 * squall + .06 * whiteout);
        const h = height * (.52 + .10 * snowHash(seed, 8) + .21 * squall);
        const fold = ease((snowHash(seed, 10) - .30) / .44);
        ctx.globalAlpha = clamp(alpha * fade * (1 + squall * (.25 + .70 * fold) + whiteout * (.34 + .77 * fold)));
        ctx.drawImage(snowCurtain(cell.variant + i), cell.x + width * (x - .5) - w * .5,
          top + height * (.035 + .37 * y), w, h);
      }
      ctx.restore();
    }
  }

  // ---------- WebGL2 snow, track spindrift and crystalline window frost ----------
  const SNOW_VS = `#version 300 es
  out vec2 v_uv;
  void main() {
    vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    v_uv = pos;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const SNOW_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 fragColor;

  uniform vec2 u_res;
  uniform float u_radius;
  uniform int u_stage;
  uniform float u_transomY;
  uniform float u_time;
  uniform float u_frost;
  uniform float u_wind;
  uniform float u_travel;
  uniform float u_groundY;
  uniform vec2 u_shift;
  uniform vec4 u_activity;
  uniform float u_whiteout;
  uniform float u_drift;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.03 + vec2(17.1, 31.7);
      a *= 0.5;
    }
    return v;
  }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    // Flip Y so +y points downward (matches Canvas2D window coordinates).
    vec2 uv01 = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 px = uv01 * u_res;
    float dBox = sdRoundBox(px - 0.5 * u_res, 0.5 * u_res, u_radius);
    float winMask = 1.0 - smoothstep(-1.2, 1.2, dBox);
    if (winMask <= 0.001) { fragColor = vec4(0.0); return; }

    float aspect = u_res.x / max(1.0, u_res.y);
    vec2 uv = vec2((uv01.x - 0.5) * aspect, uv01.y - 0.5);

    vec3 snowRgb = vec3(0.0);
    float snowAlpha = 0.0;

    float activeSnow = u_activity.x;
    float moderate = u_activity.y;
    float squall = u_activity.w;
    if (u_stage == 0 && activeSnow > 0.001) {
      float packet = .46;
      if (moderate > .02 && squall < .8) {
        vec2 air = uv - u_shift * .57;
        packet = smoothstep(.20, .78, vnoise(air * vec2(4.5, 3.2)));
      }
      float ridges = smoothstep(.06, .32, uv01.y) * (1.0 - smoothstep(.73, 1.0, uv01.y));
      float backlight = smoothstep(.18, .94, uv01.x) * (1.0 - smoothstep(.48, .95, uv01.y));
      float front = 0.0, mistTexture = 0.0, mist = 0.0, head = 0.0;
      if (squall > .001) {
        // Powder and thicker gust heads travel through the same wind field.
        vec2 air = uv - u_shift * vec2(.73, .28) + vec2(.31 * u_travel, 0.0);
        float rolling = vnoise(vec2(1.81 * air.x - .21 * air.y + 7.1, 2.83 * air.y + .13 * air.x - 3.9));
        float broken = vnoise(vec2(4.1 * air.x + 3.2, 6.7 * (air.y + .075 * air.x) + 9.6));
        mistTexture = vnoise(vec2(13.8 * air.x - 4.2, 24.6 * (air.y + .03 * air.x) + 12.9));
        front = smoothstep(.24, .80, .58 * rolling + .29 * broken + .13 * mistTexture);
        mist = .42 * squall * (1.0 - .45 * u_whiteout) * front * (.70 + .30 * mistTexture) * (.67 + .33 * ridges);
        if (u_whiteout > .001) {
          float broad = vnoise(vec2(.86 * air.x + .16 * air.y + 3.29, 1.7 * air.y + .09 * air.x - .82));
          float body = .65 * broad + .20 * rolling + .15 * broken;
          head = smoothstep(.27, .71, body + .065 * (mistTexture - .5));
          float core = smoothstep(.45, .65, body + .04 * (mistTexture - .5));
          float gust = u_whiteout * (.16 * head + .68 * core) * (.80 + .20 * mistTexture) * (.73 + .27 * ridges);
          mist += (1.0 - mist) * gust;
        }
      }
      float aSheet = packet * activeSnow * .032 * moderate + mist;
      float airLight = clamp(.26 * mistTexture + .48 * backlight + .34 * u_whiteout * head, 0.0, 1.0);
      snowRgb = mix(vec3(.81, .875, .936), vec3(.941, .966, .989), airLight) * aSheet;
      snowAlpha = aSheet;

    }

    // Horizontal spindrift starts at the visible top of the track bed.
    float groundDepth = max(1.0 - u_groundY, .006);
    float groundBand = smoothstep(u_groundY, u_groundY + groundDepth * .38, uv01.y);
    if (u_stage == 0 && groundBand > 0.005 && u_drift > .002) {
      float travel = u_time * .45 + u_travel * 4.45;
      vec2 gCoord = vec2(uv.x * 2.4 + travel, (uv01.y - u_groundY) / groundDepth * 4.2);
      float gn1 = fbm(gCoord);
      float gn2 = fbm(gCoord * vec2(2.3, 1.8) + vec2(7.6, 5.3));
      float drift = smoothstep(0.31, 0.76, gn1 * 0.62 + gn2 * 0.38);
      float aGround = groundBand * drift * u_drift * (.27 + .46 * squall);
      vec3 gCol = mix(vec3(0.86, 0.91, 0.96), vec3(0.96, 0.985, 1.00), drift);
      snowRgb = gCol * aGround + snowRgb * (1.0 - aGround);
      snowAlpha = aGround + snowAlpha * (1.0 - aGround);
    }

    // 3. Procedural crystalline window-corner frost & exterior packed snow ledges (bottom gasket + transom top lip).
    float frostAmt = clamp(u_frost, 0.0, 1.0);
    if (u_stage == 1 && frostAmt > 0.01) {
      vec2 edgeD = min(uv01, 1.0 - uv01) * vec2(aspect, 1.0);
      float transom = abs(u_transomY - uv01.y);
      float border = 1.0 - smoothstep(0.0, mix(.028, .078, frostAmt), min(edgeD.x, edgeD.y));
      float corner = 1.0 - smoothstep(0.0, mix(.12, .31, frostAmt), length(vec2(edgeD.x, min(edgeD.y, transom))));
      float windward = mix(.74, 1.18, smoothstep(.37, .96, uv01.x) * u_wind);
      float zone = clamp((border * 0.37 + corner * 1.10) * windward, 0.0, 1.0);
      if (zone > 0.005) {
        float n1 = fbm(uv * 11.5 + vec2(4.2, 8.7));
        float n2 = fbm(uv * 29.0 - vec2(12.4, 5.1));
        float crystalVein = pow(1.0 - abs(n2 * 2.0 - 1.0), 2.4);
        float rime = smoothstep(0.58 - 0.46 * frostAmt, 0.95, zone * (0.62 + 0.58 * n1) + crystalVein * zone * 0.38);
        float aFrost = clamp(rime * frostAmt * .82, 0.0, 0.72);
        vec3 frostCol = mix(vec3(0.84, 0.91, 0.98), vec3(0.97, 0.99, 1.00), crystalVein);
        snowRgb = frostCol * aFrost + snowRgb * (1.0 - aFrost);
        snowAlpha = aFrost + snowAlpha * (1.0 - aFrost);
      }

      // Exterior wind-packed snow rim clinging along the bottom window gasket ledge.
      float sillDist = -dBox / u_res.y;
      sillDist = mix(1.0 - uv01.y, sillDist, smoothstep(.83, .98, uv01.y));
      if (sillDist < .065) {
        float sillNoise = fbm(vec2(uv.x * 7.5 + 2.3, 1.7));
        float sillHeight = (0.004 + 0.033 * frostAmt) * (0.45 + 0.95 * sillNoise);
        float sillMask = 1.0 - smoothstep(sillHeight * 0.32, sillHeight + 0.006, sillDist);
        float shade = smoothstep(0.0, sillHeight, sillDist);
        vec3 sillCol = mix(vec3(0.76, 0.84, 0.92), vec3(0.97, 0.99, 1.00), shade);
        float aSill = sillMask * (.90 * frostAmt);
        snowRgb = sillCol * aSill + snowRgb * (1.0 - aSill);
        snowAlpha = aSill + snowAlpha * (1.0 - aSill);
      }

      // Delicate packed snow dusting perched along the upper lip of the exterior transom bar.
      float aboveBar = u_transomY - uv01.y;
      if (u_transomY > 0.04 && u_transomY < 0.35 && aboveBar > -0.002 && aboveBar < .026) {
        float trNoise = fbm(vec2(uv.x * 9.5 + 8.1, 3.4));
        float trH = (0.005 + 0.010 * frostAmt) * (0.45 + 0.95 * trNoise);
        if (aboveBar > -0.002 && aboveBar < trH + 0.005) {
          float trMask = (1.0 - smoothstep(trH * 0.25, trH + 0.004, aboveBar)) * smoothstep(-0.002, 0.002, aboveBar);
          float aTr = trMask * (.78 * frostAmt) * windward;
          vec3 trCol = mix(vec3(0.84, 0.90, 0.96), vec3(0.98, 0.995, 1.00), smoothstep(0.0, trH, aboveBar));
          snowRgb = trCol * aTr + snowRgb * (1.0 - aTr);
          snowAlpha = aTr + snowAlpha * (1.0 - aTr);
        }
      }
    }

    fragColor = vec4(snowRgb * winMask, clamp(snowAlpha, 0.0, 1.0) * winMask);
  }`;

  const SNOW_SPRITE_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in vec4 a_position; // center, radius, opacity
  layout(location = 1) in vec4 a_motion;   // back vector, face width, angle
  layout(location = 2) in vec4 a_surface;  // contour phase, depth, light, near
  uniform vec2 u_res;
  uniform float u_aspect;
  out vec2 v_local;
  flat out vec4 v_position;
  flat out vec4 v_motion;
  flat out vec4 v_surface;

  void main() {
    vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec2 back = a_motion.xy;
    float pad = a_position.z * (a_surface.w > .5 ? 1.38 : 1.19) + .55 / u_res.y;
    vec2 local = mix(min(vec2(0.0), back) - pad, max(vec2(0.0), back) + pad, corner);
    vec2 p = a_position.xy + local;
    v_local = local;
    v_position = a_position;
    v_motion = a_motion;
    v_surface = a_surface;
    gl_Position = vec4(2.0 * p.x / u_aspect - 1.0, 1.0 - 2.0 * p.y, 0.0, 1.0);
  }`;

  const SNOW_SPRITE_FS = `#version 300 es
  precision highp float;
  uniform vec2 u_res;
  uniform float u_radius;
  in vec2 v_local;
  flat in vec4 v_position;
  flat in vec4 v_motion;
  flat in vec4 v_surface;
  out vec4 fragColor;

  void main() {
    float radius = max(v_position.z, .0001);
    float edge = clamp(.50 / (radius * u_res.y), .04, .38);
    bool near = v_surface.w > .5;
    vec2 local = v_local / radius;
    vec2 back = v_motion.xy / radius;
    float projection = clamp(dot(local, back) / max(dot(back, back), .00001), 0.0, 1.0);
    float streak = (1.0 - smoothstep(.16, .75 + edge, length(local - back * projection))) *
      (1.0 - .60 * projection) * smoothstep(.015, .20, length(back));

    float contour = length(local * vec2(1.08, .97));
    float glint = 1.0;
    if (near) {
      float c = cos(v_motion.w), s = sin(v_motion.w);
      vec2 body = mat2(c, -s, s, c) * local;
      body.x /= max(.15, v_motion.z);
      float tip = atan(body.y, body.x + .000001);
      float outline = 1.0 + .20 * cos(3.0 * tip + v_surface.x) + .10 * sin(5.0 * tip);
      contour = length(body) / outline;
      glint = .96 + .12 * clamp(body.x, -1.0, 1.0);
    }
    float flake = 1.0 - smoothstep(near ? .48 : .29, 1.0 + edge * .30, contour);
    float a = max(flake, streak * (near ? .12 : .40)) * v_position.w;
    if (a < .002) discard;

    vec2 q = abs(gl_FragCoord.xy - .5 * u_res) - .5 * u_res + u_radius;
    float distance = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - u_radius;
    a *= 1.0 - smoothstep(-1.0, .75, distance);
    vec3 snow = mix(vec3(.998, .999, 1.0), vec3(.87, .935, .99), v_surface.y);
    if (near) {
      float faceLight = smoothstep(.24, .84, v_motion.z);
      snow = mix(vec3(.79, .85, .91), vec3(.995, .998, 1.0), faceLight);
    }
    snow *= min(1.0, glint * mix(.83, 1.0, clamp(v_surface.z, 0.0, 1.0)));
    fragColor = vec4(snow * a, a);
  }`;

  const SNOW_SPRITE_FLOATS = 12;
  let snowGl = null;
  function getSnowGl(w, h) {
    if (snowGl === false) return null;
    if (!snowGl) {
      try {
        const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (!canvas) { snowGl = false; return null; }
        const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false});
        if (!gl) { snowGl = false; return null; }
        const compile = (type, src) => {
          const sh = gl.createShader(type);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('Terrain snow shader compile failed:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
          }
          return sh;
        };
        const program = (vertex, fragment) => {
          const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
          const prog = vs && fs && gl.createProgram();
          if (prog) {
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
          }
          if (vs) gl.deleteShader(vs);
          if (fs) gl.deleteShader(fs);
          if (!prog) return null;
          if (gl.getProgramParameter(prog, gl.LINK_STATUS)) return prog;
          console.warn('Terrain snow shader link failed:', gl.getProgramInfoLog(prog));
          gl.deleteProgram(prog);
          return null;
        };
        const prog = program(SNOW_VS, SNOW_FS);
        const spriteProg = prog && program(SNOW_SPRITE_VS, SNOW_SPRITE_FS);
        if (!spriteProg) {
          if (prog) gl.deleteProgram(prog);
          snowGl = false;
          return null;
        }
        const vao = gl.createVertexArray();
        const spriteVao = gl.createVertexArray(), spriteBuffer = gl.createBuffer();
        if (!vao || !spriteVao || !spriteBuffer) { snowGl = false; return null; }
        gl.bindVertexArray(spriteVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
        const stride = SNOW_SPRITE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
        for (let i = 0; i < 3; i++) {
          gl.enableVertexAttribArray(i);
          gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, 4 * i * Float32Array.BYTES_PER_ELEMENT);
          gl.vertexAttribDivisor(i, 1);
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        snowGl = {
          canvas, gl, prog, vao, spriteProg, spriteVao, spriteBuffer, spriteCapacity: 0,
          uRes: gl.getUniformLocation(prog, 'u_res'),
          uRadius: gl.getUniformLocation(prog, 'u_radius'),
          uStage: gl.getUniformLocation(prog, 'u_stage'),
          uTransomY: gl.getUniformLocation(prog, 'u_transomY'),
          uTime: gl.getUniformLocation(prog, 'u_time'),
          uFrost: gl.getUniformLocation(prog, 'u_frost'),
          uWind: gl.getUniformLocation(prog, 'u_wind'),
          uTravel: gl.getUniformLocation(prog, 'u_travel'),
          uGroundY: gl.getUniformLocation(prog, 'u_groundY'),
          uShift: gl.getUniformLocation(prog, 'u_shift'),
          uActivity: gl.getUniformLocation(prog, 'u_activity'),
          uWhiteout: gl.getUniformLocation(prog, 'u_whiteout'),
          uDrift: gl.getUniformLocation(prog, 'u_drift'),
          spriteRes: gl.getUniformLocation(spriteProg, 'u_res'),
          spriteAspect: gl.getUniformLocation(spriteProg, 'u_aspect'),
          spriteRadius: gl.getUniformLocation(spriteProg, 'u_radius'),
        };
      } catch (e) {
        snowGl = false;
        return null;
      }
    }
    if (snowGl.gl.isContextLost()) { snowGl = false; return null; }
    // Use the viewport pixel grid up to the shader's resolution cap.
    const scale = Math.min(1, 1600 / Math.max(1, w), 900 / Math.max(1, h));
    const pw = Math.max(2, Math.round(w * scale)), ph = Math.max(2, Math.round(h * scale));
    if (snowGl.canvas.width !== pw || snowGl.canvas.height !== ph) {
      snowGl.canvas.width = pw;
      snowGl.canvas.height = ph;
    }
    return {state: snowGl, pw, ph, scale};
  }

  function snowHash(i, salt) {
    const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function clipWindow(ctx, win) {
    ctx.beginPath();
    ctx.roundRect(win.x, win.y, win.w, win.h, win.r);
    ctx.clip();
  }

  // Canvas2D fallback for static deposits. The same positions persist as the
  // surface load grows or shrinks, independently of the moving precipitation.
  function drawDryEdges(ctx, win, amount, transomFrac, snow) {
    if (amount <= .008) return;
    const {x, y, w, h} = win;
    const light = snow ? '225,239,248' : '204,170,127';
    const dark = snow ? '146,171,193' : '104,76,49';
    for (const lip of [transomFrac, 1]) {
      const edge = y + h * lip;
      const height = h * (.004 + (snow ? .030 : .020) * amount) * (lip === 1 ? 1 : .56);
      const g = ctx.createLinearGradient(0, edge - height, 0, edge);
      g.addColorStop(0, 'transparent');
      g.addColorStop(.56, 'rgba(' + light + ',' + .78 * amount + ')');
      g.addColorStop(1, 'rgba(' + dark + ',' + .82 * amount + ')');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, edge);
      for (let i = 0; i <= 36; i++) {
        const corner = Math.pow(snow ? i / 36 : 1 - i / 36, 7);
        const pile = .27 + .48 * snowHash(i, lip === 1 ? 26 : 27) + .23 * corner;
        ctx.lineTo(x + w * i / 36, edge - height * pile);
      }
      ctx.lineTo(x + w, edge);
      ctx.fill();
    }
    // Small crystal branches or dry speckle clustered in asymmetric corners.
    for (const lip of [0, transomFrac, 1]) {
      for (let i = 0; i < 56; i++) {
        const side = (i % 4 === 0) === snow;
        const dx = Math.pow(snowHash(i, 32 + lip), 2) * h * (.055 + .14 * amount);
        const dy = Math.pow(snowHash(i, 33 + lip), 2) * h * (.028 + .11 * amount);
        const px = side ? x + dx : x + w - dx;
        const py = y + h * lip + ((lip === 0 || lip !== 1 && i % 2 === 0) ? dy : -dy);
        const size = h * (.001 + .004 * snowHash(i, 34)) * (.45 + .55 * amount);
        ctx.strokeStyle = 'rgba(' + (i % 3 === 0 ? dark : light) + ',' + (.23 + .55 * snowHash(i, 35)) * amount + ')';
        ctx.lineWidth = Math.max(.55, size * .39);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + size * (snow ? .7 : 2.2), py - size * (snow ? 1 : .23));
        if (snow) {
          ctx.moveTo(px + size * .37, py - size * .54);
          ctx.lineTo(px - size * .3, py - size * .8);
        }
        ctx.stroke();
      }
    }
  }

  function drawGroundDrift(ctx, win, travel, amount, color) {
    if (amount <= .02) return;
    for (let i = 0; i < 5; i++) {
      const phase = ((snowHash(i, 25) - travel * (.16 + .13 * snowHash(i, 20))) % 1 + 1) % 1;
      const cx = win.x + win.w * phase;
      const cy = win.y + win.h * (.75 + .22 * snowHash(i, 21));
      const width = win.w * (.09 + .11 * snowHash(i, 22));
      const height = win.h * (.01 + .018 * snowHash(i, 23));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(width, height);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(' + color + ',' + .26 * amount + ')');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  // Depth bands set the apparent size and focus. Each seed has a free position,
  // drag, terminal velocity and tumble, even when every particle in a band is visible.
  const snowPlanes = [
    {density: 2920, back: 1, front: .67, minRadius: .00075, maxRadius: .00275, seed: 713951},
    {density: 1030, back: .76, front: .26, minRadius: .00265, maxRadius: .00925, seed: 480209},
    {density: 89, back: .34, front: .02, minRadius: .0071, maxRadius: .0242, seed: 193939},
  ].map(plane => ({...plane, random: randomStream(plane.seed), flakes: []}));
  const snowDensity = snowPlanes.reduce((sum, plane) => sum + plane.density, 0);
  const snowBatch = {data: new Float32Array(0), count: 0};

  function growSnowPlane(plane, count, near) {
    const rand = plane.random, tau = 2 * Math.PI;
    while (plane.flakes.length < count) {
      const z = rand(), depth = plane.front + z * (plane.back - plane.front);
      const mass = rand(), airborne = (1 - mass) * depth;
      const radius = plane.minRadius + (plane.maxRadius - plane.minRadius) * Math.pow(rand(), near ? 1.85 : 1.35);
      plane.flakes.push({
        x: rand(), y: rand(), rank: rand(), depth, radius,
        drag: (1.24 - .62 * depth) * (.53 + .84 * rand()),
        fall: (1.23 - .66 * depth) * (.45 + .55 * mass + .50 * rand()),
        jet: (near ? .012 : .028) + airborne * (.19 + .23 * rand()),
        slip: (.5 - rand()) * (.036 + .041 * airborne),
        a: rand() * tau, b: rand() * tau,
        roll: .66 + 1.64 * rand(), flutter: 1.65 + 2.95 * rand(),
        sway: (.004 + .012 * (1 - depth)) * (.43 + .91 * rand()),
        lift: (.0011 + .0050 * (1 - depth)) * (.55 + rand()),
        spin: (rand() < .5 ? -1 : 1) * (.38 + 1.05 * rand()),
        shape: rand() * tau, light: .69 + .31 * rand(),
      });
    }
  }

  // Positions use absolute song time and integrated wind. No previous frame,
  // screen cell or particle lifetime is needed to seek to the same snowfall.
  // One packed instance feeds both renderers; all lengths are in window heights.
  function snowParticles(win, time, motion, activity) {
    snowBatch.count = 0;
    const {active, moderate, heavy, squall, whiteout} = activity;
    if (active <= .001 || !(win.w > 0 && win.h > 0)) return snowBatch;
    const mist = drawSnowMist(null, win, motion, activity);
    const aspect = win.w / win.h, margin = .085;
    const width = aspect + 2 * margin, height = 1 + 2 * margin;
    const area = Math.min(6.75, width * height);
    const floats = (Math.ceil(area * snowDensity) + snowPlanes.length) * SNOW_SPRITE_FLOATS;
    if (snowBatch.data.length < floats) snowBatch.data = new Float32Array(Math.ceil(floats / 4096) * 4096);
    const data = snowBatch.data;
    for (let band = 0; band < snowPlanes.length; band++) {
      const plane = snowPlanes[band], near = band === 2, far = band === 0;
      const count = Math.ceil(plane.density * area);
      growSnowPlane(plane, count, near);
      const base = near ? .013 + .094 * moderate + .075 * heavy :
        far ? .010 + .078 * moderate + .125 * heavy : .025 + .21 * moderate + .19 * heavy;
      const gustShare = near ? .062 * squall + .10 * whiteout :
        far ? .31 * squall + .45 * whiteout : .34 * squall + .36 * whiteout;
      const upper = base * 1.15 + gustShare + .023;
      for (let i = 0; i < count; i++) {
        const p = plane.flakes[i];
        if (p.rank > upper) continue;
        const xWind = motion.x * p.drag - motion.travel * p.jet + time * p.slip;
        const yFall = motion.y * p.fall;
        // Slow turns follow the moving air. Fast flutter and the fall speed
        // belong to this crystal, so neighbors overtake and separate.
        const turn = p.roll * time + .49 * motion.travel + p.a;
        const flutter = p.flutter * time + p.b;
        const sinTurn = Math.sin(turn), cosTurn = Math.cos(turn);
        const sinFlutter = Math.sin(flutter), cosFlutter = Math.cos(flutter);
        const xx = p.x * width + xWind + p.sway * (sinTurn + .37 * sinFlutter);
        const yy = p.y * height + yFall + p.lift * (cosTurn + .64 * sinFlutter);
        const x = width * snowPhase(xx / width) - margin, y = height * snowPhase(yy / height) - margin;
        const r = p.radius, reach = near ? 1.45 * r : 4.9 * r;
        if (x < -reach || x > aspect + reach || y < -reach || y > 1 + reach) continue;
        const front = mist ? sampleSnowMist(mist, x / aspect, y) : 0;
        const parcel = .5 + .28 * Math.sin(5.4 * x + 3.7 * y - .57 * motion.x) +
          .22 * Math.sin(8.3 * y - 4.3 * x + .51 * motion.x);
        const threshold = base * (.78 + .36 * parcel) + gustShare * (.10 + .90 * front);
        const visible = ease((threshold + .020 - p.rank) / .040);
        if (visible < .003) continue;
        const turnRate = p.roll + .49 * motion.wind;
        const vx = motion.vx * p.drag - motion.wind * p.jet + p.slip +
          p.sway * (turnRate * cosTurn + .37 * p.flutter * cosFlutter);
        const vy = motion.vy * p.fall + p.lift * (-turnRate * sinTurn + .64 * p.flutter * cosFlutter);
        const inGust = squall * (.21 + .79 * front);
        const shutter = near ? .012 : .010 + .021 * heavy + .028 * inGust;
        const exposure = Math.min(shutter, r * (near ? .55 : .70 + 3.5 * inGust) / Math.max(.001, Math.hypot(vx, vy)));
        const face = near ? .26 + .74 * Math.abs(Math.cos(time * p.roll + p.b)) : 1;
        const opacity = near ? (.62 + .28 * moderate) * (.69 + .31 * face)
          : (far ? .28 : .41) + .15 * moderate + .15 * heavy + .13 * inGust;
        const k = snowBatch.count++ * SNOW_SPRITE_FLOATS;
        data[k] = x; data[k + 1] = y; data[k + 2] = r; data[k + 3] = active * visible * opacity;
        data[k + 4] = -vx * exposure; data[k + 5] = -vy * exposure;
        data[k + 6] = face; data[k + 7] = p.a + time * p.spin + .57 * sinTurn;
        data[k + 8] = p.shape; data[k + 9] = p.depth;
        data[k + 10] = p.light; data[k + 11] = near ? 1 : 0;
      }
    }
    return snowBatch;
  }

  function drawSnowFlake(ctx, x, y, radius, face, angle, shape, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.16);
    const lit = strengthRamp(face, .24, .84);
    const r = Math.round(202 + 52 * lit), green = Math.round(217 + 37 * lit), b = Math.round(232 + 23 * lit);
    g.addColorStop(0, 'rgba(' + r + ',' + green + ',' + b + ',' + alpha + ')');
    g.addColorStop(.58, 'rgba(' + (r - 7) + ',' + (green - 4) + ',' + b + ',' + alpha * .85 + ')');
    g.addColorStop(1, 'rgba(226,242,254,0)');
    ctx.fillStyle = g;
    const c = Math.cos(angle), s = Math.sin(angle), points = [];
    for (let j = 0; j < 7; j++) {
      const a = j / 7 * 2 * Math.PI;
      const r = radius * (1 + .21 * Math.cos(3 * a + shape) + .11 * Math.sin(5 * a));
      const u = r * Math.cos(a) * face, v = r * Math.sin(a);
      points.push([x + u * c - v * s, y + u * s + v * c]);
    }
    ctx.beginPath();
    ctx.moveTo((points[6][0] + points[0][0]) * .5, (points[6][1] + points[0][1]) * .5);
    for (let j = 0; j < points.length; j++) {
      const [px, py] = points[j], [nextX, nextY] = points[(j + 1) % points.length];
      ctx.quadraticCurveTo(px, py, (px + nextX) * .5, (py + nextY) * .5);
    }
    ctx.fill();
  }

  function snowMistHash(x, y) {
    const a = snowPhase(x * .1031), b = snowPhase(y * .1031);
    const offset = a * (b + 33.33) + b * (a + 33.33) + a * (a + 33.33);
    return snowPhase((a + b + 2 * offset) * (a + offset));
  }

  function snowMistNoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y);
    const u = ease(x - i), v = ease(y - j);
    const a = snowMistHash(i, j), b = snowMistHash(i, j + 1);
    const top = a + (snowMistHash(i + 1, j) - a) * u;
    const bottom = b + (snowMistHash(i + 1, j + 1) - b) * u;
    return top + (bottom - top) * v;
  }

  let snowMistField;
  function prepareSnowMist(aspect, motion, squall, whiteout) {
    const previous = snowMistField;
    if (previous?.aspect === aspect && previous.x === motion.x && previous.y === motion.y &&
      previous.travel === motion.travel && previous.squall === squall && previous.whiteout === whiteout) return previous;

    // The same optical field controls particle visibility on both backends.
    const rows = 52, cols = Math.ceil(rows * Math.max(.4, Math.min(2.8, aspect)));
    if (previous?.cols !== cols) {
      snowMistField = {cols, rows, samples: new Float32Array(cols * rows), optics: new Uint8ClampedArray(cols * rows * 2)};
    }
    const field = snowMistField, {samples, optics} = field;
    Object.assign(field, {aspect, x: motion.x, y: motion.y, travel: motion.travel, squall, whiteout, paintDirty: true});
    const shiftX = -.73 * motion.x + .31 * motion.travel, shiftY = -.28 * motion.y;
    const opacity = .42 * squall * (1 - .45 * whiteout);
    for (let j = 0; j < rows; j++) {
      const y = (j + .5) / rows, airY = y - .5 + shiftY;
      const ridges = strengthRamp(y, .06, .32) * (1 - strengthRamp(y, .73, 1));
      const lightY = 1 - strengthRamp(y, .48, .95);
      for (let i = 0; i < cols; i++) {
        const x = (i + .5) / cols, airX = (x - .5) * aspect + shiftX;
        const rolling = snowMistNoise(1.81 * airX - .21 * airY + 7.1, 2.83 * airY + .13 * airX - 3.9);
        const broken = snowMistNoise(4.1 * airX + 3.2, 6.7 * (airY + .075 * airX) + 9.6);
        const texture = snowMistNoise(13.8 * airX - 4.2, 24.6 * (airY + .03 * airX) + 12.9);
        let front = strengthRamp(.58 * rolling + .29 * broken + .13 * texture, .24, .80);
        let mist = opacity * front * (.70 + .30 * texture) * (.67 + .33 * ridges), head = 0;
        if (whiteout > .001) {
          const broad = snowMistNoise(.86 * airX + .16 * airY + 3.29, 1.7 * airY + .09 * airX - .82);
          const body = .65 * broad + .20 * rolling + .15 * broken;
          head = strengthRamp(body + .065 * (texture - .5), .27, .71);
          const core = strengthRamp(body + .04 * (texture - .5), .45, .65);
          const gust = whiteout * (.16 * head + .68 * core) * (.80 + .20 * texture) * (.73 + .27 * ridges);
          mist += (1 - mist) * gust;
          front += whiteout * (.39 * head + .50 * core - .89 * front);
        }
        const index = j * cols + i;
        samples[index] = front;
        optics[index * 2] = 255 * mist;
        optics[index * 2 + 1] = 255 * clamp(.26 * texture + .48 * strengthRamp(x, .18, .94) * lightY + .34 * whiteout * head);
      }
    }
    return field;
  }

  function drawSnowMist(ctx, win, motion, {squall, whiteout}) {
    if (squall <= .001) return null;
    const field = prepareSnowMist(win.w / win.h, motion, squall, whiteout);
    if (!ctx || typeof document === 'undefined') return field;
    if (!field.canvas) Object.assign(field, materialCanvas(field.cols, field.rows));
    if (field.paintDirty) {
      const pixels = field.image.data;
      for (let i = 0; i < field.samples.length; i++) {
        const light = field.optics[i * 2 + 1];
        pixels[i * 4] = 255 * .81 + .131 * light;
        pixels[i * 4 + 1] = 255 * .875 + .091 * light;
        pixels[i * 4 + 2] = 255 * .936 + .053 * light;
        pixels[i * 4 + 3] = field.optics[i * 2];
      }
      field.ctx.putImageData(field.image, 0, 0);
      field.paintDirty = false;
    }
    ctx.drawImage(field.canvas, win.x, win.y, win.w, win.h);
    return field;
  }

  function sampleSnowMist({samples, cols, rows}, x, y) {
    const gx = Math.max(0, Math.min(cols - 1, x * cols - .5));
    const gy = Math.max(0, Math.min(rows - 1, y * rows - .5));
    const i = Math.floor(gx), j = Math.floor(gy);
    const k = j * cols + i, right = i < cols - 1 ? 1 : 0, down = j < rows - 1 ? cols : 0;
    const a = samples[k], b = samples[k + down];
    const top = a + (samples[k + right] - a) * (gx - i);
    const bottom = b + (samples[k + down + right] - b) * (gx - i);
    return top + (bottom - top) * (gy - j);
  }

  // Sub-pixel crystals can share a paint call. Keep individual radii and
  // trails inside each path, and draw the tumbling close flakes last.
  const snowPaintBuckets = Array.from({length: 64}, () => []);
  function drawSnowAir(ctx, win, time, motion, activity) {
    if (activity.active < .001) return;
    drawSnowMist(ctx, win, motion, activity);
    const {data, count} = snowParticles(win, time, motion, activity);
    for (const bucket of snowPaintBuckets) bucket.length = 0;
    let firstNear = count;
    for (let i = 0; i < count; i++) {
      const k = i * SNOW_SPRITE_FLOATS;
      if (data[k + 11]) { firstNear = i; break; }
      const opacity = Math.min(31, Math.round(31 * data[k + 3] * data[k + 10]));
      if (opacity > 0) snowPaintBuckets[(data[k + 9] < .67 ? 32 : 0) + opacity].push(k);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < snowPaintBuckets.length; i++) {
      const bucket = snowPaintBuckets[i];
      if (!bucket.length) continue;
      const mid = i >= 32, alpha = (i % 32) / 31;
      const color = mid ? '235,244,251' : '225,237,249';
      ctx.strokeStyle = 'rgba(' + color + ',' + alpha * (.20 + .15 * activity.squall) + ')';
      ctx.lineWidth = win.h * (mid ? .0022 : .0011);
      ctx.beginPath();
      for (const k of bucket) {
        const x = win.x + win.h * data[k], y = win.y + win.h * data[k + 1];
        ctx.moveTo(x, y);
        ctx.lineTo(x + win.h * data[k + 4], y + win.h * data[k + 5]);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + color + ',' + alpha + ')';
      ctx.beginPath();
      for (const k of bucket) {
        const x = win.x + win.h * data[k], y = win.y + win.h * data[k + 1], r = win.h * data[k + 2];
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }
      ctx.fill();
    }
    for (let i = firstNear; i < count; i++) {
      const k = i * SNOW_SPRITE_FLOATS;
      drawSnowFlake(ctx, win.x + win.h * data[k], win.y + win.h * data[k + 1], win.h * data[k + 2],
        data[k + 6], data[k + 7], data[k + 8], data[k + 3] * data[k + 10]);
    }
  }

  function drawBlizzard(ctx, win, t, weather, dpr = 1, transomFrac = .14, groundY = .95) {
    const frost = surfaceAmount(weather, clamp(weather?.humidity || 0));
    const motion = snowMotion(t, weather);
    const activity = snowActivity(weather, motion.wind);
    groundY = clamp(groundY);
    const gpu = getSnowGl(win.w * dpr, win.h * dpr);
    if (gpu) {
      const {state, pw, ph, scale} = gpu;
      const {gl, prog, vao} = state;
      const air = activity.active > .001 || activity.drift > .002;
      const rim = frost > .01;
      if (!air && !rim) return;
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const radius = win.r * dpr * scale;
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(state.uRes, pw, ph);
      gl.uniform1f(state.uRadius, radius);
      gl.uniform1f(state.uTransomY, transomFrac);
      gl.uniform1f(state.uTime, t);
      gl.uniform1f(state.uFrost, frost);
      gl.uniform1f(state.uWind, motion.wind);
      gl.uniform1f(state.uTravel, motion.travel);
      gl.uniform1f(state.uGroundY, groundY);
      gl.uniform2f(state.uShift, motion.x, motion.y);
      gl.uniform4f(state.uActivity, activity.active, activity.moderate, activity.heavy, activity.squall);
      gl.uniform1f(state.uWhiteout, activity.whiteout);
      gl.uniform1f(state.uDrift, activity.drift);
      if (air) {
        gl.uniform1i(state.uStage, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (activity.active > .001) {
        const {data, count} = snowParticles(win, t, motion, activity);
        if (count) {
          gl.useProgram(state.spriteProg);
          gl.bindVertexArray(state.spriteVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, state.spriteBuffer);
          if (count > state.spriteCapacity) {
            state.spriteCapacity = 2 ** Math.ceil(Math.log2(count));
            gl.bufferData(gl.ARRAY_BUFFER, state.spriteCapacity * SNOW_SPRITE_FLOATS * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);
          }
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * SNOW_SPRITE_FLOATS);
          gl.uniform2f(state.spriteRes, pw, ph);
          gl.uniform1f(state.spriteAspect, win.w / win.h);
          gl.uniform1f(state.spriteRadius, radius);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        }
      }
      if (rim) {
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform1i(state.uStage, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      ctx.drawImage(state.canvas, win.x, win.y, win.w, win.h);
      return;
    }
    ctx.save();
    clipWindow(ctx, win);
    drawSnowAir(ctx, win, t, motion, activity);
    const groundDepth = win.h * (1 - groundY);
    const drift = activity.drift * (1 + .60 * activity.squall);
    if (groundDepth > 0 && drift > .02) {
      const bottom = win.y + win.h;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(win.x, bottom - groundDepth, win.w, groundDepth, 0);
      ctx.clip();
      const band = {x: win.x - win.w * .36, w: win.w * 1.72, y: bottom - 4 * groundDepth, h: 4 * groundDepth};
      drawGroundDrift(ctx, band, t * .06 + 1.16 * motion.travel, drift, '230,241,250');
      ctx.restore();
    }
    drawDryEdges(ctx, win, frost, transomFrac, true);
    ctx.restore();
  }

  function drawGlassFrost() { /* Folded into the snow and crystalline frost pass. */ }

  // ---------- Sandstorm (浮尘到沙尘暴 · 河西走廊 / Haboob) ----------
  const sandLights = new WeakMap();
  function sandLight(base) {
    const existing = sandLights.get(base);
    if (existing) return existing;
    const mix = (a, b, p) => a.map((value, i) => value + (b[i] - value) * p);
    const haze = [186, 163, 128];
    const sky = [[125, 109, 89], [159, 138, 108], [192, 164, 126], [218, 185, 138]];
    const floor = [[186, 144, 96], [154, 116, 74], [122, 88, 54]];
    const output = {
      ...base, name: base.name + ' · sandstorm', weatherOvercast: true, weatherSand: true,
      sky: base.sky.map(([at, color], i) => [at, mix(sky[i], color, .06)]),
      floor: base.floor.map(([at, color], i) => [at, mix(floor[Math.min(i, floor.length - 1)], color, .06)]),
      glow: {...base.glow, c: [242, 200, 138], a: .28},
      virga: {...base.virga, a: 0},
      haze,
      light: [228, 188, 132],
      shade: [74, 48, 30],
      band: {c: [203, 174, 134], a: .53},
      air: {c: [200, 169, 124], a: .17},
      litK: base.litK * .82,
      castA: base.castA * .46,
    };
    sandLights.set(base, output);
    return output;
  }

  const sandClouds = new Map();
  function sandCloud(key) {
    if (sandClouds.has(key)) return sandClouds.get(key);
    const source = materials.get(key);
    if (!source) return null;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const g = canvas.getContext('2d');
    g.filter = 'sepia(.95) hue-rotate(-14deg) saturate(1.75) brightness(.78) contrast(1.04)';
    g.drawImage(source, 0, 0);
    sandClouds.set(key, canvas);
    return canvas;
  }

  function drawSandSky(ctx, L, t, weather) {
    const far = weather.farRain || 0;
    const storm = weather.stormDrive || 0;
    const tension = Number.isFinite(weather.tension) ? weather.tension : .5;
    const ceiling = clamp((.30 * ease((far - .08) / .7) + .70 * storm) * (.84 + .32 * tension));
    const travel = windTravel(weather, t, .55);
    const drift = Math.sin(travel * .055);
    const x = L.left - (.16 + .16 * drift) * L.Wm;
    const w = 1.48 * L.Wm;
    const lowX = L.left - (.15 + .16 * drift) * L.Wm;
    const lowW = 1.44 * L.Wm;

    // 1. Dusty amber-ochre sky darkening into apocalyptic burnt-sienna dust wall ceiling in peak sandstorm.
    const sky = ctx.createLinearGradient(0, 125, 0, 610);
    sky.addColorStop(0, 'rgba(81,66,52,' + (.21 + .52 * ceiling).toFixed(4) + ')');
    sky.addColorStop(.45, 'rgba(132,104,75,' + (.16 + .34 * ceiling).toFixed(4) + ')');
    sky.addColorStop(.82, 'rgba(181,144,97,' + (.08 + .25 * ceiling).toFixed(4) + ')');
    sky.addColorStop(1, 'rgba(202,150,94,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(L.left - 10, 125, L.Wm + 20, 485);

    // 2. Dust-veiled pale apricot desert sun dimly glowing in upper-right (visible in calm haze, choked out at peak haboob).
    const sunVis = clamp(1 - .76 * ceiling);
    if (sunVis > .06) {
      const sx = L.left + L.Wm * .74 + Math.sin(t * .03) * 10, sy = 252;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const sg = ctx.createRadialGradient(sx, sy, 6, sx, sy, 290);
      sg.addColorStop(0, 'rgba(255,228,176,' + (.42 * sunVis).toFixed(4) + ')');
      sg.addColorStop(.16, 'rgba(248,204,138,' + (.24 * sunVis).toFixed(4) + ')');
      sg.addColorStop(.48, 'rgba(224,166,96,' + (.10 * sunVis).toFixed(4) + ')');
      sg.addColorStop(1, 'rgba(210,148,80,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 300, sy - 300, 600, 600);
      ctx.restore();
    }

    const thin = sandCloud('cloud-thin') || materials.get('cloud-thin');
    const low = sandCloud('cloud-low') || materials.get('cloud-low');
    if (thin) {
      ctx.save();
      ctx.globalAlpha *= .44 + .40 * ceiling;
      ctx.drawImage(thin, x - .08 * L.Wm, 90 + 10 * storm, w * 1.16, 336 + 54 * storm);
      ctx.restore();
    }
    if (low) {
      ctx.save();
      ctx.globalAlpha *= .42 + .46 * ceiling;
      ctx.drawImage(low, lowX - L.Wm * .11 * Math.sin(travel * .082), 152 + 34 * storm, lowW, 332 + 58 * storm);
      ctx.restore();
    }
  }

  const sandWalls = new Map();
  function sandWall(variant) {
    if (sandWalls.has(variant)) return sandWalls.get(variant);
    if (typeof document !== 'object') return null;
    const width = 160, height = 72;
    const {canvas, ctx, image} = materialCanvas(width, height);
    const random = randomStream(0x927d + 3217 * variant);
    const grid = Float32Array.from({length: 1024}, () => random());
    const pixels = image.data;
    for (let j = 0; j < height; j++) {
      const y = j / (height - 1);
      for (let i = 0; i < width; i++) {
        const x = i / (width - 1);
        const mass = valueNoise(grid, x * 7.3 + 8, y * 4.2 + 9);
        const billow = valueNoise(grid, x * 13.6 + 14 + mass * .8, y * 8.7 + 4);
        const curl = valueNoise(grid, x * 24.8 + 7, y * 15.3 + billow * .7);
        const crest = .13 + .37 * ease((x - .40) / .60) + .24 * ease((.23 - x) / .23) +
          .22 * (mass - .5) + .12 * (billow - .5);
        const brow = .105 + .40 * (y - .56) ** 2 + .100 * (mass - .5) + .075 * (billow - .5);
        const front = ease((x - brow) / .088);
        const edge = front * ease((1 - x) / .32) * ease((y - crest) / .14) * ease((1 - y) / .23);
        const underside = gaussian((y - .79 - .060 * billow) / .18);
        const face = gaussian((x - brow - .14) / .15) * (1 - .74 * underside);
        const density = .51 + .54 * mass + .16 * billow + .08 * curl + .41 * underside;
        const light = 168 + 40 * mass + 23 * billow + 9 * curl + 49 * face - 32 * underside;
        const p = (j * width + i) * 4;
        pixels[p] = light;
        pixels[p + 1] = light * .79 + 7;
        pixels[p + 2] = light * .55 + 15;
        pixels[p + 3] = 255 * opticalAlpha((2.30 + .88 * face) * edge * density);
      }
    }
    ctx.putImageData(image, 0, 0);
    sandWalls.set(variant, canvas);
    return canvas;
  }

  function drawSandPuff(ctx, x, y, rx, ry, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
    gradient.addColorStop(.44, 'rgba(' + color + ',' + (.60 * alpha) + ')');
    gradient.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // The caller paints each wall in front of its far ridge and behind the next
  // ridge. Its valley anchor already includes the train's parallax.
  function drawSandValley(ctx, L, cells, layer, time, weather) {
    if (!cells || !cells.length) return;
    const travel = windTravel(weather, time, .45);
    const strength = weatherStrength(weather);
    const rise = strengthRamp(strength, .18, .95);
    ctx.save();
    for (const cell of cells) {
      if (cell.layer !== layer) continue;
      const str = clamp(cell.strength * (.38 + .82 * rise));
      if (str < .012) continue;
      const variant = cell.variant || 0;
      const width = (955 + 110 * snowHash(variant, 41)) * (cell.lee ? .87 : 1);
      const height = (134 + 362 * rise) * (cell.lee ? .78 : 1);
      const bottom = (cell.floor || 680) + 34;
      const phase = time * .52 + travel * .41 + variant * 1.82;
      const drift = Number.isFinite(cell.timeFromAnchor) ? cell.timeFromAnchor / 7 : travel * .10;
      const x = cell.x - width * .69 - 86 * Math.tanh(drift);
      if (x + 1.12 * width < L.left || x > L.left + L.Wm) continue;
      const alpha = str * (.73 + .27 * rise);
      const wall = sandWall(variant);
      if (wall) {
        const alphaBefore = ctx.globalAlpha;
        ctx.globalAlpha = alphaBefore * alpha * (.26 + .20 * rise);
        ctx.drawImage(wall, x + width * .13, bottom - height * 1.07, width * .96, height * 1.13);
        ctx.globalAlpha = alphaBefore * alpha;
        ctx.drawImage(wall, x, bottom - height, width, height);
        ctx.globalAlpha = alphaBefore;
      }
      // The leading brow and the scud below follow different parts of a roll.
      for (let i = 0; i < 3; i++) {
        const p = phase + i * 2.094;
        const cx = x + width * (.223 + i * .094 + .029 * Math.cos(p));
        const cy = bottom - height * (.59 - i * .176 + .082 * Math.sin(p));
        drawSandPuff(ctx, cx, cy, width * (.18 + .025 * i), height * (.24 - .03 * i),
          i === 0 ? '229,183,127' : '169,122,76', alpha * (wall ? .22 + .19 * rise : .70));
      }
    }
    ctx.restore();
  }

  // Soft airborne dust behind the sharp lifted grains and dry glass deposits.
  const SAND_FS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  out vec4 fragColor;

  uniform vec2 u_res;
  uniform float u_radius;
  uniform float u_time;
  uniform float u_strength;
  uniform float u_travel;
  uniform float u_groundY;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    vec2 uv01 = vec2(v_uv.x, 1.0 - v_uv.y);
    vec2 px = uv01 * u_res;
    float dBox = sdRoundBox(px - 0.5 * u_res, 0.5 * u_res, u_radius);
    float winMask = 1.0 - smoothstep(-1.2, 1.2, dBox);
    if (winMask <= 0.001) { fragColor = vec4(0.0); return; }

    float aspect = u_res.x / max(1.0, u_res.y);
    vec2 uv = vec2((uv01.x - 0.5) * aspect, uv01.y - 0.5);

    float loft = smoothstep(.18, .95, u_strength);

    vec3 outRgb = vec3(0.0);
    float outA = 0.0;

    // Soft suspended silt rises from the valley through gaps in the terrain.
    float airBand = smoothstep(mix(.57, .18, loft), mix(.94, .69, loft), uv01.y) *
      (1.0 - .42 * smoothstep(.83, 1.0, uv01.y));
    if (airBand > .003) {
      float drift = .025 * u_time + .24 * u_travel;
      float sheet = vnoise(vec2((uv.x + drift) * 3.0, uv.y * 5.1 + 5.7));
      float billow = vnoise(vec2((uv.x + drift * 1.17) * 6.4 + 7.1, uv.y * 9.0 + .9 * sheet));
      float density = smoothstep(.23, .83, sheet * .64 + billow * .36);
      outA = airBand * (.18 + .82 * density) * (.025 + .09 * u_strength + .18 * loft);
      outRgb = mix(vec3(.56, .40, .27), vec3(.84, .67, .46), density) * outA;
    }

    // Low, fast scud mixes the grit and near track into one thin dust layer.
    float groundBand = smoothstep(u_groundY - .022, u_groundY + .014, uv01.y);
    if (groundBand > .005 && u_groundY < .999) {
      float drift = u_time * .43 + u_travel * .82;
      float wave = vnoise(vec2((uv.x + drift) * 5.9, (uv01.y - u_groundY) * 36.0 + 4.1));
      float aGround = groundBand * smoothstep(.20, .86, wave) * (.10 * u_strength + .25 * loft);
      vec3 gCol = mix(vec3(.63, .43, .26), vec3(.82, .62, .41), wave);
      outRgb = gCol * aGround + outRgb * (1.0 - aGround);
      outA = aGround + outA * (1.0 - aGround);
    }

    fragColor = vec4(outRgb * winMask, clamp(outA, 0.0, 1.0) * winMask);
  }`;

  let sandGl = null;
  function getSandGl(w, h) {
    if (sandGl === false) return null;
    if (!sandGl) {
      try {
        const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (!canvas) { sandGl = false; return null; }
        const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false});
        if (!gl) { sandGl = false; return null; }
        const compile = (type, src) => {
          const sh = gl.createShader(type);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn('Terrain sandstorm shader compile failed:', gl.getShaderInfoLog(sh));
            gl.deleteShader(sh);
            return null;
          }
          return sh;
        };
        const vs = compile(gl.VERTEX_SHADER, SNOW_VS);
        const fs = compile(gl.FRAGMENT_SHADER, SAND_FS);
        if (!vs || !fs) { sandGl = false; return null; }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          console.warn('Terrain sandstorm shader link failed:', gl.getProgramInfoLog(prog));
          gl.deleteProgram(prog);
          sandGl = false;
          return null;
        }
        const vao = gl.createVertexArray();
        sandGl = {
          canvas, gl, prog, vao,
          uRes: gl.getUniformLocation(prog, 'u_res'),
          uRadius: gl.getUniformLocation(prog, 'u_radius'),
          uTime: gl.getUniformLocation(prog, 'u_time'),
          uStrength: gl.getUniformLocation(prog, 'u_strength'),
          uTravel: gl.getUniformLocation(prog, 'u_travel'),
          uGroundY: gl.getUniformLocation(prog, 'u_groundY'),
        };
      } catch (e) {
        sandGl = false;
        return null;
      }
    }
    if (sandGl.gl.isContextLost()) { sandGl = false; return null; }
    const scale = Math.min(1, 1600 / Math.max(1, w), 900 / Math.max(1, h));
    const pw = Math.max(2, Math.round(w * scale)), ph = Math.max(2, Math.round(h * scale));
    if (sandGl.canvas.width !== pw || sandGl.canvas.height !== ph) {
      sandGl.canvas.width = pw;
      sandGl.canvas.height = ph;
    }
    return {state: sandGl, pw, ph, scale};
  }

  const SAND_GROUND_DEPTH = .075;
  const SAND_TRACK_RATE = .62;
  const sandGrains = Array.from({length: 158}, (_, i) => {
    const foot = .18 + .70 * snowHash(i, 56);
    const speed = .43 + .83 * snowHash(i, 58);
    const rate = .91 + 1.74 * snowHash(i, 60);
    const jump = .43 + .29 * snowHash(i, 61);
    // Bound the steepest takeoff by the horizontal speed already supplied by
    // the passing track, including a high ballast profile in a tall window.
    const maxHeight = .74 * SAND_TRACK_RATE * speed * jump / (4 * SAND_GROUND_DEPTH * rate);
    const height = Math.min(foot * (.35 + .82 * snowHash(i, 57)), maxHeight);
    return {
      offset: snowHash(i, 55),
      foot,
      height,
      speed,
      phase: snowHash(i, 59),
      rate,
      jump,
      exposure: .004 + .008 * snowHash(i, 62),
      width: .0017 + .00225 * snowHash(i, 63),
      threshold: .86 * snowHash(i, 64),
      tone: snowHash(i, 65),
    };
  });

  function grainAltitude(grain, time) {
    const tick = time * grain.rate + grain.phase;
    const cycle = tick - Math.floor(tick);
    if (cycle < grain.jump) {
      const p = cycle / grain.jump;
      return grain.height * 4 * p * (1 - p);
    }
    const p = (cycle - grain.jump) / (1 - grain.jump);
    return grain.height * .06 * Math.sin(Math.PI * p) * Math.abs(Math.sin(3 * Math.PI * p));
  }

  function drawSaltation(ctx, win, time, travel, wind, groundY, strength) {
    if (strength < .01 || groundY >= .999) return;
    const band = win.h * Math.min(SAND_GROUND_DEPTH, 1 - groundY);
    const margin = win.h * .042;
    const span = win.w + 2 * margin;
    const distance = win.h * (SAND_TRACK_RATE * time + 1.03 * travel);
    const velocity = win.h * (SAND_TRACK_RATE + 1.03 * wind);
    const scudTravel = .43 * time + .82 * travel;
    ctx.lineCap = 'round';
    for (const grain of sandGrains) {
      const visibility = strengthRamp(strength, grain.threshold, grain.threshold + .17);
      if (visibility < .008) continue;
      const shifted = grain.offset * span - grain.speed * distance;
      const x = win.x - margin + shifted - span * Math.floor(shifted / span);
      const floor = win.y + win.h * groundY + band * grain.foot;
      const y = floor - band * grainAltitude(grain, time);
      const tailX = x + grain.speed * velocity * grain.exposure;
      const tailY = floor - band * grainAltitude(grain, time - grain.exposure);
      const midY = floor - band * grainAltitude(grain, time - grain.exposure * .5);
      const wave = .5 + .5 * Math.sin(6.1 * ((x - win.x) / win.h + scudTravel));
      const localDensity = .44 + .56 * ease((wave - .20) / .60);
      ctx.lineWidth = Math.max(.52, win.h * grain.width);
      const color = grain.tone < .30 ? '91,65,43' : grain.tone < .57 ? '171,119,68' : '250,202,137';
      ctx.strokeStyle = 'rgba(' + color + ',' + (localDensity * visibility * (.51 + .44 * strength)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.quadraticCurveTo((tailX + x) * .5, 2 * midY - (tailY + y) * .5, x, y);
      ctx.stroke();
    }
  }

  const sandTones = ['#513521', '#8d512b', '#d7954f', '#f9cc8a'];
  const sandGusts = Array.from({length: 32}, (_, i) => {
    const near = i >= 22;
    const rank = snowHash(i, 82);
    const threshold = near ? .49 + .35 * rank : .045 + .66 * rank;
    return {
      near,
      threshold,
      full: Math.min(1, threshold + (near ? .17 : .21)),
      offset: snowHash(i, 83),
      altitude: .08 + .92 * snowHash(i, 84),
      speed: (near ? 1.34 : .63) * (.72 + .62 * snowHash(i, 85)),
      spread: (near ? .052 : .064) + .069 * snowHash(i, 86),
      thickness: .018 + .026 * snowHash(i, 87),
      slope: -.19 + .37 * snowHash(i, 88),
      phase: 2 * Math.PI * snowHash(i, 89),
      grains: Array.from({length: near ? 15 : 25}, (_, j) => {
        const k = 29 * i + j;
        const angle = 2 * Math.PI * snowHash(k, 90);
        const radius = Math.sqrt(snowHash(k, 91));
        const tone = snowHash(k, 92);
        return {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
          tone: sandTones[tone < .24 ? 0 : tone < .49 ? 1 : tone < .74 ? 2 : 3],
          size: Math.pow(snowHash(k, 93), 1.55),
          length: Math.pow(snowHash(k, 94), 2),
          threshold: snowHash(k, 95),
          phase: 2 * Math.PI * snowHash(k, 96),
          ink: .64 + .36 * snowHash(k, 97),
        };
      }),
    };
  });

  function drawLiftedSand(ctx, win, time, travel, wind, groundY, strength) {
    const loft = strengthRamp(strength, .12, .96);
    const nearDrive = strengthRamp(strength, .47, .98);
    const floor = Math.min(.965, groundY);
    const lift = .085 + .69 * loft;
    const margin = win.w * .19;
    const span = win.w + 2 * margin;
    const distance = win.h * (.35 * time + .92 * travel);
    const velocity = .35 + .92 * wind;
    const alpha = ctx.globalAlpha;
    for (const gust of sandGusts) {
      const amount = strengthRamp(strength, gust.threshold, gust.full);
      if (amount < .008) continue;
      // A packet advects as one gust while individual grains tumble within it.
      const shifted = gust.offset * span - gust.speed * distance;
      const cx = win.x - margin + shifted - span * Math.floor(shifted / span);
      const roll = .58 * time + gust.phase;
      const rise = lift * (gust.altitude + .055 * Math.sin(roll));
      const cy = win.y + win.h * (floor - rise);
      const rx = win.w * gust.spread * (.76 + .24 * amount);
      const ry = win.h * gust.thickness * (.52 + .60 * loft);
      const curl = gust.slope + .10 * Math.sin(roll + .7);
      const pulse = .72 + .28 * (.5 + .5 * Math.sin(roll * 1.67 + gust.phase));
      const size = gust.near ? .0025 + .0040 * nearDrive : .0019 + .00115 * loft;
      const opacity = gust.near ? (.56 + .33 * nearDrive) : (.49 + .34 * loft);
      for (const grain of gust.grains) {
        const visible = strengthRamp(amount, .68 * grain.threshold, .32 + .68 * grain.threshold);
        if (visible < .008) continue;
        const dx = rx * (grain.x + .043 * Math.cos(roll * 2.4 + grain.phase));
        const x = cx + dx;
        const y = cy + ry * (grain.y + .19 * Math.sin(roll * 2.8 + grain.phase)) + dx * curl;
        const width = Math.max(.65, win.h * size * (.56 + .87 * grain.size));
        const tail = width * (.55 + grain.length * (1.04 + .77 * velocity));
        const squash = .48 + .34 * grain.ink;
        ctx.globalAlpha = alpha * visible * amount * pulse * opacity * grain.ink;
        ctx.fillStyle = grain.tone;
        ctx.beginPath();
        ctx.ellipse(x, y, tail * .65, width * squash * .5, curl + .25 * grain.y, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.globalAlpha = alpha;
  }

  function drawSandHaze(ctx, win, time, travel, groundY, strength) {
    const air = win.h * (.025 * time + .24 * travel);
    const scud = win.h * (.43 * time + .82 * travel);
    const groundHeight = win.h * Math.min(SAND_GROUND_DEPTH, 1 - groundY);
    const loft = strengthRamp(strength, .18, .95);
    for (let i = 0; i < 13; i++) {
      const ground = i >= 8;
      const amount = ground ? .10 * strength + .25 * loft : .025 + .09 * strength + .18 * loft;
      if ((ground && groundHeight < win.h * .001) || amount < .01) continue;
      const a = snowHash(i, 66), b = snowHash(i, 67), c = snowHash(i, 68);
      const rx = win.w * (.13 + .15 * b);
      const ry = ground ? win.h * (.014 + .014 * b) : win.h * (.115 + .109 * b);
      const span = win.w + 2 * rx;
      const phase = a * span - (ground ? scud : air) * (.67 + .60 * c);
      const x = win.x - rx + phase - span * Math.floor(phase / span);
      const y = ground ? win.y + win.h * groundY + groundHeight * (.12 + .74 * c)
        : win.y + win.h * (.69 - .30 * loft + (.23 + .24 * loft) * c + .016 * Math.sin(time * .50 + i));
      drawSandPuff(ctx, x, y, rx, ry, b < .47 ? '155,105,64' : '204,161,107', amount * (.57 + .37 * c));
    }
  }

  function drawSandstorm(ctx, win, t, weather, dpr = 1, transomFrac = .14, groundY = .951) {
    const strength = weatherStrength(weather);
    const dust = surfaceAmount(weather, clamp(weather?.humidity || 0));
    const wind = windAmount(weather, strength);
    const travel = windTravel(weather, t, .45);
    const ground = clamp(Number.isFinite(groundY) ? groundY : .951);
    const trailWind = Number.isFinite(weather?.windTravel) ? wind : .45;
    ctx.save();
    clipWindow(ctx, win);
    const gpu = getSandGl(win.w * dpr, win.h * dpr);
    if (gpu) {
      const {state, pw, ph, scale} = gpu;
      const {gl, prog, vao} = state;
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform2f(state.uRes, pw, ph);
      gl.uniform1f(state.uRadius, win.r * dpr * scale);
      gl.uniform1f(state.uTime, t);
      gl.uniform1f(state.uStrength, strength);
      gl.uniform1f(state.uTravel, travel);
      gl.uniform1f(state.uGroundY, ground);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.drawImage(state.canvas, win.x, win.y, win.w, win.h);
    } else {
      drawSandHaze(ctx, win, t, travel, ground, strength);
    }
    drawLiftedSand(ctx, win, t, travel, trailWind, ground, strength);
    drawSaltation(ctx, win, t, travel, trailWind, ground, strength);
    drawDryEdges(ctx, win, dust, transomFrac, false);
    ctx.restore();
  }

  root.XinTerrainRain = Object.freeze({
    ready, prepare, dispose, overcastLight, drawSky, drawDistantRain, drawStormLight, drawRainFront, drawAirRain, drawGlass,
    snowLight, drawSnowSky, drawSnowValley, drawBlizzard, drawGlassFrost,
    sandLight, drawSandSky, drawSandValley, drawSandstorm,
    isReady: () => exteriorReady,
    inspect: canvas => sessions.get(canvas)?.report || null,
  });
})();
