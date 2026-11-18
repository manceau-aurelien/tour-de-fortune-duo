'use strict';
/* =====================================================================
   RÉSEAU (PeerJS) — l'hôte simule, l'invité affiche et envoie ses actions
   ===================================================================== */
const PEER_PREFIX = 'tdf-duo-v1-';
const SNAP_MS = 50;          // 20 images par seconde
const INTERP = 110;          // retard d'affichage côté invité (ms)
const PK = ['arrow', 'bolt', 'orb', 'bone'];
const NET = {
  mode: 'solo', peer: null, conn: null, open: false, code: '', evq: [], hostRole: 'tower',
  remote: null, sendAcc: 0, rtt: 0, pingT: 0, joinTimer: null,
};
const CL = { snaps: [], evq: [], fbirth: {}, last: null, R: null };

const netAvailable = () => typeof Peer !== 'undefined';
const otherRole = r => r === 'tower' ? 'inv' : 'tower';
function genCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
function netErrMsg(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'Aucune partie trouvée avec ce code.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Impossible de joindre le service de mise en relation. Vérifiez votre connexion internet.';
  if (t === 'browser-incompatible') return 'Ce navigateur ne permet pas le jeu en ligne.';
  return 'Erreur de connexion (' + (t || 'inconnue') + ').';
}
function netSend(m) { if (NET.conn && NET.open) { try { NET.conn.send(m); } catch (e) { } } }
function netClose() {
  const c = NET.conn, p = NET.peer;
  NET.conn = null; NET.peer = null; NET.open = false; NET.mode = 'solo'; NET.evq = []; NET.remote = null; NET.code = '';
  clearTimeout(NET.joinTimer);
  try { c && c.close(); } catch (e) { }
  try { p && p.destroy(); } catch (e) { }
}
function bindConn(c) {
  NET.conn = c;
  c.on('open', () => { NET.open = true; clearTimeout(NET.joinTimer); netOnOpen(); });
  c.on('data', d => { try { netOnData(d); } catch (e) { console.error(e); } });
  c.on('close', () => { if (NET.conn !== c) return; NET.open = false; NET.conn = null; netOnClose(); });
  c.on('error', () => { });
}
function netHost(hostRole, onReady, onErr) {
  netClose();
  NET.mode = 'host'; NET.hostRole = hostRole;
  let tries = 0;
  const attempt = () => {
    NET.code = genCode();
    const peer = new Peer(PEER_PREFIX + NET.code, { debug: 1 });
    NET.peer = peer;
    peer.on('open', () => onReady(NET.code));
    peer.on('connection', c => {
      if (NET.conn) { c.on('open', () => { try { c.send({ t: 'full' }); } catch (e) { } setTimeout(() => c.close(), 400); }); return; }
      bindConn(c);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries++ < 4) { try { peer.destroy(); } catch (x) { } attempt(); return; }
      if (NET.peer === peer) onErr(netErrMsg(e));
    });
    peer.on('disconnected', () => { if (NET.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (x) { } } });
  };
  attempt();
}
function netJoin(code, onErr) {
  netClose();
  NET.mode = 'guest'; NET.code = code;
  const peer = new Peer({ debug: 1 });
  NET.peer = peer;
  peer.on('open', () => {
    const c = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    bindConn(c);
    NET.joinTimer = setTimeout(() => { if (!NET.open && NET.peer === peer) { onErr('Aucune réponse de cette partie. Vérifiez le code.'); netClose(); } }, 10000);
  });
  peer.on('error', e => { if (NET.peer === peer) { onErr(netErrMsg(e)); netClose(); } });
}

