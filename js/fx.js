'use strict';
/* =====================================================================
   SON, EFFETS VISUELS ET RENDU
   Tout ce qui est purement visuel passe par fx(nom, ...args) : l'hôte
   l'exécute et l'envoie à l'invité, qui le rejoue chez lui.
   ===================================================================== */

// ---------- SON (WebAudio synthétique) ----------
const AC = { ctx: null, last: {} };
function actx() {
  if (!save.sound) return null;
  if (!AC.ctx) { try { AC.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.ctx.state === 'suspended') AC.ctx.resume();
  return AC.ctx;
}
function throttle(k, ms) { const n = performance.now(); if (AC.last[k] && n - AC.last[k] < ms) return true; AC.last[k] = n; return false; }
function tone(f, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
  const a = actx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
let NOISE = null;
function noise(dur, vol = 0.2, freq = 2000, delay = 0, type = 'lowpass') {
  const a = actx(); if (!a) return;
  if (!NOISE) { NOISE = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = NOISE; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const SFX = {
  zap() { if (throttle('zap', 60)) return; noise(0.3, 0.25, 4000, 0, 'highpass'); tone(1400, 0.18, 'sawtooth', 0.05, -1100); noise(0.5, 0.18, 300, 0.04); },
  hit() { if (throttle('hit', 60)) return; noise(0.06, 0.08, 1500); },
  shoot() { if (throttle('shoot', 90)) return; tone(800, 0.07, 'triangle', 0.04, -400); },
  bow() { if (throttle('bow', 50)) return; noise(0.12, 0.12, 2600, 0, 'bandpass'); tone(220, 0.12, 'triangle', 0.06, -90); },
  creak() { if (throttle('creak', 400)) return; tone(140, 0.35, 'sawtooth', 0.018, 60); },
  card() { tone(500, 0.09, 'triangle', 0.1, 400); },
  draw() { noise(0.12, 0.08, 4000, 0, 'highpass'); tone(700, 0.08, 'triangle', 0.06, 300); },
  fuse(lv) { const b = [523, 659, 784, 1046]; for (let i = 0; i <= lv + 1; i++) tone(b[i % 4] * (i >= 4 ? 2 : 1), 0.35, 'triangle', 0.08, 0, i * 0.06); noise(0.4, 0.08, 6000, 0, 'highpass'); },
  trash() { noise(0.2, 0.15, 900); tone(200, 0.15, 'square', 0.03, -100); },
  summon() { tone(260, 0.25, 'square', 0.05, 260); tone(390, 0.3, 'triangle', 0.06, 200, 0.06); },
  boom() { noise(0.7, 0.45, 500); tone(110, 0.6, 'sine', 0.3, -70); },
  fire() { noise(0.5, 0.25, 900); },
  glue() { noise(0.5, 0.25, 350); tone(90, 0.5, 'sine', 0.2, -40); tone(160, 0.3, 'triangle', 0.05, 80, 0.15); },
  die() { if (throttle('die', 50)) return; tone(260, 0.12, 'square', 0.025, -160); },
  fdie() { tone(300, 0.5, 'triangle', 0.08, -200); },
  hurt() { if (throttle('hurt', 160)) return; tone(120, 0.15, 'sawtooth', 0.07, -50); },
  buy() { tone(1320, 0.07, 'square', 0.05); tone(1760, 0.14, 'square', 0.05, 0, 0.06); },
  err() { if (throttle('err', 150)) return; tone(160, 0.15, 'square', 0.05); },
  node() { [660, 880, 1320].forEach((f, i) => tone(f, 0.25, 'triangle', 0.08, 0, i * 0.06)); },
  wave() { tone(196, 0.7, 'sawtooth', 0.06, 10); tone(294, 0.7, 'sawtooth', 0.04, 10, 0.08); },
  boss() { tone(70, 1.4, 'sawtooth', 0.12, -20); tone(104, 1.4, 'sawtooth', 0.07, -30, 0.1); noise(1.2, 0.15, 300); },
  freeze() { [1600, 2000, 2400].forEach((f, i) => tone(f, 0.5, 'sine', 0.04, -300, i * 0.05)); noise(0.6, 0.1, 6000, 0, 'highpass'); },
  heal() { [523, 784, 1046].forEach((f, i) => tone(f, 0.5, 'sine', 0.07, 0, i * 0.09)); },
  time() { tone(900, 1.2, 'sine', 0.08, -700); tone(450, 1.2, 'sine', 0.06, -300, 0.1); },
  holy() { [392, 523, 659, 784].forEach((f, i) => tone(f, 1.2, 'triangle', 0.06, 0, i * 0.04)); },
  ping() { tone(1200, 0.12, 'sine', 0.08); tone(1600, 0.18, 'sine', 0.07, 0, 0.1); },
  ready() { tone(660, 0.1, 'triangle', 0.07); tone(990, 0.16, 'triangle', 0.07, 0, 0.08); },
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 0, i * 0.12)); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.06, 0, i * 0.22)); noise(1.5, 0.25, 400, 0.2); },
};

// ---------- couche visuelle (locale à chaque joueur) ----------
const V = { time: 0, parts: [], texts: [], bolts: [], decals: [], fx: [], pings: [], shake: 0, flash: 0, flashC: '255,255,255', tint: { frost: 0, storm: 0, time: 0 } };
function resetVisuals() {
  V.parts = []; V.texts = []; V.bolts = []; V.decals = []; V.fx = []; V.pings = [];
  V.shake = 0; V.flash = 0; V.tint = { frost: 0, storm: 0, time: 0 };
}
function part(x, y, vx, vy, life, color, size, grav = 0, type) {
  if (V.parts.length > 1400) return;
  V.parts.push({ x, y, vx, vy, life, max: life, color, size, grav, type });
}
function ring(x, y, color, r, life) { V.fx.push({ t: 0, ground: true, upd(dt) { this.t += dt; return this.t < life; }, draw(c) { const k = this.t / life; c.strokeStyle = color; c.globalAlpha = 1 - k; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.ellipse(x, y, r * (0.2 + 0.8 * Math.sqrt(k)), r * 0.6 * (0.2 + 0.8 * Math.sqrt(k)), 0, 0, 7); c.stroke(); c.globalAlpha = 1; } }); }
function floatText(x, y, txt, color, size = 14, life = 0.9, small) {
  if (small && V.texts.length > 70) return;
  V.texts.push({ x, y, txt: String(txt), color, size, life, max: life });
}
function glow(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.globalAlpha = 0.7;
  c.beginPath(); c.arc(x, y, r * 2, 0, 7); c.fill();
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function jag(x1, y1, x2, y2, n, amp) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([lerp(x1, x2, t) + (i && i < n ? rand(-amp, amp) : 0), lerp(y1, y2, t)]); }
  return pts;
}
function banner(t1, t2, col) {
  const b = $('#banner');
  b.classList.remove('show'); void b.offsetWidth;
  b.style.setProperty('--bcol', col || '#ffcc4d');
  b.innerHTML = `<div class="b1">${t1}</div>${t2 ? `<div class="b2">${t2}</div>` : ''}`;
  b.classList.add('show');
}

