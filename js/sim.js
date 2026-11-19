'use strict';
/* =====================================================================
   SIMULATION (tourne chez l'hôte, ou en solo) + IA coéquipière
   ===================================================================== */
let G = null;

function newGame(o) {
  // o = { ST, SI, ctl: { tower: 'local'|'remote'|'ai', inv: ... } }
  G = {
    time: 0, wave: 0, phase: 'prep', result: null, waveT: 0, speed: 1, paused: false, endT: 0, shown: false,
    ST: o.ST, SI: o.SI, ctl: o.ctl, ready: { tower: false, inv: false },
    tower: { hp: o.ST.hp, max: o.ST.hp, hitT: 0, ang: -Math.PI / 2, charge: 0, charging: false, chargeT: 0, reload: 0, reloadK: 0, glueCd: 0, rainCd: 0, fall: 0 },
    inv: { hand: [], drawT: 0, charges: 1, poseT: 0, poseCd: 0 },
    diff: DIFFS[o.diff] || DIFFS.normal, diffKey: DIFFS[o.diff] ? o.diff : 'normal',
    enemies: [], fighters: [], arrows: [], proj: [], glues: [], tasks: [], queue: [],
    xp: 0, kills: 0, played: 0, fused: 0, shots: 0, hits: 0, nid: 1, bossRef: null,
    ai: { tower: { think: 0, err: 0 }, inv: { t: 1.2 } },
  };
  invDraw(1);
}
const liveEnemies = () => G.enemies.filter(e => !e.dead);
const hitPoint = e => ({ x: e.x, y: e.y - e.rad * 0.9 - (e.fly ? 28 : 0) });
function later(t, fn) { G.tasks.push({ t, fn }); }

// =====================================================================
//  VAGUES
// =====================================================================
function setReady(role, v = true) {
  if (!G || G.phase !== 'prep') return;
  if (G.ready[role] !== v) { G.ready[role] = v; if (v) fx('sfx', 'ready'); }
}
function launchWave() {
  if (!G || G.phase !== 'prep') return;
  G.wave++; G.phase = 'wave'; G.waveT = 0; G.ready = { tower: false, inv: false };
  const wv = WAVES[G.wave - 1];
  buildQueue(wv);
  if (wv.boss) { fx('banner', 'LE BOSS ARRIVE', ENEMIES[wv.boss].n, '#c040ff'); fx('sfx', 'boss'); fx('shake', 10); }
  else if (G.wave > 1 && (G.wave - 1) % LEVEL_LEN === 0) { const L = LEVELS[levelOf(G.wave) - 1]; fx('banner', `Niveau ${levelOf(G.wave)} · ${L.n}`, L.d, '#ff6a4a'); fx('sfx', 'boss'); }
  else { fx('banner', `Vague ${G.wave}`, `${G.queue.length} ennemis approchent`, '#ff6a4a'); fx('sfx', 'wave'); }
  // nouveau monstre dans cette partie : on explique sa particularité
  G.seenT = G.seenT || {};
  for (const t in wv.list) if (!G.seenT[t]) { G.seenT[t] = 1; if (ENEMIES[t].info) fx('notice', `Nouveau : ${ENEMIES[t].ic} ${ENEMIES[t].n}. ${ENEMIES[t].info}`); }
  if (G.SI.startDraw) invDraw(G.SI.startDraw);
  if (G.SI.waveCharge) { G.inv.charges = Math.min(G.SI.charges, G.inv.charges + G.SI.waveCharge); invRefresh(); }
}
function buildQueue(wv) {
  const list = [];
  for (const t in wv.list) for (let i = 0; i < wv.list[t]; i++) list.push(t);
  list.sort(() => Math.random() - 0.5);
  const q = [];
  let ga = rand(0, Math.PI * 2), gt = 0;
  list.forEach((type, i) => {
    const t = (i / list.length) * wv.dur + rand(0, 1.2);
    if (t - gt > 3.5) { ga = rand(0, Math.PI * 2); gt = t; }
    q.push({ t, type, a: ga + rand(-0.45, 0.45) });
  });
  if (wv.boss) q.push({ t: 2.5, type: wv.boss, a: rand(0, Math.PI * 2) });
  q.sort((a, b) => a.t - b.t);
  G.queue = q;
}
function edgePoint(a) {
  // juste hors du terrain (bornes fixes : identiques pour les deux joueurs)
  const dx = Math.cos(a), dy = Math.sin(a), x0 = -230, x1 = W + 230, y0 = -130, y1 = H + 130;
  let t = 1e9;
  if (dx > 0) t = Math.min(t, (x1 - TX) / dx); if (dx < 0) t = Math.min(t, (x0 - TX) / dx);
  if (dy > 0) t = Math.min(t, (y1 - TY) / dy); if (dy < 0) t = Math.min(t, (y0 - TY) / dy);
  return { x: TX + dx * t, y: TY + dy * t };
}
function spawnEnemy(type, a, x, y) {
  const D = ENEMIES[type];
  const p = x !== undefined ? { x, y } : edgePoint(a);
  const w = Math.max(1, G.wave);
  const hpMul = (D.boss ? 1 : waveHpMul(w)) * G.diff.hp;
  const e = {
    kind: 'e', uid: G.nid++, type, D, x: p.x, y: p.y, hp: D.hp * hpMul, max: D.hp * hpMul, spd: D.spd * rand(0.92, 1.08), dmg: D.dmg * G.diff.atk * (D.boss ? 1 : waveDmgMul(w)), cd: D.cd, t: rand(0, D.cd),
    rad: D.rad, range: D.range || 0, fly: !!D.fly, xp: D.xp, boss: !!D.boss, seed: rand(0, 99),
    slowT: 0, slowF: 0, stunT: 0, vulnT: 0, hitT: 0, burnT: 0, burnDps: 0, glued: false, dead: false, fade: 0, moving: true, atkT: 0, face: 1,
    slamT: 6, sumT: 8, enraged: false, regen: (D.regen || 0) * hpMul, armor: D.armor || 0,
    heal: (D.heal || 0) * hpMul, healT: rand(0.5, 2), siegeT: 4,
  };
  G.enemies.push(e);
  if (e.boss) G.bossRef = e;
  return e;
}
function waveCleared() {
  const bonus = 4 + G.wave * 3;
  G.xp += bonus;
  G.phase = 'prep';
  const heal = 0.3 + G.SI.fHeal;
  for (const f of G.fighters) if (!f.dead) f.hp = Math.min(f.max, f.hp + f.max * heal);
  if (G.ST.repair) { const h = G.tower.max * G.ST.repair; G.tower.hp = Math.min(G.tower.max, G.tower.hp + h); fx('text', TX, TY - 150, `+${Math.round(h)} PV`, '#7eff9a', 18, 1.4); }
  if (G.levelUp) {
    G.levelUp = false;
    const h = G.tower.max * 0.5; G.tower.hp = Math.min(G.tower.max, G.tower.hp + h);
    fx('text', TX, TY - 175, `Tour réparée : +${Math.round(h)} PV`, '#7eff9a', 18, 1.8);
    const lv = levelOf(G.wave);
    fx('banner', `NIVEAU ${lv} TERMINÉ !`, `+${fmt(bonus + G.levelBonus)} XP · Le niveau ${lv + 1} commence…`, '#ffcc4d');
  } else {
    const next = WAVES[G.wave];
    fx('banner', `Vague ${G.wave} repoussée !`, `+${fmt(bonus)} XP · ${next && next.boss ? 'Le boss approche…' : 'Préparez la suite'}`, '#7eff9a');
  }
  fx('sfx', 'heal');
}
function endRun(win) {
  if (G.phase === 'end') return;
  G.phase = 'end'; G.result = win ? 'win' : 'lose'; G.endT = 0;
  G.tower.charging = false; G.tower.charge = 0;
  if (win) {
    const bonus = 400;
    G.xp += bonus; G.winBonus = bonus;
    for (const e of G.enemies) if (!e.dead) { e.dead = true; e.fade = 0; }
    fx('banner', 'VICTOIRE !', `${LAST_BOSS.n} est vaincu · les ${LEVELS.length} niveaux sont terminés`, '#ffcc4d'); fx('confetti');
  } else {
    fx('banner', 'La tour est tombée…', '', '#ff4a3a'); fx('towerDown');
  }
}