// ---------- messages ----------
function netOnOpen() {
  if (NET.mode === 'guest') netSend({ t: 'hello', v: VERSION, prof: { tower: save.tower.nodes, inv: save.inv.nodes } });
  lobbyRender();
}
function netOnClose() {
  if (NET.mode === 'host') {
    NET.remote = null;
    if (G && G.phase !== 'end' && screenIs('battle')) {
      const r = otherRole(NET.hostRole);
      G.ctl[r] = 'ai';
      toast('Votre partenaire s\'est déconnecté : l\'IA prend le relais.');
    }
    lobbyRender();
  } else if (NET.mode === 'guest') {
    const inGame = screenIs('battle') && CL.last && CL.last.ph !== 'end' && !CL.ended;
    netClose();
    if (inGame) { CL.ended = true; showEndModal({ win: false, xp: CL.last.xp || 0, wave: CL.last.wv, kills: CL.last.k, lost: true }); }
    else { toast('Connexion avec l\'hôte perdue.'); if (screenIs('lobby')) goHub(); }
    refreshHub();
  }
}
function netOnData(m) {
  if (!m || !m.t) return;
  if (m.t === 'pg') { netSend({ t: 'po', ts: m.ts }); return; }
  if (m.t === 'po') { NET.rtt = performance.now() - m.ts; return; }
  if (NET.mode === 'host') hostOnData(m); else guestOnData(m);
}
function hostOnData(m) {
  const gr = otherRole(NET.hostRole);
  switch (m.t) {
    case 'hello':
      NET.remote = m.prof;
      if (m.v !== VERSION) toast('Attention : votre partenaire n\'a pas la même version du jeu.');
      netSend({ t: 'lobby', hostRole: NET.hostRole, v: VERSION });
      lobbyRender(); SFX.ready();
      if (screenIs('battle') && G && G.phase !== 'end') { G.ctl[gr] = 'remote'; }
      return;
    case 'prof': NET.remote = m.prof; lobbyRender(); return;
  }
  if (!G || !screenIs('battle') || G.ctl[gr] !== 'remote') return;
  let err = null;
  switch (m.t) {
    case 'ready': setReady(gr, !!m.v); break;
    case 'ping': fx('ping', m.x | 0, m.y | 0, roleColor(gr)); break;
    case 'aim': if (gr === 'tower') { G.tower.ang = +m.a || 0; G.tower.charge = clamp(+m.k || 0, 0, 1); G.tower.charging = !!m.c; } break;
    case 'fire': if (gr === 'tower') towerFire(+m.a || 0, +m.k || 0); break;
    case 'glue': if (gr === 'tower') err = towerGlue(+m.x, +m.y); break;
    case 'rain': if (gr === 'tower') err = towerRain(+m.x, +m.y); break;
    case 'play': if (gr === 'inv') err = invPlay(m.u, +m.x, +m.y); break;
    case 'fuse': if (gr === 'inv') err = invFuse(m.a, m.b); break;
    case 'disc': if (gr === 'inv') err = invDiscard(m.u); break;
  }
  if (err) netSend({ t: 'toast', m: err, err: 1 });
}
function guestOnData(m) {
  switch (m.t) {
    case 'full': toast('Cette partie est déjà complète.'); netClose(); lobbyRender(); return;
    case 'lobby': NET.hostRole = m.hostRole; lobbyRender(); return;
    case 'start': CL.diff = m.diff || 'normal'; clientStart(m.role); return;
    case 's': clientSnap(m); return;
    case 'toast': toast(m.m, m.err); return;
    case 'end': if (!CL.ended) { CL.ended = true; showEndModal(m); } return;
    case 'toLobby': closeModal(); goLobby(); return;
  }
}