// ---------- registre des effets (arguments simples : transmissibles) ----------
const FX = {
  sfx(n, a) { if (SFX[n]) SFX[n](a); },
  dmg(x, y, v, crit) {
    floatText(x + rand(-8, 8), y, crit ? v + '!' : v, crit ? '#ff9a3a' : v >= 100 ? '#ffcf4a' : '#ffffff', crit ? 19 : v >= 100 ? 20 : 13, 0.7, true);
  },
  text(x, y, txt, color, size, life) { floatText(x, y, txt, color, size, life); },
  banner(t1, t2, col) { banner(t1, t2, col); },
  shake(v) { V.shake = Math.max(V.shake, v); },
  flash(a, c) { V.flash = Math.max(V.flash, a); V.flashC = c; },
  tint(k, v) { V.tint[k] = Math.max(V.tint[k], v); },
  edie(x, y, boss, xp) {
    SFX.die();
    for (let i = 0; i < (boss ? 80 : 12); i++) part(x, y - 8, rand(-120, 120), rand(-160, 20), rand(0.3, 0.7), pick(['#3a2a2a', '#7a2a2a', '#c0c0c0']), rand(2, 5), 300);
    if (xp >= 2) floatText(x, y - 40, `+${fmt(xp)} XP`, '#9fe3ff', 13, 1);
  },
  fdie(x, y, lv, name) {
    SFX.fdie();
    for (let i = 0; i < 26; i++) part(x, y - 10, rand(-80, 80), rand(-160, -20), rand(0.5, 1.1), pick(['#bfe3ff', '#ffffff', rarOf(lv).c]), rand(2, 4), -30);
    floatText(x, y - 40, `${name} est tombé`, '#ff9a8a', 14, 1.4);
  },
  summon(x, y, lv) {
    SFX.summon();
    const color = rarOf(lv).c;
    V.fx.push({ t: 0, ground: true, upd(dt) { this.t += dt; return this.t < 0.9; }, draw(c) {
      const k = this.t / 0.9, a = 1 - k;
      c.save(); c.translate(x, y); c.scale(1, 0.55); c.rotate(this.t * 3);
      c.strokeStyle = color; c.globalAlpha = a; c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 36 + k * 14, 0, 7); c.stroke();
      c.beginPath(); for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; c.lineTo(Math.cos(an) * 30, Math.sin(an) * 30); } c.closePath(); c.stroke();
      c.restore(); c.globalAlpha = 1;
    } });
    for (let i = 0; i < 16; i++) part(x, y - 10, rand(-120, 120), rand(-160, 40), rand(0.4, 0.8), color, rand(2, 4), 200);
    if (lv >= 2) {
      V.fx.push(beamFx(x, y, color, lv === 3 ? 1.5 : 1.05));
      if (lv === 3) { V.flash = 0.3; V.flashC = '255,200,80'; }
    }
  },
  slash(fx_, fy, tx, ty) {
    SFX.hit();
    const a = Math.atan2(ty - fy, tx - fx_);
    V.fx.push({ t: 0, upd(dt) { this.t += dt; return this.t < 0.15; }, draw(c) {
      const k = this.t / 0.15;
      c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.lineWidth = 3;
      c.beginPath(); c.arc(tx, ty - 10, 16, a + Math.PI - 1 + k, a + Math.PI + 0.2 + k); c.stroke();
    } });
  },
  breath(x, y, a0) {
    for (let i = 0; i < 5; i++) {
      const a = a0 + rand(-0.4, 0.4), sp = rand(260, 400);
      part(x + Math.cos(a0) * 16, y - 30 + Math.sin(a0) * 10, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.4), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a']), rand(4, 8), 0, 'fire');
    }
    if (!throttle('breath', 300)) noise(0.3, 0.07, 800);
  },
  slam(x, y, R) {
    V.shake = Math.max(V.shake, 5); SFX.boom();
    ring(x, y, '#d9c7a0', R, 0.35);
    for (let i = 0; i < 14; i++) part(x, y, rand(-150, 150), rand(-150, 20), rand(0.3, 0.6), '#8a7a60', rand(3, 6), 300);
  },
  hit(x, y) {
    SFX.hit();
    for (let i = 0; i < 6; i++) part(x, y, rand(-90, 90), rand(-110, 20), rand(0.15, 0.35), pick(['#fff3d0', '#ffd27a']), rand(2, 3), 200);
  },
  arrowLand(x, y, ang) {
    V.decals.push({ x, y, ang, t: 0, life: 2.5, arrow: true });
    for (let i = 0; i < 4; i++) part(x, y, rand(-40, 40), rand(-40, 0), 0.35, 'rgba(200,180,140,0.8)', 2.5, 100);
  },
  explode(x, y, R) {
    if (!throttle('expl', 80)) { noise(0.25, 0.2, 700); }
    ring(x, y, '#ffb060', R, 0.3);
    for (let i = 0; i < 12; i++) part(x, y, rand(-140, 140), rand(-140, 60), rand(0.2, 0.45), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a']), rand(3, 6), 100, 'fire');
  },
  burnTick(x, y) { part(x + rand(-8, 8), y, rand(-10, 10), rand(-70, -30), rand(0.3, 0.5), pick(['#ffdc5a', '#ff8a2a']), rand(3, 5), 0, 'fire'); },
  strike(x, y) {
    V.bolts.push({ pts: jag(x + rand(-80, 80), y - 650, x, y - 8, 14, 26), life: 0.32, max: 0.32, w: 4 });
    V.flash = Math.max(V.flash, 0.14); V.flashC = '200,230,255';
    SFX.zap();
    for (let i = 0; i < 14; i++) part(x, y, rand(-160, 160), rand(-200, 40), rand(0.15, 0.4), pick(['#ffffff', '#9fe3ff', '#5ab0ff']), rand(2, 4), 300);
    ring(x, y, '#9fe3ff', 36, 0.25);
    V.decals.push({ x, y, r: 14, t: 0, life: 3, c: '10,10,20' });
  },
  chain(x1, y1, x2, y2) { V.bolts.push({ pts: jag(x1, y1 - 12, x2, y2 - 12, 7, 12), life: 0.25, max: 0.25, w: 2.5 }); },
  fireball(sx, sy, tx, ty, dur) {
    SFX.fire();
    V.fx.push({ t: 0, upd(dt) {
      this.t += dt; const k = Math.min(1, this.t / dur);
      this.x = lerp(sx, tx, k); this.y = lerp(sy, ty, k) - Math.sin(k * Math.PI) * 120;
      for (let i = 0; i < 3; i++) part(this.x, this.y, rand(-30, 30), rand(-30, 30), rand(0.2, 0.45), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a', '#555']), rand(4, 9), -40, 'fire');
      return k < 1;
    }, draw(c) { if (this.x === undefined) return; glow(c, this.x, this.y, 22, '#ff9a3a'); drawEmo(c, '🔥', this.x, this.y, 30); } });
  },
  fireImpact(x, y, R) {
    SFX.boom(); V.shake = Math.max(V.shake, 8);
    ring(x, y, '#ff9a3a', R, 0.4); ring(x, y, '#ffe08a', R * 0.6, 0.3);
    for (let i = 0; i < 40; i++) part(x, y, rand(-260, 260), rand(-260, 80), rand(0.3, 0.7), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a']), rand(3, 8), 200, 'fire');
    V.decals.push({ x, y, r: R * 0.7, t: 0, life: 6, c: '20,10,5' });
  },
  frostAll(dur) { SFX.freeze(); V.tint.frost = Math.max(V.tint.frost, dur); },
  frostHit(x, y) { for (let i = 0; i < 5; i++) part(x, y - 10, rand(-50, 50), rand(-60, 10), rand(0.4, 0.8), '#cfefff', rand(2, 4), 40); },
  bless(heal) {
    SFX.heal();
    if (heal) floatText(TX, TY - 150, `+${heal} PV`, '#7eff9a', 20, 1.4);
    ring(TX, TY, '#ffe98a', 160, 0.6);
    for (let i = 0; i < 40; i++) part(TX + rand(-50, 50), TY + rand(-20, 10), rand(-20, 20), rand(-160, -60), rand(0.8, 1.4), pick(['#ffe98a', '#ffffff', '#ffb0d0']), rand(2, 4), 0);
  },
  blessUnit(x, y) { for (let i = 0; i < 12; i++) part(x + rand(-14, 14), y, rand(-10, 10), rand(-120, -40), rand(0.6, 1.1), pick(['#ffe98a', '#ffffff', '#ffb0d0']), rand(2, 4), 0); },
  meteor(tx, ty, R, dur) {
    SFX.fire();
    V.fx.push({ t: 0, ground: true, upd(dt) { this.t += dt; return this.t < dur; }, draw(c) {
      const k = this.t / dur;
      c.fillStyle = `rgba(0,0,0,${0.15 + k * 0.35})`; c.beginPath(); c.ellipse(tx, ty, R * k, R * k * 0.55, 0, 0, 7); c.fill();
      c.strokeStyle = `rgba(255,120,60,${0.4 + k * 0.5})`; c.lineWidth = 3; c.beginPath(); c.ellipse(tx, ty, R, R * 0.55, 0, 0, 7); c.stroke();
      const mx = tx + (1 - k) * 500, my = ty - (1 - k) * 900;
      for (let i = 0; i < 4; i++) part(mx, my, rand(-30, 30) + 120, rand(-30, 30) - 220, rand(0.3, 0.6), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a', '#444']), rand(6, 14), 0, 'fire');
      glow(c, mx, my, 50, '#ff8a2a'); drawEmo(c, '☄️', mx, my, 70);
    } });
  },
  meteorImpact(tx, ty, R) {
    SFX.boom(); V.shake = 18; V.flash = 0.3; V.flashC = '255,170,90';
    ring(tx, ty, '#ffb060', R, 0.5); ring(tx, ty, '#fff0c0', R * 0.5, 0.35);
    for (let i = 0; i < 70; i++) part(tx, ty, rand(-380, 380), rand(-380, 100), rand(0.4, 1), pick(['#ffdc5a', '#ff8a2a', '#ff4a1a', '#5a4030', '#2a2020']), rand(3, 9), 350, 'fire');
    V.decals.push({ x: tx, y: ty, r: R * 0.8, t: 0, life: 10, c: '25,12,5' });
  },
  judgement(pts) {
    SFX.holy();
    V.fx.push({ t: 0, hit: false, upd(dt) {
      this.t += dt;
      if (!this.hit && this.t > 0.55) {
        this.hit = true; V.flash = 0.5; V.flashC = '255,250,210'; V.shake = 10; SFX.boom();
        for (let i = 0; i < pts.length; i += 2) for (let k = 0; k < 8; k++) part(pts[i], pts[i + 1], rand(-80, 80), rand(-200, -40), rand(0.4, 0.9), pick(['#fff6c0', '#ffe060', '#ffffff']), rand(2, 5), 0);
      }
      return this.t < 1.3;
    }, draw(c) {
      const a = this.t < 0.55 ? this.t / 0.55 : Math.max(0, 1 - (this.t - 0.55) / 0.75);
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i], y = pts[i + 1];
        const w = this.t < 0.55 ? 6 + a * 10 : 26 * a;
        const g = c.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, 'rgba(255,240,170,0)'); g.addColorStop(0.5, `rgba(255,250,220,${0.85 * a})`); g.addColorStop(1, 'rgba(255,240,170,0)');
        c.fillStyle = g; c.fillRect(x - w, y - 1200, w * 2, 1200);
        c.fillStyle = `rgba(255,240,170,${0.5 * a})`; c.beginPath(); c.ellipse(x, y, w * 1.6, w * 0.7, 0, 0, 7); c.fill();
      }
    } });
  },
  rift(x, y, d) { SFX.time(); V.tint.time = Math.max(V.tint.time, d); ring(x, y, '#b38bff', 900, 1.2); ring(x, y, '#ffffff', 500, 0.9); },
  glue(x, y, R) {
    SFX.glue(); V.shake = Math.max(V.shake, 4);
    for (let i = 0; i < 40; i++) { const a = rand(0, 7), r = rand(0, R); part(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55, rand(-60, 60), rand(-140, -20), rand(0.4, 0.9), pick(['#e2c048', '#b78f1f', '#f7e08a']), rand(3, 7), 320); }
    ring(x, y, '#f0cf55', R, 0.45);
  },
  rainArrow(x, y) {
    V.fx.push({ t: 0, dur: 0.32, upd(dt) {
      this.t += dt;
      if (this.t >= this.dur) {
        V.decals.push({ x, y, ang: Math.PI / 2 + rand(-0.3, 0.3), t: 0, life: 2, arrow: true });
        for (let i = 0; i < 3; i++) part(x, y, rand(-40, 40), rand(-40, 0), 0.3, 'rgba(200,180,140,0.8)', 2.5, 100);
        if (!throttle('rain', 70)) noise(0.06, 0.07, 2000);
        return false;
      }
      return true;
    }, draw(c) {
      const k = this.t / this.dur, yy = y - (1 - k) * 420, xx = x - (1 - k) * 60;
      c.strokeStyle = '#e8d8b0'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(xx - 6, yy - 26); c.lineTo(xx, yy); c.stroke();
    } });
  },
  bossSlam(x, y, R) {
    V.shake = 14; SFX.boom();
    ring(x, y, '#c040ff', R, 0.5); ring(x, y, '#ff80ff', R * 0.6, 0.35);
    for (let i = 0; i < 30; i++) part(x, y, rand(-260, 260), rand(-200, 60), rand(0.4, 0.8), pick(['#7a3fa0', '#c070ff', '#3a2a40']), rand(3, 7), 300);
  },
  bossSummon(x, y) { for (let k = 0; k < 10; k++) part(x, y, rand(-50, 50), rand(-80, 0), rand(0.4, 0.8), '#9b4dff', rand(3, 5), 0); },
  towerDown() {
    for (let i = 0; i < 80; i++) part(TX + rand(-50, 50), TY + rand(-20, 10), rand(-150, 150), rand(-200, -20), rand(0.8, 1.6), pick(['#8a7a60', '#5a5040', '#b0a080']), rand(4, 10), 120);
    V.shake = 20; SFX.lose();
  },
  confetti() {
    SFX.win(); V.flash = 0.6; V.flashC = '255,240,200';
    for (let i = 0; i < 160; i++) part(rand(view.x0, view.x1), view.y0 - 20, rand(-60, 60), rand(100, 300), rand(2, 4), pick(['#ffcc4d', '#ff5b4a', '#4da3ff', '#7eff9a', '#c070ff']), rand(3, 6), 60);
  },
  ping(x, y, col) { SFX.ping(); V.pings.push({ x, y, t: 0, col }); },
};
function beamFx(x, y, color, big) {
  return { t: 0, upd(dt) { this.t += dt; return this.t < 1.4 * big; }, draw(c) {
    const k = this.t / (1.4 * big), a = Math.sin(k * Math.PI);
    const w = 30 * big;
    const g = c.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = a * 0.75; c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - w, y - 900, w * 2, 900);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.5) part(x + rand(-25, 25), y + rand(-20, 20), rand(-20, 20), rand(-140, -60), 0.8, color, rand(2, 4), 0);
  } };
}
// émet un effet : joué localement, et transmis à l'invité si on héberge une partie
function fx(name, ...a) {
  FX[name](...a);
  if (NET.mode === 'host' && NET.open) NET.evq.push([name, ...a]);
}