// =====================================================================
//  LA TOUR (joueur archer)
// =====================================================================
function arrowRange(k) { return G.ST.range * (G.ST.quick ? 1 : 0.12 + 0.88 * k * k); }
function towerFire(ang, k) {
  const T = G.tower, S = G.ST;
  if (G.phase === 'end' || T.reload > 0) return false;
  k = S.quick ? 1 : clamp(k || 0, 0, 1);
  const range = arrowRange(k);
  const n = S.multi, spread = 0.075;
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * spread;
    G.arrows.push({ uid: G.nid++, x: OX + Math.cos(a) * 26, y: OY + Math.sin(a) * 26, vx: Math.cos(a) * ARROW_SPD, vy: Math.sin(a) * ARROW_SPD, ang: a, d: 0, range, pierce: S.pierce, hit: [], fire: S.burn > 0 ? 1 : 0 });
  }
  T.reload = S.reload; T.charge = 0; T.charging = false; T.chargeT = 0; T.ang = ang;
  G.shots++;
  fx('sfx', 'bow');
  return true;
}
function towerGlue(x, y) {
  const T = G.tower, S = G.ST;
  if (!S.glue) return 'Pot de glu non débloqué';
  if (G.phase === 'end') return 'Partie terminée';
  if (T.glueCd > 0) return `Glu prête dans ${Math.ceil(T.glueCd)} s`;
  x = clamp(x, 0, W); y = clamp(y, 60, H);
  G.glues.push({ uid: G.nid++, x, y, r: S.glueR, t: 0, life: 6 + S.glueStop, stop: S.glueStop, acid: S.acid, seed: rand(0, 6) });
  T.glueCd = S.glueCd;
  fx('glue', x, y, S.glueR);
  return null;
}
function towerRain(x, y) {
  const T = G.tower, S = G.ST;
  if (!S.rain) return 'Pluie de flèches non débloquée';
  if (G.phase === 'end') return 'Partie terminée';
  if (T.rainCd > 0) return `Pluie prête dans ${Math.ceil(T.rainCd)} s`;
  T.rainCd = S.rainCd;
  fx('sfx', 'bow'); fx('text', x, y - 70, 'Pluie de flèches !', '#ffe9b0', 18, 1.2);
  // 45 flèches en 2,2 s : chacune touche tous les ennemis proches de son impact,
  // avec les bonus de l'archer (critique, Tueur de géants, feu, givre), et cloue au sol.
  const R = RAIN_R;
  for (let i = 0; i < 45; i++) {
    const a = rand(0, 7), r = Math.sqrt(Math.random()) * R, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.6, d = i * 0.05;
    later(d, () => fx('rainArrow', px, py));
    later(d + 0.32, () => {
      for (const e of G.enemies) {
        if (e.dead || Math.hypot(e.x - px, e.y - py) > 32 + e.rad) continue;
        const crit = Math.random() < S.crit;
        const dmg = S.dmg * 1.3 * (crit ? 2.5 : 1) * (S.giant && (e.boss || e.type === 'ogre' || e.type === 'troll') ? 1 + S.giant : 1);
        if (S.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, S.dmg * S.burn / 3); }
        e.slowF = e.slowT > 0 ? Math.max(e.slowF, 0.4, S.frost) : Math.max(0.4, S.frost); e.slowT = Math.max(e.slowT, 2);
        damageEnemy(e, dmg, !crit, crit);
      }
    });
  }
  return null;
}
function updTower(dt) {
  const T = G.tower, S = G.ST;
  T.hitT = Math.max(0, T.hitT - dt);
  T.reload = Math.max(0, T.reload - dt); T.reloadK = T.reload;
  // les sorts de la tour ne se rechargent que pendant les vagues (comme l'invocation)
  if (G.phase === 'wave') { T.glueCd = Math.max(0, T.glueCd - dt); T.rainCd = Math.max(0, T.rainCd - dt); }
  if (G.phase === 'end') { if (G.result === 'lose') T.fall = Math.min(1, T.fall + dt * 0.6); return; }
  if (G.phase === 'wave' && S.regen && T.hp < T.max) T.hp = Math.min(T.max, T.hp + S.regen * dt);
}
function updArrows(dt) {
  const S = G.ST;
  for (const a of G.arrows) {
    for (let s = 0; s < 2 && !a.done; s++) {
      const st = dt / 2;
      a.x += a.vx * st; a.y += a.vy * st; a.d += ARROW_SPD * st;
      for (const e of G.enemies) {
        if (e.dead || a.hit.includes(e.uid)) continue;
        const h = hitPoint(e);
        if (Math.hypot(a.x - h.x, a.y - h.y) < e.rad + 8) {
          a.hit.push(e.uid); G.hits++;
          const crit = Math.random() < S.crit;
          const dmg = S.dmg * (crit ? 2.5 : 1) * (S.giant && (e.boss || e.type === 'ogre' || e.type === 'troll') ? 1 + S.giant : 1);
          fx('hit', h.x, h.y);
          if (S.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps, S.dmg * S.burn / 3); }
          if (S.frost) { e.slowF = e.slowT > 0 ? Math.max(e.slowF, S.frost) : S.frost; e.slowT = Math.max(e.slowT, 1.5); }
          if (S.explode) {
            fx('explode', h.x, h.y, 55);
            for (const o of G.enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 55 + o.rad) damageEnemy(o, dmg * 0.5, true);
          }
          G.dmgA = (G.dmgA || 0) + dmg;
          damageEnemy(e, dmg, false, crit);
          if (a.pierce > 0) a.pierce--; else { a.done = true; break; }
        }
      }
      if (!a.done && a.d >= a.range) { a.done = true; fx('arrowLand', a.x, a.y, a.ang); }
    }
  }
  G.arrows = G.arrows.filter(a => !a.done);
}
function updGlues(dt) {
  for (const g of G.glues) g.t += dt;
  G.glues = G.glues.filter(g => g.t < g.life);
}