// ---------- côté hôte : envoi des images ----------
function flagsE(e) {
  return (e.slowT > 0 ? 1 : 0) | (e.stunT > 0 ? 2 : 0) | (e.vulnT > 0 ? 4 : 0) | (e.hitT > 0 ? 8 : 0) | (e.moving ? 16 : 0) | (e.dead ? 32 : 0)
    | (e.enraged ? 64 : 0) | (e.glued ? 128 : 0) | (e.burnT > 0 ? 256 : 0) | (e.atkT > 0 ? 512 : 0);
}
function flagsF(f) { return (f.hitT > 0 ? 8 : 0) | (f.moving ? 16 : 0) | (f.dead ? 32 : 0) | (f.atkT > 0 ? 512 : 0) | (f.buffT > 0 ? 1024 : 0); }
const r2 = v => Math.round(v * 100) / 100;
function encodeSnap() {
  const T = G.tower, I = G.inv;
  return {
    t: 's', ph: G.phase, wv: G.wave, rd: [G.ready.tower ? 1 : 0, G.ready.inv ? 1 : 0], res: G.result,
    ctl: [G.ctl.tower === 'ai' ? 1 : 0, G.ctl.inv === 'ai' ? 1 : 0],
    tw: [Math.ceil(T.hp), T.max, T.hitT > 0 ? 1 : 0, r2(T.ang), r2(T.charge), r2(T.reload), Math.round(T.glueCd * 10) / 10, Math.round(T.rainCd * 10) / 10, r2(T.fall)],
    E: G.enemies.map(e => [e.uid, ENEMIES[e.type].ix, Math.round(e.x), Math.round(e.y), Math.ceil(e.hp), Math.round(e.max), flagsE(e), e.face, e.dead ? r2(e.fade) : 0]),
    F: G.fighters.map(f => [f.uid, CARDS[f.id].ix, f.lv, Math.round(f.x), Math.round(f.y), Math.ceil(f.hp), Math.round(f.max), flagsF(f), f.face, f.dead ? r2(f.fade) : 0]),
    A: G.arrows.map(a => [a.uid, Math.round(a.x), Math.round(a.y), r2(a.ang), a.fire]),
    P: G.proj.map(p => [p.uid, PK.indexOf(p.kind), Math.round(p.x), Math.round(p.y), r2(p.ang || 0)]),
    GL: G.glues.map(g => [g.uid, Math.round(g.x), Math.round(g.y), Math.round(g.r), r2(g.t), r2(g.life), g.stop, g.acid ? 1 : 0, r2(g.seed)]),
    I: [I.hand.map(c => [c.uid, CARDS[c.id].ix, c.lv, c.fz ? 1 : 0]), r2(I.drawT), r2(I.poseCd), I.charges],
    n: G.enemies.filter(e => !e.dead).length + G.queue.length, xp: Math.floor(G.xp), k: G.kills,
    b: G.bossRef ? G.bossRef.uid : 0,
    ev: NET.evq.splice(0),
  };
}
function hostNetTick(dt) {
  if (NET.mode !== 'host' || !NET.open || !G) return;
  NET.sendAcc += dt * 1000;
  if (NET.sendAcc >= SNAP_MS) { NET.sendAcc = 0; netSend(encodeSnap()); }
}
function netPingTick(dt) {
  if (!NET.open) return;
  NET.pingT -= dt;
  if (NET.pingT <= 0) { NET.pingT = 2; netSend({ t: 'pg', ts: performance.now() }); }
}