function updateVisuals(dt) {
  V.time += dt;
  V.fx = V.fx.filter(f => f.upd(dt) !== false);
  for (const p of V.parts) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
  V.parts = V.parts.filter(p => p.life > 0);
  for (const t of V.texts) { t.life -= dt; t.y -= 32 * dt; }
  V.texts = V.texts.filter(t => t.life > 0);
  for (const b of V.bolts) b.life -= dt;
  V.bolts = V.bolts.filter(b => b.life > 0);
  for (const d of V.decals) d.t += dt;
  V.decals = V.decals.filter(d => d.t < d.life);
  for (const p of V.pings) p.t += dt;
  V.pings = V.pings.filter(p => p.t < 2.2);
  V.shake = Math.max(0, V.shake - dt * 30);
  V.flash = Math.max(0, V.flash - dt * 1.6);
  for (const k in V.tint) V.tint[k] = Math.max(0, V.tint[k] - dt);
}

// =====================================================================
//  RENDU
// =====================================================================
const cv = $('#cv'), ctx = cv.getContext('2d');
let DPR = 1;
const view = { s: 1, ox: 0, oy: 0, x0: 0, y0: 0, x1: W, y1: H };
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  const s = Math.min(innerWidth / W, innerHeight / H) * 1.04;
  view.s = s; view.ox = (innerWidth - W * s) / 2; view.oy = (innerHeight - H * s) / 2;
  view.x0 = -view.ox / s; view.y0 = -view.oy / s; view.x1 = (innerWidth - view.ox) / s; view.y1 = (innerHeight - view.oy) / s;
}
addEventListener('resize', resize);
resize();
const toWorld = e => ({ x: (e.clientX - view.ox) / view.s, y: (e.clientY - view.oy) / view.s });