// =====================================================================
//  L'INVOCATEUR (main, pioche, fusion)
// =====================================================================
function rollDraw() {
  const S = G.SI, o = drawOdds(S.luck);
  let r = Math.random() * 100, tier = 3;
  for (let i = 0; i < 4; i++) { if (r < o[i]) { tier = i; break; } r -= o[i]; }
  if (Math.random() < S.upDraw) tier = Math.min(3, tier + 1);
  const pool = S.pool.map(id => CARDS[id]).filter(d => d.b <= tier);
  const ws = pool.map(d => d.b === tier ? 3 : 1), tot = ws.reduce((a, b) => a + b, 0);
  let x = Math.random() * tot, def = pool[0];
  for (let i = 0; i < pool.length; i++) { if (x < ws[i]) { def = pool[i]; break; } x -= ws[i]; }
  return { uid: G.nid++, id: def.id, lv: tier };
}
function invDraw(n) {
  const I = G.inv; let k = 0;
  for (let i = 0; i < n; i++) { if (I.hand.length >= G.SI.handMax) break; I.hand.push(rollDraw()); k++; }
  if (k) fx('sfx', 'draw');
  return k;
}
function invTick(dt) {
  const I = G.inv, S = G.SI;
  if (I.charges < S.charges) {
    I.poseT += dt;
    if (I.poseT >= S.poseCd) { I.charges++; I.poseT = I.charges < S.charges ? I.poseT - S.poseCd : 0; if (S.charges > 1) fx('sfx', 'ready'); }
  }
  invRefresh();
  if (I.hand.length < S.handMax) {
    I.drawT += dt;
    if (I.drawT >= S.drawInt) { I.drawT -= S.drawInt; invDraw(S.drawN); }
  }
}
// temps restant avant la prochaine invocation stockée (0 si la réserve est pleine)
function invRefresh() { const I = G.inv, S = G.SI; I.poseCd = I.charges < S.charges ? Math.max(0, S.poseCd - I.poseT) : 0; }
const handCard = uid => G.inv.hand.find(c => c.uid === uid);
function invPlay(uid, x, y) {
  const I = G.inv, card = handCard(uid);
  if (!card) return 'Carte introuvable';
  if (G.phase === 'end') return 'Partie terminée';
  if (I.charges < 1) return `Invocation possible dans ${Math.ceil(I.poseCd)} s`;
  const def = CARDS[card.id];
  if (def.type === 'spell' && def.id !== 'benediction' && !liveEnemies().length) return 'Aucun ennemi à viser';
  x = clamp(x, 40, W - 40); y = clamp(y, 100, H - 40);
  if (def.type === 'fighter' && !def.u.fly) { const d = Math.hypot(x - TX, y - TY), m = TR + def.u.rad + 14; if (d < m) { const a = d > 1 ? Math.atan2(y - TY, x - TX) : Math.PI / 2; x = TX + Math.cos(a) * m; y = TY + Math.sin(a) * m; } }
  I.hand.splice(I.hand.indexOf(card), 1);
  if (!(G.SI.freePose && Math.random() < G.SI.freePose)) { if (I.charges >= G.SI.charges) I.poseT = 0; I.charges--; }
  else fx('text', x, y - 70, 'Élan : invocation gratuite !', '#e0b3ff', 15, 1.2);
  invRefresh(); G.played++;
  if (def.type === 'fighter') {
    summon(card, x, y);
    if (G.SI.squire) summon({ id: 'milicien', lv: 0 }, x + rand(-30, 30), y + 26);
  } else castSpell(card, x, y, false);
  return null;
}
function invFuse(ua, ub) {
  const A = handCard(ua), B = handCard(ub);
  if (!A || !B || A === B) return 'Carte introuvable';
  if (A.id !== B.id || A.lv !== B.lv) return 'Il faut deux cartes identiques de même rang';
  if (A.lv >= 3) return 'Rang maximum déjà atteint';
  G.inv.hand.splice(G.inv.hand.indexOf(B), 1);
  A.lv++; A.fz = 1; G.fused++;
  fx('sfx', 'fuse', A.lv);
  return null;
}
function invDiscard(uid) {
  const I = G.inv, card = handCard(uid);
  if (!card) return 'Carte introuvable';
  I.hand.splice(I.hand.indexOf(card), 1);
  if (G.SI.recycle && G.phase === 'wave' && I.charges < G.SI.charges) { I.poseT += G.SI.recycle; fx('text', TX, TY - 160, `♻️ −${G.SI.recycle} s`, '#c070ff', 14, 0.9); }
  fx('sfx', 'trash');
  return null;
}