// ---------- côté invité : réception et interpolation ----------
function clientStart(role) {
  closeModal();
  CL.snaps = []; CL.evq = []; CL.fbirth = {}; CL.last = null; CL.R = null; CL.ended = false;
  startBattleScreen(role);
}
function clientSnap(s) {
  s.rt = performance.now();
  if (s.ev && s.ev.length) CL.evq.push({ at: s.rt + INTERP, ev: s.ev });
  CL.snaps.push(s);
  if (CL.snaps.length > 40) CL.snaps.shift();
  CL.last = s;
}
function clientTick() {
  const now = performance.now();
  while (CL.evq.length && CL.evq[0].at <= now) {
    for (const ev of CL.evq.shift().ev) { const f = FX[ev[0]]; if (f) { try { f(...ev.slice(1)); } catch (e) { } } }
  }
}
function clientView() {
  const S = CL.snaps;
  if (!S.length) return null;
  const rt = performance.now() - INTERP;
  let a = S[0], b = S[0];
  for (let i = S.length - 1; i >= 0; i--) if (S[i].rt <= rt) { a = S[i]; b = S[i + 1] || S[i]; break; }
  const k = b === a ? 0 : clamp((rt - a.rt) / (b.rt - a.rt), 0, 1);
  const mapA = arr => { const m = new Map(); for (const x of arr) m.set(x[0], x); return m; };
  const ea = mapA(a.E), fa = mapA(a.F), aa = mapA(a.A), pa = mapA(a.P);
  const L = (o, i, v) => o ? lerp(o[i], v, k) : v;
  const enemies = b.E.map(x => {
    const o = ea.get(x[0]), type = ENEMY_IDS[x[1]], D = ENEMIES[type], f = x[6];
    return { kind: 'e', uid: x[0], type, D, x: L(o, 2, x[2]), y: L(o, 3, x[3]), hp: x[4], max: x[5], rad: D.rad, fly: !!D.fly, boss: !!D.boss, seed: (x[0] * 7.13) % 99,
      slowT: f & 1, stunT: f & 2, vulnT: f & 4, hitT: f & 8 ? 0.1 : 0, moving: !!(f & 16), dead: !!(f & 32), fade: x[8], enraged: !!(f & 64), glued: !!(f & 128), burnT: f & 256, atkT: f & 512 ? 0.1 : 0, face: x[7] };
  });
  const fighters = b.F.map(x => {
    const o = fa.get(x[0]), id = CARD_IDS[x[1]], u = CARDS[id].u, f = x[7];
    if (CL.fbirth[x[0]] === undefined) CL.fbirth[x[0]] = V.time;
    return { kind: 'f', uid: x[0], id, lv: x[2], x: L(o, 3, x[3]), y: L(o, 4, x[4]), hp: x[5], max: x[6], rad: u.rad, fly: !!u.fly, seed: (x[0] * 3.7) % 99,
      hitT: f & 8 ? 0.1 : 0, moving: !!(f & 16), dead: !!(f & 32), fade: x[9], atkT: f & 512 ? 0.1 : 0, buffT: f & 1024 ? 1 : 0, face: x[8], heal: u.heal ? 1 : 0, bornV: CL.fbirth[x[0]] };
  });
  const arrows = b.A.map(x => { const o = aa.get(x[0]); return { x: L(o, 1, x[1]), y: L(o, 2, x[2]), ang: x[3], fire: x[4] }; });
  const proj = b.P.map(x => { const o = pa.get(x[0]); return { kind: PK[x[1]], x: L(o, 2, x[2]), y: L(o, 3, x[3]), ang: x[4] }; });
  const glues = b.GL.map(x => ({ x: x[1], y: x[2], r: x[3], t: x[4] + k * SNAP_MS / 1000, life: x[5], stop: x[6], acid: x[7], seed: x[8] }));
  const t = b.tw, ta = a.tw;
  const tower = { hp: t[0], max: t[1], hitT: t[2] ? 0.1 : 0, ang: t[3], charge: t[4], reload: t[5], reloadK: t[5], glueCd: t[6], rainCd: t[7], fall: lerp(ta[8], t[8], k) };
  const boss = b.b ? enemies.find(e => e.uid === b.b) : null;
  return {
    enemies, fighters, arrows, proj, glues, tower, phase: b.ph, wave: b.wv, result: b.res,
    ready: { tower: !!b.rd[0], inv: !!b.rd[1] }, ctl: { tower: b.ctl[0] ? 'ai' : 'x', inv: b.ctl[1] ? 'ai' : 'x' },
    xp: b.xp, kills: b.k, remaining: b.n, bossRef: boss,
    inv: { hand: b.I[0].map(c => ({ uid: c[0], id: CARD_IDS[c[1]], lv: c[2], fz: c[3] })), drawT: b.I[1], poseCd: b.I[2], charges: b.I[3] },
  };
}