// ---------- sprites emoji en cache ----------
const EMO = {};
function emo(ch, size, white) {
  size = Math.max(2, Math.round(size));
  const k = ch + '|' + size + (white ? 'w' : '');
  if (EMO[k]) return EMO[k];
  const px = Math.ceil(size * 2), p = Math.ceil(px * 1.35);
  const c = document.createElement('canvas'); c.width = c.height = p;
  const x = c.getContext('2d');
  x.font = `${px}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, p / 2, p / 2 + px * 0.07);
  if (white) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#fff'; x.fillRect(0, 0, p, p); }
  c.dw = p / 2; EMO[k] = c; return c;
}
function drawEmo(c, ch, x, y, size, white) { const im = emo(ch, size, white); c.drawImage(im, x - im.dw / 2, y - im.dw / 2, im.dw, im.dw); }

// ---------- sol (pré-rendu) ----------
const GP = { x: 900, y: 650 };
let ground = null;
function makeGround() {
  const gw = W + GP.x * 2, gh = H + GP.y * 2;
  const g = document.createElement('canvas'); g.width = gw; g.height = gh;
  const c = g.getContext('2d');
  const cx = GP.x + TX, cy = GP.y + TY;
  let grd = c.createRadialGradient(cx, cy, 60, cx, cy, 1300);
  grd.addColorStop(0, '#46683a'); grd.addColorStop(0.45, '#2f4c29'); grd.addColorStop(1, '#16240f');
  c.fillStyle = grd; c.fillRect(0, 0, gw, gh);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * gw, y = Math.random() * gh, r = rand(10, 60);
    c.fillStyle = Math.random() < 0.5 ? `rgba(80,120,50,${rand(0.03, 0.08)})` : `rgba(10,25,8,${rand(0.04, 0.1)})`;
    c.beginPath(); c.ellipse(x, y, r, r * rand(0.4, 0.8), rand(0, 3), 0, 7); c.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * gw, y = Math.random() * gh, l = rand(3, 8);
    c.strokeStyle = `hsla(${rand(85, 115)},${rand(30, 55)}%,${rand(22, 42)}%,${rand(0.35, 0.8)})`;
    c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-2, 2), y - l); c.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * gw, y = Math.random() * gh;
    c.fillStyle = pick(['#f4e27a', '#ffffff', '#e98bd6', '#9fc8ff']); c.globalAlpha = 0.7;
    c.beginPath(); c.arc(x, y, rand(1.2, 2.4), 0, 7); c.fill(); c.globalAlpha = 1;
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * gw, y = Math.random() * gh, r = rand(5, 14);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(x + 2, y + 3, r, r * 0.6, 0, 0, 7); c.fill();
    c.fillStyle = `hsl(${rand(80, 110)},6%,${rand(38, 52)}%)`; c.beginPath(); c.ellipse(x, y, r, r * 0.65, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.2, r * 0.4, r * 0.25, 0, 0, 7); c.fill();
  }
  grd = c.createRadialGradient(cx, cy, 70, cx, cy, 190);
  grd.addColorStop(0, 'rgba(120,100,70,0.45)'); grd.addColorStop(1, 'rgba(120,100,70,0)');
  c.fillStyle = grd; c.beginPath(); c.ellipse(cx, cy, 200, 150, 0, 0, 7); c.fill();
  for (let ring_ = 0; ring_ < 3; ring_++) {
    const r0 = 62 + ring_ * 26, n = 14 + ring_ * 6;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2 + ring_ * 0.2, a1 = a0 + Math.PI * 2 / n * 0.9;
      c.fillStyle = `hsl(35,${rand(8, 16)}%,${rand(36, 46) - ring_ * 3}%)`;
      c.beginPath();
      c.ellipse(cx, cy, r0 + 24, (r0 + 24) * 0.72, 0, a0, a1);
      c.ellipse(cx, cy, r0, r0 * 0.72, 0, a1, a0, true);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1.5; c.stroke();
    }
  }
  ground = g;
}

// ---------- tour ----------
function drawTower(c, T, R) {
  const fall = T.fall || 0;
  c.save();
  c.translate(TX, TY);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(8, 6, 58, 30, 0, 0, 7); c.fill();
  if (fall > 0) { c.translate(rand(-2, 2) * (1 - fall), 0); c.scale(1, 1 - fall * 0.75); c.globalAlpha = 1 - fall * 0.3; }
  const hw = 40, top = -118;
  const flash = T.hitT > 0;
  let g = c.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0, '#5d5a55'); g.addColorStop(0.35, '#a8a196'); g.addColorStop(0.7, '#7d776d'); g.addColorStop(1, '#4a4742');
  c.fillStyle = flash ? '#ffb0a0' : g;
  c.beginPath(); c.moveTo(-hw - 4, 0); c.lineTo(-hw, top); c.lineTo(hw, top); c.lineTo(hw + 4, 0); c.ellipse(0, 0, hw + 4, 16, 0, 0, Math.PI); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(40,35,30,0.45)'; c.lineWidth = 1.2;
  for (let row = 0; row < 9; row++) {
    const y = -row * 13 - 4;
    c.beginPath(); c.ellipse(0, y, hw + 2, 14, 0, 0.1, Math.PI - 0.1); c.stroke();
    for (let k = 0; k < 5; k++) { const a = (k + (row % 2) * 0.5) / 5 * Math.PI + 0.25; const bx = Math.cos(a) * (hw + 2); c.beginPath(); c.moveTo(bx, y + Math.sin(a) * 14); c.lineTo(bx, y + Math.sin(a) * 14 - 13); c.stroke(); }
  }
  c.fillStyle = '#2a1d12'; c.beginPath(); c.moveTo(-11, 14); c.lineTo(-11, -12); c.arc(0, -12, 11, Math.PI, 0); c.lineTo(11, 14); c.closePath(); c.fill();
  c.strokeStyle = '#6a4a2a'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#ffcf6a'; c.globalAlpha *= 0.8 + 0.2 * Math.sin(V.time * 2);
  c.beginPath(); c.moveTo(-5, -62); c.lineTo(-5, -74); c.arc(0, -74, 5, Math.PI, 0); c.lineTo(5, -62); c.closePath(); c.fill();
  c.globalAlpha = fall > 0 ? 1 - fall * 0.3 : 1;
  c.fillStyle = flash ? '#ffc0b0' : '#8f887c';
  c.beginPath(); c.ellipse(0, top, hw + 8, 15, 0, 0, 7); c.fill();
  c.fillStyle = '#3d3a35'; c.beginPath(); c.ellipse(0, top, hw - 2, 10, 0, 0, 7); c.fill();
  // archer + arc
  if (fall < 0.3) {
    drawEmo(c, '🧝', -4, top - 16, 26);
    c.save(); c.translate(0, OY - TY);
    c.rotate(T.ang);
    const pull = 3 + (T.charge || 0) * 15;
    c.strokeStyle = '#4a2c12'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.arc(-4, 0, 22, -1.25, 1.25); c.stroke();
    c.strokeStyle = '#a8763c'; c.lineWidth = 2.5; c.beginPath(); c.arc(-4, 0, 22, -1.2, 1.2); c.stroke();
    const ex = -4 + Math.cos(1.25) * 22, ey = Math.sin(1.25) * 22;
    c.strokeStyle = '#eee'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(ex, -ey); c.lineTo(-pull, 0); c.lineTo(ex, ey); c.stroke();
    if ((T.reloadK || 0) <= 0) {
      c.strokeStyle = '#d8c8a0'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-pull, 0); c.lineTo(-pull + 34, 0); c.stroke();
      c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(-pull + 38, 0); c.lineTo(-pull + 31, -3.5); c.lineTo(-pull + 31, 3.5); c.fill();
    }
    c.restore();
    if (T.charge > 0) glow(c, Math.cos(T.ang) * 30, OY - TY + Math.sin(T.ang) * 30, 6 + T.charge * 10, T.charge >= 1 ? 'rgba(255,210,90,0.8)' : 'rgba(255,255,255,0.5)');
  }
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2;
    const bx = Math.cos(a) * (hw + 4), by = top + Math.sin(a) * 12;
    if (Math.sin(a) < -0.2) continue;
    c.fillStyle = flash ? '#ffc0b0' : '#a39b8e'; c.fillRect(bx - 6, by - 14, 12, 14);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(bx + 2, by - 14, 4, 14);
  }
  const hp = T.hp / T.max;
  if (hp < 0.6) {
    c.strokeStyle = 'rgba(20,15,10,0.8)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-20, -90); c.lineTo(-14, -70); c.lineTo(-22, -55); c.lineTo(-16, -38); c.stroke();
    if (hp < 0.3) { c.beginPath(); c.moveTo(24, -100); c.lineTo(16, -80); c.lineTo(26, -60); c.lineTo(18, -30); c.stroke(); if (Math.random() < 0.15) part(TX + rand(-30, 30), TY - rand(40, 110), rand(-10, 10), rand(-40, -20), 1.2, 'rgba(60,60,60,0.5)', rand(5, 9), -10); }
  }
  c.restore();
}

// ---------- unités ----------
function unitLift(u) { return u.fly ? 28 + Math.sin(V.time * 4 + u.seed) * 5 : 0; }
function drawUnit(c, u) {
  const ally = u.kind === 'f';
  const fade = u.dead ? Math.max(0, 1 - u.fade / (ally ? 0.8 : 0.4)) : 1;
  if (fade <= 0) return;
  const lift = unitLift(u);
  const bob = u.moving ? Math.abs(Math.sin(V.time * 11 + u.seed)) * 3 : 0;
  const rise = u.dead && ally ? u.fade * 40 : 0;
  const spawnK = ally ? clamp((V.time - u.bornV) / 0.35, 0.1, 1) : 1;
  c.globalAlpha = fade;
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(u.x, u.y + 2, u.rad * (u.fly ? 0.8 : 1.05), u.rad * 0.45, 0, 0, 7); c.fill();
  const col = u.boss ? '#c040ff' : ally ? rarOf(u.lv).c : '#ff4a3a';
  if (!u.fly) {
    c.strokeStyle = col; c.lineWidth = u.boss ? 3 : ally && u.lv >= 2 ? 3 : 2; c.globalAlpha = fade * 0.85;
    c.beginPath(); c.ellipse(u.x, u.y, u.rad, u.rad * 0.5, 0, 0, 7); c.stroke();
    c.fillStyle = col; c.globalAlpha = fade * 0.15; c.fill();
    c.globalAlpha = fade;
  }
  if (u.boss) glow(c, u.x, u.y - u.rad, u.rad * 1.2, u.enraged ? 'rgba(255,40,40,0.5)' : 'rgba(170,60,255,0.4)');
  if (ally && u.buffT > 0) glow(c, u.x, u.y - u.rad, u.rad, 'rgba(255,220,120,0.35)');
  if (ally && u.lv === 3) glow(c, u.x, u.y - u.rad, u.rad * 0.9, 'rgba(255,180,40,0.25)');
  const atk = u.atkT > 0 ? 1 + u.atkT * 1.2 : 1;
  const sz = u.rad * 3.1 * spawnK * atk * (ally ? 1 + (u.lv - CARDS[u.id].b) * 0.07 : 1);
  const sy = u.y - u.rad * 0.9 - lift - bob - rise;
  const ic = ally ? CARDS[u.id].ic : ENEMIES[u.type].ic;
  c.save(); c.translate(u.x, sy);
  if (u.face < 0 && !u.boss) c.scale(-1, 1);
  drawEmo(c, ic, 0, 0, sz);
  if (u.hitT > 0) { c.globalAlpha = fade * Math.min(1, u.hitT * 8) * 0.8; drawEmo(c, ic, 0, 0, sz, true); c.globalAlpha = fade; }
  c.restore();
  if (!ally) {
    if (u.slowT > 0) { c.fillStyle = 'rgba(150,210,255,0.35)'; c.beginPath(); c.ellipse(u.x, sy, u.rad * 1.1, u.rad * 1.1, 0, 0, 7); c.fill(); }
    if (u.glued) { c.fillStyle = 'rgba(226,192,72,0.45)'; c.beginPath(); c.ellipse(u.x, u.y, u.rad * 1.3, u.rad * 0.6, 0, 0, 7); c.fill(); }
    if (u.stunT > 0) { for (let i = 0; i < 3; i++) { const a = V.time * 4 + i * 2.1; drawEmo(c, '⭐', u.x + Math.cos(a) * u.rad, sy - u.rad - 4 + Math.sin(a) * 4, 9); } }
    if (u.vulnT > 0) { c.strokeStyle = 'rgba(190,140,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(u.x, sy, u.rad * 1.2, u.rad * 1.2, 0, 0, 7); c.stroke(); }
    if (u.burnT > 0 && Math.random() < 0.25) part(u.x + rand(-8, 8), sy, rand(-10, 10), rand(-70, -30), rand(0.3, 0.5), pick(['#ffdc5a', '#ff8a2a']), rand(3, 5), 0, 'fire');
  } else {
    if (u.heal && Math.random() < 0.05) part(u.x + rand(-60, 60), u.y + rand(-30, 30), 0, -40, 0.8, '#ffe98a', 2.5, 0);
    if (u.lv > CARDS[u.id].b) {
      c.fillStyle = rarOf(u.lv).c; c.font = 'bold 10px Inter,sans-serif'; c.textAlign = 'center';
      c.fillText('★'.repeat(u.lv - CARDS[u.id].b), u.x, u.y + u.rad * 0.5 + 10);
    }
  }
  if (!u.dead && (u.hp < u.max || ally) && !u.boss) {
    const bw = Math.max(24, u.rad * 2.2), bx = u.x - bw / 2, by = sy - sz * 0.62 - 4;
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(bx - 1, by - 1, bw + 2, 5);
    c.fillStyle = ally ? (u.hp / u.max < 0.35 ? '#ff8a4a' : '#5fe07a') : '#ff4a3a';
    c.fillRect(bx, by, bw * Math.max(0, u.hp / u.max), 3);
  }
  c.globalAlpha = 1;
}
function drawProj(c, p) {
  if (p.kind === 'orb') { glow(c, p.x, p.y, 10, '#c58bff'); c.fillStyle = '#f0dcff'; c.beginPath(); c.arc(p.x, p.y, 5, 0, 7); c.fill(); if (Math.random() < 0.5) part(p.x, p.y, rand(-20, 20), rand(-20, 20), 0.3, '#c58bff', 3, 0); return; }
  c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0);
  if (p.kind === 'arrow') { c.strokeStyle = '#e8d8b0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-12, 0); c.lineTo(6, 0); c.stroke(); c.fillStyle = '#ddd'; c.beginPath(); c.moveTo(9, 0); c.lineTo(3, -3); c.lineTo(3, 3); c.fill(); }
  else if (p.kind === 'bolt') { c.strokeStyle = '#9aa6b8'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-16, 0); c.lineTo(8, 0); c.stroke(); c.fillStyle = '#e0e6f0'; c.beginPath(); c.moveTo(12, 0); c.lineTo(4, -4); c.lineTo(4, 4); c.fill(); }
  else if (p.kind === 'bone') { c.strokeStyle = '#ff7a6a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-10, 0); c.lineTo(6, 0); c.stroke(); c.fillStyle = '#ffb0a0'; c.beginPath(); c.moveTo(9, 0); c.lineTo(3, -3); c.lineTo(3, 3); c.fill(); }
  c.restore();
}
function drawTowerArrow(c, a) {
  c.save(); c.translate(a.x, a.y); c.rotate(a.ang);
  const g = c.createLinearGradient(-60, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, a.fire ? 'rgba(255,150,60,0.6)' : 'rgba(255,240,200,0.45)');
  c.strokeStyle = g; c.lineWidth = 3; c.beginPath(); c.moveTo(-60, 0); c.lineTo(-10, 0); c.stroke();
  c.strokeStyle = '#d8c8a0'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-22, 0); c.lineTo(8, 0); c.stroke();
  c.fillStyle = '#e8e8f0'; c.beginPath(); c.moveTo(13, 0); c.lineTo(5, -4); c.lineTo(5, 4); c.fill();
  c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(-22, 0); c.lineTo(-27, -4); c.lineTo(-17, 0); c.lineTo(-27, 4); c.fill();
  c.restore();
}
function drawGlue(c, g) {
  const k = g.t / g.life, a = k > 0.82 ? (1 - k) / 0.18 : Math.min(1, g.t * 5);
  const stop = g.t < g.stop;
  c.save(); c.globalAlpha = a;
  const gr = c.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
  gr.addColorStop(0, stop ? 'rgba(232,196,70,0.8)' : 'rgba(214,180,60,0.6)'); gr.addColorStop(0.8, 'rgba(180,140,30,0.5)'); gr.addColorStop(1, 'rgba(150,110,20,0)');
  c.fillStyle = gr; c.beginPath(); c.ellipse(g.x, g.y, g.r, g.r * 0.58, 0, 0, 7); c.fill();
  c.strokeStyle = stop ? 'rgba(255,230,120,0.9)' : 'rgba(240,207,85,0.55)'; c.lineWidth = stop ? 3 : 2;
  c.setLineDash(stop ? [] : [10, 8]); c.beginPath(); c.ellipse(g.x, g.y, g.r * 0.96, g.r * 0.56, 0, 0, 7); c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 7; i++) {
    const s = (i * 1.7 + g.seed) % 6.28, rr = ((i * 37) % 70) / 100 * g.r;
    const bx = g.x + Math.cos(s) * rr, by = g.y + Math.sin(s) * rr * 0.55, ph = (V.time * 1.3 + i * 0.37) % 1;
    c.strokeStyle = `rgba(255,240,170,${(1 - ph) * 0.8})`; c.lineWidth = 1.5;
    c.beginPath(); c.arc(bx, by - ph * 4, 2 + ph * 5, 0, 7); c.stroke();
  }
  if (g.acid) { c.fillStyle = 'rgba(120,255,90,0.12)'; c.beginPath(); c.ellipse(g.x, g.y, g.r * 0.8, g.r * 0.45, 0, 0, 7); c.fill(); }
  c.restore();
}

// ---------- rendu complet ----------
// R : vue du monde (l'état de simulation chez l'hôte, l'état interpolé chez l'invité)
function render(R) {
  const c = ctx;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.fillStyle = '#16240f'; c.fillRect(0, 0, innerWidth, innerHeight);
  const sx = V.shake ? rand(-1, 1) * V.shake : 0, sy = V.shake ? rand(-1, 1) * V.shake : 0;
  c.setTransform(DPR * view.s, 0, 0, DPR * view.s, DPR * (view.ox + sx), DPR * (view.oy + sy));
  c.drawImage(ground, -GP.x, -GP.y);
  for (const d of V.decals) {
    const a = (1 - d.t / d.life);
    if (d.arrow) {
      c.save(); c.globalAlpha = Math.min(1, a * 2); c.translate(d.x, d.y); c.rotate(d.ang);
      c.strokeStyle = '#b8a880'; c.lineWidth = 2; c.beginPath(); c.moveTo(-16, 0); c.lineTo(0, 0); c.stroke();
      c.fillStyle = '#c0392b'; c.fillRect(-18, -2, 5, 4); c.restore(); c.globalAlpha = 1;
    } else { c.fillStyle = `rgba(${d.c},${a * 0.55})`; c.beginPath(); c.ellipse(d.x, d.y, d.r, d.r * 0.55, 0, 0, 7); c.fill(); }
  }
  for (const g of R.glues) drawGlue(c, g);
  for (const f of V.fx) if (f.ground) f.draw(c);
  drawLocalUnder(c, R);
  const ents = [];
  for (const e of R.enemies) ents.push(e);
  for (const f of R.fighters) ents.push(f);
  ents.push({ tower: true, y: TY });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) { if (e.tower) drawTower(c, R.tower, R); else drawUnit(c, e); }
  for (const p of R.proj) drawProj(c, p);
  for (const a of R.arrows) drawTowerArrow(c, a);
  for (const f of V.fx) if (!f.ground) f.draw(c);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const b of V.bolts) {
    const a = b.life / b.max;
    c.globalCompositeOperation = 'lighter';
    for (const [w, col] of [[b.w * 4, `rgba(80,160,255,${0.35 * a})`], [b.w * 1.8, `rgba(170,220,255,${0.8 * a})`], [b.w * 0.7, `rgba(255,255,255,${a})`]]) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); b.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }
  for (const p of V.parts) {
    const a = Math.max(0, p.life / p.max);
    if (p.type === 'fire') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.8; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
    else { c.globalAlpha = a; c.fillStyle = p.color; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  }
  c.globalAlpha = 1;
  for (const p of V.pings) {
    const k = p.t / 2.2;
    for (let i = 0; i < 2; i++) {
      const kk = ((p.t * 1.4 + i * 0.5) % 1);
      c.strokeStyle = p.col; c.globalAlpha = (1 - kk) * (1 - k); c.lineWidth = 3;
      c.beginPath(); c.ellipse(p.x, p.y, 10 + kk * 50, (10 + kk * 50) * 0.55, 0, 0, 7); c.stroke();
    }
    c.globalAlpha = 1 - k; drawEmo(c, '❗', p.x, p.y - 34 - Math.abs(Math.sin(p.t * 6)) * 8, 22); c.globalAlpha = 1;
  }
  drawLocalOver(c, R);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const t of V.texts) {
    const a = Math.min(1, t.life / t.max * 2.5);
    c.globalAlpha = a; c.font = `800 ${t.size}px Inter,sans-serif`;
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(t.txt, t.x, t.y); c.fillStyle = t.color; c.fillText(t.txt, t.x, t.y);
  }
  c.globalAlpha = 1;
  // teintes plein écran
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (V.tint.storm > 0) { c.fillStyle = `rgba(10,15,40,${Math.min(0.35, V.tint.storm * 0.3)})`; c.fillRect(0, 0, innerWidth, innerHeight); }
  if (V.tint.frost > 0) {
    const a = Math.min(0.25, V.tint.frost * 0.25);
    const g = c.createRadialGradient(innerWidth / 2, innerHeight / 2, innerHeight * 0.3, innerWidth / 2, innerHeight / 2, innerWidth * 0.7);
    g.addColorStop(0, 'rgba(180,220,255,0)'); g.addColorStop(1, `rgba(200,235,255,${a * 2.2})`);
    c.fillStyle = g; c.fillRect(0, 0, innerWidth, innerHeight);
    if (Math.random() < 0.9) for (let i = 0; i < 3; i++) part(rand(view.x0, view.x1), view.y0, rand(-30, 30), rand(80, 160), rand(3, 6), 'rgba(255,255,255,0.8)', rand(2, 4), 0);
  }
  if (V.tint.time > 0) { c.fillStyle = `rgba(80,40,140,${Math.min(0.28, V.tint.time * 0.3)})`; c.fillRect(0, 0, innerWidth, innerHeight); }
  if (V.flash > 0) { c.fillStyle = `rgba(${V.flashC},${Math.min(0.6, V.flash)})`; c.fillRect(0, 0, innerWidth, innerHeight); }
  const vg = c.createRadialGradient(innerWidth / 2, innerHeight / 2, Math.min(innerWidth, innerHeight) * 0.45, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vg; c.fillRect(0, 0, innerWidth, innerHeight);
  if (R.tower.hp / R.tower.max < 0.25 && R.phase !== 'end') {
    const a = 0.25 + 0.15 * Math.sin(V.time * 6);
    const rg = c.createRadialGradient(innerWidth / 2, innerHeight / 2, innerHeight * 0.4, innerWidth / 2, innerHeight / 2, innerWidth * 0.75);
    rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, `rgba(200,0,0,${a})`);
    c.fillStyle = rg; c.fillRect(0, 0, innerWidth, innerHeight);
  }
}