// ---------- combattants ----------
function summon(card, x, y) {
  const def = CARDS[card.id], u = def.u, S = G.SI;
  const m = cardMult(card, S);
  const hp = u.hp * m * (1 + S.fHp);
  const f = {
    kind: 'f', uid: G.nid++, id: def.id, lv: card.lv, x, y, hx: x, hy: y, hp, max: hp, dmg: u.dmg * m * (1 + S.fDmg), cd: u.cd / (1 + S.fAs), t: 0.3,
    range: u.range, spd: u.spd, rad: u.rad, fly: !!u.fly, seed: rand(0, 99), hitT: 0, buffT: 0, bornV: V.time, rt: 0, target: null,
    dead: false, fade: 0, moving: false, atkT: 0, face: 1, heal: u.heal ? u.heal * m : 0,
  };
  G.fighters.push(f);
  fx('summon', Math.round(x), Math.round(y), card.lv);
  return f;
}
function fighterTarget(f) {
  let best = null, bd = 1e9;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dh = Math.hypot(e.x - f.hx, e.y - f.hy), dtw = Math.hypot(e.x - TX, e.y - TY);
    if (dh > 330 && dtw > 210) continue;
    let d = dist(f, e); if (e.boss) d -= 40;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function moveTo(o, x, y, spd, dt, stop) {
  const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
  if (d <= stop || d < 0.01) return;
  const s = Math.min(spd * dt, d - stop);
  o.x += dx / d * s; o.y += dy / d * s; o.moving = s > 0.01;
  if (Math.abs(dx) > 2) o.face = dx > 0 ? 1 : -1;
}
function updFighter(f, dt) {
  if (f.dead) { f.fade += dt; return; }
  f.hitT = Math.max(0, f.hitT - dt); f.buffT = Math.max(0, f.buffT - dt); f.t -= dt; f.atkT = Math.max(0, f.atkT - dt);
  if (f.heal) { for (const o of G.fighters) if (!o.dead && dist(o, f) < 100) o.hp = Math.min(o.max, o.hp + f.heal * dt); }
  f.rt -= dt;
  if (f.rt <= 0 || !f.target || f.target.dead) { f.target = fighterTarget(f); f.rt = 0.35; }
  const tg = f.target;
  f.moving = false;
  if (tg) {
    const d = dist(f, tg), reach = f.range + tg.rad + f.rad * 0.4;
    f.face = tg.x >= f.x ? 1 : -1;
    if (d > reach + 0.5) moveTo(f, tg.x, tg.y, f.spd, dt, reach - 1);
    else if (f.t <= 0) { f.t = f.cd; fighterAttack(f, tg); }
  } else if (Math.hypot(f.hx - f.x, f.hy - f.y) > 6) moveTo(f, f.hx, f.hy, f.spd * 0.8, dt, 0);
}
function fighterAttack(f, tg) {
  const u = CARDS[f.id].u, dmg = f.dmg * (f.buffT > 0 ? 1.3 : 1);
  f.atkT = 0.18;
  if (u.breath) {
    const a0 = Math.atan2(tg.y - f.y, tg.x - f.x);
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = dist(f, e); if (d > u.range + e.rad + 20) continue;
      let da = Math.abs(Math.atan2(e.y - f.y, e.x - f.x) - a0); if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.5 || d < 30) damageEnemy(e, dmg, true);
    }
    fx('breath', Math.round(f.x), Math.round(f.y), +a0.toFixed(2));
    return;
  }
  if (u.proj) {
    G.proj.push({ uid: G.nid++, x: f.x, y: f.y - (f.fly ? 30 : 14), tg, tx: tg.x, ty: tg.y, spd: u.proj === 'orb' ? 380 : 620, dmg, kind: u.proj, aoe: u.aoe ? u.aoe * (1 + G.SI.area * 0.5) : 0, ally: true, ang: 0 });
    fx('sfx', 'shoot');
    return;
  }
  if (u.slam) {
    fx('slam', Math.round(tg.x), Math.round(tg.y), u.slam);
    for (const e of G.enemies) if (!e.dead && dist(e, tg) < u.slam + e.rad) damageEnemy(e, dmg);
  } else {
    damageEnemy(tg, dmg);
    fx('slash', Math.round(f.x), Math.round(f.y), Math.round(tg.x), Math.round(tg.y));
  }
}
function hurtFighter(f, dmg) {
  if (f.dead) return;
  f.hp -= dmg; f.hitT = 0.15;
  if (f.hp <= 0) { f.dead = true; f.fade = 0; fx('fdie', Math.round(f.x), Math.round(f.y), f.lv, CARDS[f.id].n); }
}

// ---------- effets ----------
function castSpell(card, x, y, isEcho) {
  const def = CARDS[card.id], S = G.SI, sp = def.sp, up = card.lv - def.b;
  const p = (1 + S.sDmg) * cardMult(card, S);
  const area = 1 + S.area, fz = 1 + S.freeze;
  fx('text', Math.round(x), Math.round(y) - 50, (isEcho ? 'Écho : ' : '') + def.n + ' !', rarOf(card.lv).c, 18, 1.2);
  switch (def.id) {
    case 'eclair': case 'orage': {
      const mul = def.id === 'eclair' ? 1 : 3;
      const n = sp.strikes + S.bolt * mul + up * mul;
      const dur = sp.dur * (1 + S.dur);
      if (def.id === 'orage') fx('tint', 'storm', dur + 0.5);
      for (let i = 0; i < n; i++) later((i + 0.4) * dur / n, () => { const L = liveEnemies(); if (L.length) strike(pick(L), sp.dmg * p); });
      break;
    }
    case 'feu': {
      const R = sp.rad * area;
      fx('fireball', Math.round(x - 260), Math.round(y - 520), Math.round(x), Math.round(y), 0.75);
      later(0.75, () => {
        fx('fireImpact', Math.round(x), Math.round(y), R);
        for (const e of liveEnemies()) if (Math.hypot(e.x - x, e.y - y) < R + e.rad) damageEnemy(e, sp.dmg * p);
      });
      break;
    }
    case 'blizzard': {
      const d = sp.dur * fz * (1 + 0.25 * up);
      fx('frostAll', d);
      for (const e of liveEnemies()) { e.slowT = d; e.slowF = sp.slow; damageEnemy(e, sp.dmg * p); fx('frostHit', Math.round(e.x), Math.round(e.y)); }
      break;
    }
    case 'benediction': {
      const T = G.tower, h = Math.round(T.max * Math.min(1, sp.heal * (1 + 0.5 * up)));
      T.hp = Math.min(T.max, T.hp + h);
      fx('bless', h);
      for (const f of G.fighters) if (!f.dead) { f.hp = f.max; f.buffT = sp.buff * (1 + 0.3 * up); fx('blessUnit', Math.round(f.x), Math.round(f.y)); }
      break;
    }
    case 'meteore': {
      const R = sp.rad * area;
      fx('meteor', Math.round(x), Math.round(y), R, 1.15);
      later(1.15, () => {
        fx('meteorImpact', Math.round(x), Math.round(y), R);
        for (const e of liveEnemies()) if (Math.hypot(e.x - x, e.y - y) < R + e.rad) { damageEnemy(e, sp.dmg * p); e.stunT = Math.max(e.stunT, sp.stun * fz); }
      });
      break;
    }
    case 'jugement': {
      const targets = liveEnemies(), pts = [];
      for (const e of targets) pts.push(Math.round(e.x), Math.round(e.y));
      fx('judgement', pts);
      later(0.55, () => { for (const e of targets) if (!e.dead) damageEnemy(e, sp.dmg * p); });
      break;
    }
    case 'faille': {
      const d = sp.dur * fz * (1 + 0.25 * up);
      for (const e of liveEnemies()) { e.stunT = Math.max(e.stunT, d); e.vulnT = Math.max(e.vulnT, d); }
      fx('rift', Math.round(x), Math.round(y), d);
      break;
    }
  }
  if (!isEcho && S.echo && Math.random() < S.echo) later(1, () => { if (G.phase !== 'end' && (liveEnemies().length || def.id === 'benediction')) castSpell(card, x, y, true); });
}
function strike(e, dmg) {
  fx('strike', Math.round(e.x), Math.round(e.y));
  const hit = new Set([e]); let last = e;
  damageEnemy(e, dmg);
  for (let i = 0; i < G.SI.chain; i++) {
    let nb = null, nd = 160;
    for (const o of G.enemies) { if (o.dead || hit.has(o)) continue; const d = dist(o, last); if (d < nd) { nd = d; nb = o; } }
    if (!nb) break;
    fx('chain', Math.round(last.x), Math.round(last.y), Math.round(nb.x), Math.round(nb.y));
    damageEnemy(nb, dmg * 0.6); hit.add(nb); last = nb;
  }
}

// =====================================================================
//  ENNEMIS
// =====================================================================
function nearestFighter(e, maxD) {
  let best = null, bd = maxD;
  for (const f of G.fighters) {
    if (f.dead) continue;
    const d = dist(e, f) - f.rad;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
function updEnemy(e, dt) {
  if (e.dead) { e.fade += dt; return; }
  e.hitT = Math.max(0, e.hitT - dt); e.vulnT = Math.max(0, e.vulnT - dt); e.atkT = Math.max(0, e.atkT - dt);
  if (G.phase === 'end') { e.moving = false; return; }
  // glu
  let gl = false, gstop = false, acid = 0;
  if (!e.fly) for (const g of G.glues) {
    const dx = e.x - g.x, dy = (e.y - g.y) / 0.58;
    if (dx * dx + dy * dy < g.r * g.r) { gl = true; if (g.t < g.stop) gstop = true; acid += g.acid; }
  }
  e.glued = gl;
  if (e.burnT > 0) {
    e.burnT -= dt; const b = e.burnDps * dt; e.hp -= b;
    if (e.hp <= 0) { killEnemy(e); return; }
  }
  if (acid) { e.hp -= acid * dt; if (e.hp <= 0) { killEnemy(e); return; } }
  if (e.regen && e.burnT <= 0 && e.hp < e.max) e.hp = Math.min(e.max, e.hp + e.regen * dt);
  if (e.stunT > 0) { e.stunT -= dt; e.moving = false; return; }
  e.t -= dt;
  let spd = e.spd;
  if (e.slowT > 0) { e.slowT -= dt; spd *= 1 - e.slowF; }
  if (gstop) spd *= e.boss ? 0.25 : 0; else if (gl) spd *= e.boss ? 0.6 : 0.35;
  if (e.boss) bossAbilities(e, dt);
  if (e.heal) {
    e.healT -= dt;
    if (e.healT <= 0) {
      e.healT = 2;
      let n = 0;
      for (const o of G.enemies) if (!o.dead && !o.boss && o.hp < o.max && Math.hypot(o.x - e.x, o.y - e.y) < 150) { o.hp = Math.min(o.max, o.hp + e.heal); n++; }
      if (n) fx('enemyHeal', Math.round(e.x), Math.round(e.y));
    }
  }
  let tgt = null;
  const dTower = Math.hypot(e.x - TX, e.y - TY);
  if (e.D.siege && !e.boss) {
    if (dTower <= e.range + TR) tgt = 'tower';
  } else if (e.D.dive) {
    if (dTower <= TR + e.rad + 4) tgt = 'tower';
  } else if (e.range) {
    const nf = nearestFighter(e, e.range);
    if (nf) tgt = nf; else if (dTower <= e.range + TR) tgt = 'tower';
  } else {
    const nf = nearestFighter(e, (e.boss ? 90 : 55) + e.rad);
    if (nf) tgt = nf; else if (dTower <= TR + e.rad + 4) tgt = 'tower';
  }
  e.moving = false;
  if (tgt) {
    const tx = tgt === 'tower' ? TX : tgt.x, ty = tgt === 'tower' ? TY : tgt.y;
    const reach = (e.range || 0) + e.rad + (tgt === 'tower' ? TR : tgt.rad) + 2;
    const d = Math.hypot(tx - e.x, ty - e.y);
    if (d > reach + 0.5) moveTo(e, tx, ty, spd, dt, reach - 1);
    else if (e.t <= 0) { e.t = e.cd * (e.enraged ? 0.7 : 1); enemyAttack(e, tgt); }
  } else moveTo(e, TX, TY, spd, dt, TR + e.rad);
}
function enemyAttack(e, tgt) {
  e.atkT = 0.18;
  if (e.range) {
    G.proj.push({ uid: G.nid++, x: e.x, y: e.y - 14 - (e.fly ? 28 : 0), tg: tgt, tx: tgt === 'tower' ? TX : tgt.x, ty: tgt === 'tower' ? TY - 30 : tgt.y, spd: 420, dmg: e.dmg, kind: e.D.proj || 'bone', ally: false, src: e, ang: 0 });
    return;
  }
  if (tgt === 'tower') hurtTower(e.dmg, e);
  else {
    hurtFighter(tgt, e.dmg);
    if (e.D.cleave) { for (const f of G.fighters) if (f !== tgt && !f.dead && dist(f, tgt) < e.D.cleave) hurtFighter(f, e.dmg * 0.5); fx('slam', Math.round(tgt.x), Math.round(tgt.y), e.D.cleave); }
  }
  if (e.D.drain && !e.dead) e.hp = Math.min(e.max, e.hp + e.dmg * e.D.drain);
  if (e.boss) { fx('shake', 4); fx('sfx', 'boom'); }
}
function bossAbilities(e, dt) {
  e.slamT -= dt; e.sumT -= dt;
  if (!e.enraged && e.hp < e.max * 0.4) {
    e.enraged = true; e.spd *= 1.7; fx('banner', `${e.D.n} enrage !`, '', '#ff3040'); fx('sfx', 'boss'); fx('shake', 12);
  }
  if (e.slamT <= 0) {
    e.slamT = e.enraged ? 4.5 : 6.5;
    const R = e.D.slamR || 130;
    const near = G.fighters.some(f => !f.dead && dist(f, e) < R) || Math.hypot(e.x - TX, e.y - TY) < R + 30;
    if (near) {
      fx('bossSlam', Math.round(e.x), Math.round(e.y), R);
      const sd = (e.D.slam || 45) * G.diff.atk;
      for (const f of G.fighters) if (!f.dead && dist(f, e) < R) hurtFighter(f, sd);
      if (Math.hypot(e.x - TX, e.y - TY) < R + TR) hurtTower(sd * 0.45, null);
    } else e.slamT = 1;
  }
  if (e.D.siege) {
    e.siegeT -= dt;
    if (e.siegeT <= 0) {
      e.siegeT = e.D.siege.cd * (e.enraged ? 0.7 : 1);
      G.proj.push({ uid: G.nid++, x: e.x, y: e.y - e.rad * 1.6, tg: 'tower', tx: TX, ty: TY - 30, spd: 360, dmg: e.D.siege.dmg * G.diff.atk, kind: 'flame', ally: false, src: null, ang: 0 });
    }
  }
  if (e.sumT <= 0) {
    e.sumT = e.enraged ? 6 : 9;
    for (let i = 0; i < (e.D.sumN || 3); i++) {
      const a = rand(0, Math.PI * 2);
      const m = spawnEnemy(pick(e.D.summon || ['gob']), 0, e.x + Math.cos(a) * 55, e.y + Math.sin(a) * 40);
      fx('bossSummon', Math.round(m.x), Math.round(m.y));
    }
    fx('text', Math.round(e.x), Math.round(e.y) - 90, 'Invocation !', '#d58bff', 15, 1.2);
  }
}
function hurtTower(dmg, src) {
  if (G.phase === 'end') return;
  G.tower.hp -= dmg * (1 - Math.min(0.6, G.ST.armor)); G.tower.hitT = 0.15; fx('sfx', 'hurt');
  if (src && G.ST.thorns) damageEnemy(src, G.ST.thorns, true);
  if (G.tower.hp <= 0) { G.tower.hp = 0; endRun(false); }
}
function damageEnemy(e, dmg, quiet, crit) {
  if (e.dead) return;
  if (e.vulnT > 0) dmg *= 1.5;
  if (e.armor) dmg *= 1 - e.armor;
  e.hp -= dmg; e.hitT = 0.1;
  if (!quiet || dmg >= 30) fx('dmg', Math.round(e.x), Math.round(e.y - e.rad * 2 - 8 - (e.fly ? 28 : 0)), Math.round(dmg), crit ? 1 : 0);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true; e.fade = 0;
  G.xp += e.xp; G.kills++;
  fx('edie', Math.round(e.x), Math.round(e.y), e.boss ? 1 : 0, e.xp);
  if (e.boss) {
    if (G.wave >= WAVES.length) endRun(true);
    else {
      // fin d'un niveau : l'escorte du boss se disperse
      G.queue = []; G.levelUp = true; G.levelBonus = 60 * levelOf(G.wave); G.xp += G.levelBonus;
      for (const o of G.enemies) if (!o.dead) { o.dead = true; o.fade = 0; fx('bossSummon', Math.round(o.x), Math.round(o.y)); }
      fx('confetti');
    }
  }
}
function updProj(dt) {
  for (const p of G.proj) {
    const alive = p.tg === 'tower' || (p.tg && !p.tg.dead);
    if (alive) { p.tx = p.tg === 'tower' ? TX : p.tg.x; p.ty = p.tg === 'tower' ? TY - 30 : p.tg.y - (p.tg.fly ? 24 : 6); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), s = p.spd * dt;
    p.ang = Math.atan2(dy, dx);
    if (d <= s + 4) {
      p.done = true;
      if (p.ally) {
        if (p.aoe) {
          fx('explode', Math.round(p.tx), Math.round(p.ty), Math.round(p.aoe));
          for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - p.tx, e.y - p.ty) < p.aoe + e.rad) damageEnemy(e, e === p.tg ? p.dmg : p.dmg * 0.6);
        } else if (alive) { damageEnemy(p.tg, p.dmg); fx('sfx', 'hit'); }
      } else if (alive) {
        if (p.tg === 'tower') hurtTower(p.dmg, p.src); else hurtFighter(p.tg, p.dmg);
      }
    } else { p.x += dx / d * s; p.y += dy / d * s; }
  }
  G.proj = G.proj.filter(p => !p.done);
}

// =====================================================================
//  BOUCLE DE SIMULATION
// =====================================================================
function simUpdate(dt) {
  G.time += dt;
  if (G.ctl.tower === 'ai') aiTower(dt);
  if (G.ctl.inv === 'ai') aiInv(dt);
  if (G.phase === 'prep' && G.ready.tower && G.ready.inv) launchWave();
  if (G.phase === 'wave') {
    G.waveT += dt;
    while (G.queue.length && G.queue[0].t <= G.waveT) { const q = G.queue.shift(); spawnEnemy(q.type, q.a); }
    invTick(dt);
    if (!G.queue.length && !G.enemies.some(e => !e.dead)) waveCleared();
  }
  if (G.phase === 'end') G.endT += dt;
  for (const t of G.tasks) { t.t -= dt; if (t.t <= 0 && !t.done) { t.done = true; t.fn(); } }
  G.tasks = G.tasks.filter(t => !t.done);
  updTower(dt);
  updGlues(dt);
  for (const f of G.fighters) {
    updFighter(f, dt);
    if (f.fly || f.dead) continue;
    const d = Math.hypot(f.x - TX, f.y - TY), m = TR + f.rad - 2;
    if (d < m) { const a = d > 0.01 ? Math.atan2(f.y - TY, f.x - TX) : Math.PI / 2; f.x = TX + Math.cos(a) * m; f.y = TY + Math.sin(a) * m; }
    const dh = Math.hypot(f.hx - TX, f.hy - TY);
    if (dh < m + 8) { const a = dh > 0.01 ? Math.atan2(f.hy - TY, f.hx - TX) : Math.PI / 2; f.hx = TX + Math.cos(a) * (m + 8); f.hy = TY + Math.sin(a) * (m + 8); }
  }
  for (const e of G.enemies) updEnemy(e, dt);
  const L = G.enemies;
  for (let i = 0; i < L.length; i++) {
    const a = L[i]; if (a.dead) continue;
    for (let j = i + 1; j < L.length; j++) {
      const b = L[j]; if (b.dead || a.fly !== b.fly) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = (a.rad + b.rad) * 0.85;
      if (d < m && d > 0.01) {
        const push = (m - d) / 2, nx = dx / d, ny = dy / d;
        const wa = a.boss ? 0 : 1, wb = b.boss ? 0 : 1;
        a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb;
      }
    }
    const dt_ = Math.hypot(a.x - TX, a.y - TY), mt = TR + a.rad - 2;
    if (dt_ < mt && dt_ > 0.01) { a.x = TX + (a.x - TX) / dt_ * mt; a.y = TY + (a.y - TY) / dt_ * mt; }
  }
  updArrows(dt);
  updProj(dt);
  G.enemies = G.enemies.filter(e => !e.dead || e.fade < 0.4);
  G.fighters = G.fighters.filter(f => !f.dead || f.fade < 0.8);
  if (G.bossRef && G.bossRef.dead) G.bossRef = null;
}

// =====================================================================
//  IA COÉQUIPIÈRE
// =====================================================================
const AI_ERR = 0.13;   // imprécision de l'IA archer (radians)
function aiTower(dt) {
  const A = G.ai.tower, T = G.tower, S = G.ST;
  if (G.phase === 'prep') { if (G.time > 1.2) setReady('tower'); T.charging = false; T.charge = 0; return; }
  if (G.phase === 'end') return;
  const L = liveEnemies();
  // sorts
  if (S.glue && T.glueCd <= 0) {
    let best = null, bc = 0;
    for (const a of L) {
      if (a.fly || Math.hypot(a.x - TX, a.y - TY) > 330) continue;
      let c = a.boss ? 4 : 0;
      for (const b of L) if (!b.fly && Math.hypot(a.x - b.x, (a.y - b.y) / 0.6) < S.glueR) c++;
      if (c > bc) { bc = c; best = a; }
    }
    if (best && bc >= 4) towerGlue(best.x, best.y);
  }
  if (S.rain && T.rainCd <= 0) {
    let best = null, bc = 0;
    for (const a of L) { let c = a.boss ? 5 : 0; for (const b of L) if (Math.hypot(a.x - b.x, a.y - b.y) < 120) c++; if (c > bc) { bc = c; best = a; } }
    if (best && bc >= 6) towerRain(best.x, best.y);
  }
  A.think -= dt;
  if (A.think <= 0 || !A.tgt || A.tgt.dead) {
    A.think = 0.2;
    let best = null, bs = 1e9;
    for (const e of L) {
      const h = hitPoint(e), d = Math.hypot(h.x - OX, h.y - OY);
      if (d > S.range + 30) continue;
      const s = Math.hypot(e.x - TX, e.y - TY) - (e.boss ? 120 : 0) - (e.range ? 40 : 0) - (e.D.siege ? 160 : 0) - (e.D.dive ? 90 : 0) - (e.D.heal ? 60 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    if (best !== A.tgt) A.err = rand(-1, 1) * AI_ERR;
    A.tgt = best;
  }
  A.wait = (A.wait || 0) - dt;
  const e = A.tgt;
  if (!e) { T.charging = false; T.charge = 0; return; }
  const h = hitPoint(e);
  let d = Math.hypot(h.x - OX, h.y - OY);
  // anticipation du déplacement
  const tf = d / ARROW_SPD;
  let vx = 0, vy = 0;
  if (e.moving && e.stunT <= 0) { const dd = Math.hypot(TX - e.x, TY - e.y) || 1, sp = e.spd * (e.slowT > 0 ? 1 - e.slowF : 1) * (e.glued ? 0.35 : 1); vx = (TX - e.x) / dd * sp; vy = (TY - e.y) / dd * sp; }
  const px = h.x + vx * tf, py = h.y + vy * tf;
  d = Math.hypot(px - OX, py - OY);
  T.ang = Math.atan2(py - OY, px - OX) + A.err * Math.min(1, 300 / Math.max(80, d));
  if (T.reload > 0) { T.charging = false; T.charge = 0; return; }
  if (!T.charging) { T.charging = true; T.chargeT = 0; }
  T.chargeT += dt;
  const k = S.quick ? 1 : Math.min(1, T.chargeT / S.chargeT);
  T.charge = k;
  const need = S.quick ? 0 : Math.min(1, Math.sqrt(Math.max(0, (d / S.range - 0.12) / 0.88)) + 0.05);
  if (k >= need && A.wait <= 0) { towerFire(T.ang, k); A.err = rand(-1, 1) * AI_ERR; A.wait = rand(0.1, 0.4); }
}
function cardValue(c) {
  const def = CARDS[c.id];
  return (def.b + 1) * 10 * cardMult(c, G.SI);
}
function aiInv(dt) {
  const A = G.ai.inv, I = G.inv, S = G.SI;
  A.t -= dt; if (A.t > 0) return;
  A.t = 0.7;
  if (G.phase === 'end') return;
  // 1) fusionner dès que possible
  for (let i = 0; i < I.hand.length; i++) for (let j = i + 1; j < I.hand.length; j++) {
    const a = I.hand[i], b = I.hand[j];
    if (a.id === b.id && a.lv === b.lv && a.lv < 3) { invFuse(a.uid, b.uid); return; }
  }
  const L = liveEnemies();
  const fighters = I.hand.filter(c => CARDS[c.id].type === 'fighter').sort((a, b) => cardValue(b) - cardValue(a));
  if (G.phase === 'prep') {
    if (I.charges > 0 && fighters.length && G.fighters.filter(f => !f.dead).length < 2) {
      const a = rand(0, Math.PI * 2);
      invPlay(fighters[0].uid, TX + Math.cos(a) * 150, TY + Math.sin(a) * 100);
      return;
    }
    if (G.time > 1.5) setReady('inv');
    return;
  }
  // 2) jeter si la main est pleine et l'invocation encore loin
  if (I.hand.length >= S.handMax && I.charges < 1 && I.poseCd > 4) {
    const worst = I.hand.slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
    if (S.recycle || I.hand.length > 1) { invDiscard(worst.uid); return; }
  }
  if (I.charges < 1) return;
  // 3) choisir la carte à poser
  const T = G.tower, hurt = T.hp < T.max * 0.5;
  const pressure = L.length + (G.bossRef ? 8 : 0);
  let best = null, bv = 0;
  for (const c of I.hand) {
    const def = CARDS[c.id];
    let v = cardValue(c);
    if (def.type === 'spell') {
      if (def.id === 'benediction') v *= hurt ? 1.6 : 0.2;
      else if (pressure < 5) v *= 0.15;
      else if (def.id === 'jugement' || def.id === 'faille' || def.id === 'blizzard') v *= pressure >= 10 ? 1.3 : 0.6;
    }
    if (v > bv) { bv = v; best = c; }
  }
  if (!best) return;
  // une carte de rang normal seule : on attend un peu une paire si rien ne presse
  const def = CARDS[best.id];
  if (best.lv === 0 && pressure < 3 && !hurt && I.hand.length < S.handMax) return;
  let x = TX, y = TY;
  if (def.type === 'spell') {
    if (def.target) {
      let tg = null, bc = -1;
      for (const a of L) { let c = a.boss ? 4 : 0; for (const b of L) if (Math.hypot(a.x - b.x, a.y - b.y) < def.target) c++; if (c > bc) { bc = c; tg = a; } }
      if (!tg) return;
      x = tg.x; y = tg.y;
    }
  } else {
    let sx = 0, sy = 0, n = 0;
    for (const e of L) { const d = Math.hypot(e.x - TX, e.y - TY); if (d < 650) { const w = 1 / Math.max(80, d); sx += (e.x - TX) * w; sy += (e.y - TY) * w; n += w; } }
    const a = n ? Math.atan2(sy, sx) : rand(0, Math.PI * 2);
    const r = CARDS[best.id].u.range > 60 ? 105 : 165;
    x = TX + Math.cos(a) * r * 1.2; y = TY + Math.sin(a) * r * 0.85;
  }
  invPlay(best.uid, x, y);
}
