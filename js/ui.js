'use strict';
/* =====================================================================
   INTERFACE : hub, arbres, salon, combat (commandes), boucle principale
   ===================================================================== */
let MODE = 'solo';                 // partie en cours : solo | host | guest
let ROLE = save.lastRole || 'tower';
const MY = { ST: towerStats(save.tower.nodes), SI: invStats(save.inv.nodes) };
let RV = null;                     // vue du monde affichée
const LOCAL = {
  mouse: { x: TX, y: TY - 200 }, down: false, charging: false, chargeT: 0, k: 0, ang: -Math.PI / 2, reloadUntil: 0,
  mode: null, sel: null, drag: null, preview: null, pending: {}, aimSendT: 0, handSig: '', prevHand: {}, seen: new Set(), fullSnd: false,
};
const roleColor = r => r === 'tower' ? '#ffcc4d' : '#c070ff';
const ROLE_INFO = {
  tower: { ic: '🏹', n: 'la Tour', nn: 'Tour', d: "Vous tenez l'arc au sommet de la tour : visez, chargez, tirez. Plus tard : glu, flèches multiples, pluie de flèches." },
  inv: { ic: '🃏', n: "l'Invocateur", nn: 'Invocateur', d: 'Vous piochez des cartes, fusionnez les paires pour monter leur rang et posez combattants et sorts sur le terrain.' },
};

// ---------- écrans ----------
const SCREENS = ['hub', 'lobby', 'battle'];
function showScreen(id) { SCREENS.forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); hideTip(); $('#cardTip').classList.add('hidden'); }
function screenIs(id) { return !$('#' + id).classList.contains('hidden'); }
function toast(msg, err) {
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), 2700);
  if (err) SFX.err();
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function goHub() { closeModal(); showScreen('hub'); refreshHub(); requestAnimationFrame(centerTree); }
function goLobby() {
  if (NET.mode === 'solo') { goHub(); return; }
  closeModal(); showScreen('lobby'); lobbyRender();
  if (NET.mode === 'guest' && NET.open) netSend({ t: 'prof', prof: { tower: save.tower.nodes, inv: save.inv.nodes } });
}
const tip = $('#tip');
function showTip(html, x, y) { tip.innerHTML = html; tip.classList.remove('hidden'); moveTip(x, y); }
function moveTip(x, y) {
  const r = tip.getBoundingClientRect();
  let tx = x + 18, ty = y + 18;
  if (tx + r.width > innerWidth - 8) tx = x - r.width - 18;
  if (ty + r.height > innerHeight - 8) ty = y - r.height - 18;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
}
function hideTip() { tip.classList.add('hidden'); }

// =====================================================================
//  HUB
// =====================================================================
let TAB = ROLE;
function refreshHub() {
  $('#xpT').textContent = fmt(save.tower.xp); $('#xpI').textContent = fmt(save.inv.xp);
  $('#pillT').classList.toggle('on', TAB === 'tower'); $('#pillI').classList.toggle('on', TAB === 'inv');
  $('#btnSound').textContent = save.sound ? '🔊' : '🔇';
  $('#profName').textContent = curProfile().name;
  const st = save.stats;
  $('#statsLine').textContent = `Parties : ${st.runs} · Victoires : ${st.wins} · Meilleure vague : ${st.bestWave >= WAVES.length ? 'Roi-Liche vaincu' : st.bestWave + '/' + WAVES.length} · Ennemis vaincus : ${fmt(st.kills)}`;
  $('#btnLobbyBack').classList.toggle('hidden', !(NET.mode === 'host' || (NET.mode === 'guest' && NET.open)));
  if (TAB === 'tower' || TAB === 'inv') renderTree();
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === TAB));
  $('#tabTree').classList.toggle('hidden', TAB !== 'tower' && TAB !== 'inv');
  $('#tabCodex').classList.toggle('hidden', TAB !== 'codex');
  $('#tabHelp').classList.toggle('hidden', TAB !== 'help');
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  TAB = b.dataset.tab; refreshHub();
  if (TAB === 'codex') renderCodex();
  if (TAB === 'help') renderHelp();
  if (TAB === 'tower' || TAB === 'inv') centerTree();
});
$('#btnSound').onclick = () => { mutateSave(s => s.sound = !s.sound); refreshHub(); if (save.sound) SFX.card(); };
// ---------- profils et sauvegarde ----------
const escHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function profSummary(id) {
  const s = readSaveKey(profKey(id)) || defaultSave();
  return `🏹 ${countNodes(s.tower.nodes)} pts · 🃏 ${countNodes(s.inv.nodes)} pts · ${s.stats.runs} partie(s)${s.savedAt ? ' · ' + new Date(s.savedAt).toLocaleDateString('fr-FR') : ''}`;
}
function switchProfile(id) {
  if (NET.mode !== 'solo') { toast('Quittez le salon en ligne avant de changer de profil.', 1); return false; }
  ACTIVE_PROFILE = id; PROFILES.active = id; saveProfiles();
  try { sessionStorage.setItem('tfd_profile', id); } catch (e) { }
  save = loadSave(); TAB = save.lastRole || 'tower';
  refreshHub(); centerTree();
  return true;
}
function exportSave() {
  const p = curProfile();
  const data = { game: 'tour-de-fortune-duo', v: 2, profile: p.name, date: new Date().toISOString(), save: loadSave() };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = p.name.normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 30) || 'profil';
  a.href = URL.createObjectURL(blob); a.download = `tour-de-fortune-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  mutateSave(s => s.exportedAt = Date.now());
  toast('Sauvegarde exportée dans vos téléchargements.');
}
function importSave(file) {
  const r = new FileReader();
  r.onload = () => {
    let d = null; try { d = JSON.parse(r.result); } catch (e) { }
    const s = d && (d.save || d);
    if (!validSave(s)) { toast('Ce fichier n\'est pas une sauvegarde du jeu.', 1); return; }
    // l'import crée toujours un nouveau profil : il n'écrase jamais une partie existante
    const id = 'p' + Date.now().toString(36);
    let name = (d.profile || 'Profil importé') + ' (importé)';
    PROFILES.list.push({ id, name, created: Date.now() }); saveProfiles();
    writeSaveKey(profKey(id), normalizeSave(s));
    switchProfile(id); openProfiles();
    toast(`Sauvegarde importée dans le profil « ${name} ».`);
  };
  r.readAsText(file);
}
function openProfiles() {
  const rows = PROFILES.list.map(p => `<div class="prow ${p.id === ACTIVE_PROFILE ? 'on' : ''}">
      <div class="pinfo"><div class="pname">${p.id === ACTIVE_PROFILE ? '✔ ' : ''}${escHtml(p.name)}</div><div class="psum">${profSummary(p.id)}</div></div>
      <div class="pbtns">
        ${p.id === ACTIVE_PROFILE ? '<span class="pcur">Profil actuel</span>' : `<button class="btn gold" data-use="${p.id}">Jouer avec</button>`}
        <button class="iconbtn" data-ren="${p.id}" title="Renommer">✏️</button>
        ${PROFILES.list.length > 1 ? `<button class="iconbtn" data-del="${p.id}" title="Supprimer ce profil">🗑️</button>` : ''}
      </div></div>`).join('');
  const s = loadSave();
  const safe = STORAGE_SAFE === true ? '🛡️ Stockage protégé : le navigateur ne l\'effacera pas tout seul.' : 'ℹ️ Le navigateur peut effacer les données des sites lors d\'un nettoyage : exportez votre sauvegarde de temps en temps.';
  $('#modalRoot').innerHTML = `<div class="modal"><div class="mbox profBox">
    <button class="mclose" id="mClose">✕</button>
    <h2 class="tf">👤 Profils</h2>
    <div class="sub">Un profil par partenaire de jeu : chacun garde ses propres arbres et sa progression.</div>
    <div class="plist">${rows}</div>
    <div class="pnew"><input id="newProf" maxlength="24" placeholder="Nom du nouveau profil (ex. : avec Julie)"><button class="btn green" id="btnNewProf">＋ Créer</button></div>
    <h3 class="tf">💾 Sauvegarde de « ${escHtml(curProfile().name)} »</h3>
    <div class="psafe">${safe}<br>Copie de secours automatique à chaque enregistrement.${s.exportedAt ? ` Dernier export : ${new Date(s.exportedAt).toLocaleDateString('fr-FR')}.` : ' Jamais exportée.'}</div>
    <div class="mbtns"><button class="btn" id="btnExport">⬇ Exporter dans un fichier</button><button class="btn" id="btnImport">⬆ Importer un fichier</button><input type="file" id="fileImport" accept=".json,application/json" class="hidden"></div>
  </div></div>`;
  $('#mClose').onclick = () => { closeModal(); refreshHub(); };
  $$('.profBox [data-use]').forEach(b => b.onclick = () => { if (switchProfile(b.dataset.use)) { SFX.node(); openProfiles(); } });
  $$('.profBox [data-ren]').forEach(b => b.onclick = () => {
    const p = PROFILES.list.find(x => x.id === b.dataset.ren);
    const n = prompt('Nouveau nom du profil :', p.name);
    if (n && n.trim()) { p.name = n.trim().slice(0, 24); saveProfiles(); openProfiles(); refreshHub(); }
  });
  $$('.profBox [data-del]').forEach(b => b.onclick = () => {
    const p = PROFILES.list.find(x => x.id === b.dataset.del);
    const n = prompt(`Supprimer définitivement le profil « ${p.name} » et toute sa progression ?\nCette action est irréversible. Pour confirmer, tapez son nom :`);
    if (n === null) return;
    if (n.trim() !== p.name) { toast('Nom différent : profil conservé.', 1); return; }
    PROFILES.list = PROFILES.list.filter(x => x.id !== p.id); saveProfiles();
    try { localStorage.removeItem(profKey(p.id)); localStorage.removeItem(profKey(p.id) + '_bak'); } catch (e) { }
    if (p.id === ACTIVE_PROFILE) switchProfile(PROFILES.list[0].id);
    toast(`Profil « ${p.name} » supprimé.`); openProfiles();
  });
  const create = () => {
    const name = ($('#newProf').value || '').trim().slice(0, 24);
    if (!name) { toast('Donnez un nom au profil.', 1); return; }
    if (NET.mode !== 'solo') { toast('Quittez le salon en ligne avant de changer de profil.', 1); return; }
    const id = 'p' + Date.now().toString(36);
    PROFILES.list.push({ id, name, created: Date.now() }); saveProfiles();
    writeSaveKey(profKey(id), Object.assign(defaultSave(), { intro: true }));
    switchProfile(id); SFX.node(); openProfiles();
    toast(`Profil « ${name} » créé : nouvelle progression depuis zéro.`);
  };
  $('#btnNewProf').onclick = create;
  $('#newProf').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') create(); };
  $('#btnExport').onclick = exportSave;
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => { const f = e.target.files[0]; if (f) importSave(f); };
}
$('#btnProfile').onclick = () => openProfiles();

const gameDiff = () => DEV_MODE ? save.dev.diff : 'hard';
$('#btnDev').classList.toggle('hidden', !DEV_MODE);
$('#btnDev').onclick = () => { if (DEV_MODE) openDevPanel(); };
$('#pillT').onclick = () => { TAB = 'tower'; refreshHub(); centerTree(); };
$('#pillI').onclick = () => { TAB = 'inv'; refreshHub(); centerTree(); };

// ---------- panneau créateur (tests et calibrage) ----------
function spentXp(key) { let t = 0; for (const n of TREES[key].nodes) { const lv = save[key].nodes[n.id] || 0; if (n.id === 'core') continue; for (let l = 0; l < lv; l++) t += nodeCost(n, l); } return t; }
function openDevPanel() {
  const seg = (name, opts, cur) => `<div class="seg" data-k="${name}">${opts.map(([v, l, c]) => `<button class="${String(v) === String(cur) ? 'on' : ''}" data-v="${v}" ${c ? `style="--sc:${c}"` : ''}>${l}</button>`).join('')}</div>`;
  const treeBox = key => `<div class="devTree"><div class="dt">${TREES[key].ic} Arbre de ${TREES[key].n}</div>
      <div class="ds">${countNodes(save[key].nodes)} point(s) · ✦ ${fmt(save[key].xp)} XP disponibles · ✦ ${fmt(spentXp(key))} investis</div>
      <div class="db"><button class="btn" data-a="refund" data-t="${key}">↩ Rembourser l'arbre</button><button class="btn" data-a="wipe" data-t="${key}">✖ Tout remettre à zéro</button><button class="btn" data-a="give" data-t="${key}">+500 ✦</button></div></div>`;
  $('#modalRoot').innerHTML = `<div class="modal"><div class="mbox devBox">
    <button class="mclose" id="mClose">✕</button>
    <h2 class="tf">🛠️ Mode créateur</h2><div class="sub">Réglages de test pour calibrer le jeu. Ils s'appliquent aux prochaines parties.</div>
    <div class="devRow"><div class="dl">Difficulté<small>Vie et attaque des monstres</small></div>${seg('diff', Object.entries(DIFFS).map(([k, d]) => [k, `${d.n} <small>×${d.hp}</small>`, d.c]), save.dev.diff)}</div>
    <div class="devRow"><div class="dl">Gain d'expérience<small>Multiplie l'XP de fin de partie</small></div>${seg('xpMult', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10']], save.dev.xpMult)}</div>
    ${treeBox('tower')}${treeBox('inv')}
    <div class="sub" style="margin:10px 0 0;font-size:12.5px">« Rembourser » rend toute l'XP investie dans l'arbre. « Remettre à zéro » efface aussi l'XP disponible.</div>
  </div></div>`;
  $('#mClose').onclick = () => { closeModal(); refreshHub(); };
  $$('.devBox .seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
    const k = sg.dataset.k, v = k === 'xpMult' ? +b.dataset.v : b.dataset.v;
    mutateSave(s => s.dev[k] = v); SFX.card(); openDevPanel();
  }));
  $$('.devBox [data-a]').forEach(b => b.onclick = () => {
    const key = b.dataset.t, a = b.dataset.a;
    if (a === 'wipe' && !confirm(`Remettre à zéro l'arbre de ${TREES[key].n} (points et XP) ?`)) return;
    const refund = spentXp(key);
    mutateSave(s => {
      if (a === 'give') s[key].xp += 500;
      else { s[key].nodes = { core: 1 }; s[key].xp = a === 'refund' ? s[key].xp + refund : 0; }
    });
    SFX.node(); openDevPanel(); refreshHub();
    if (NET.mode === 'guest' && NET.open) netSend({ t: 'prof', prof: { tower: save.tower.nodes, inv: save.inv.nodes } });
  });
}

// ---------- arbre ----------
const TU = 96, TOX = 800, TOY = 700;
const PAN = { tower: { x: 0, y: 0, z: 1 }, inv: { x: 0, y: 0, z: 1 } };
const curTree = () => TREES[TAB === 'inv' ? 'inv' : 'tower'];
const curKey = () => TAB === 'inv' ? 'inv' : 'tower';
const nodeLv = id => save[curKey()].nodes[id] || 0;
function nodeState(n) {
  const T = curTree(), lv = nodeLv(n.id);
  if (lv >= n.max) return 'max';
  if (lv > 0) return 'owned';
  if (n.req.some(r => nodeLv(r) > 0)) return 'avail';
  if (n.req.some(r => T.map[r].req.some(rr => nodeLv(rr) > 0))) return 'mystery';
  return 'hidden';
}
function applyPan() { const p = PAN[curKey()]; $('#treeInner').style.transform = `translate(${p.x}px,${p.y}px) scale(${p.z})`; }
function centerTree() {
  if (TAB !== 'tower' && TAB !== 'inv') return;
  const w = $('#treeWrap'), p = PAN[curKey()];
  const vis = curTree().nodes.filter(n => nodeState(n) !== 'hidden');
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const n of vis) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
  const bw = (x1 - x0 + 2.4) * TU, bh = (y1 - y0 + 2.6) * TU;
  p.z = clamp(Math.min(w.clientWidth / bw, (w.clientHeight - 110) / bh), 0.45, 1.25);
  const cx = TOX + (x0 + x1) / 2 * TU, cy = TOY + (y0 + y1) / 2 * TU;
  p.x = w.clientWidth / 2 - cx * p.z;
  p.y = (w.clientHeight - 110) / 2 - cy * p.z + 10;
  applyPan();
}
function renderTree() {
  const T = curTree(), key = curKey(), xp = save[key].xp;
  $('#treeTitle').innerHTML = `${T.ic} Arbre de ${T.n} · <span style="color:#9fe3ff">✦ ${fmt(xp)} XP</span>`;
  const svg = $('#treeSvg'), box = $('#treeNodes');
  const states = {}; T.nodes.forEach(n => states[n.id] = nodeState(n));
  const vis = id => states[id] !== 'hidden';
  let s = '';
  for (const k in T.labels) {
    const [lx, ly] = T.labels[k];
    s += `<text x="${TOX + lx * TU}" y="${TOY + ly * TU}" fill="${T.br[k].c}">${T.br[k].n.toUpperCase()}</text>`;
  }
  for (const n of T.nodes) {
    if (!vis(n.id)) continue;
    for (const r of n.req) {
      if (!vis(r)) continue;
      const p = T.map[r];
      const lit = nodeLv(n.id) > 0 && nodeLv(r) > 0;
      const cls = lit ? 'lit' : (states[n.id] === 'mystery' ? 'half' : '');
      s += `<line class="${cls}" style="--bc:${T.br[n.b].c}" x1="${TOX + p.x * TU}" y1="${TOY + p.y * TU}" x2="${TOX + n.x * TU}" y2="${TOY + n.y * TU}"/>`;
    }
  }
  svg.innerHTML = s;
  let h = '';
  for (const n of T.nodes) {
    const st = states[n.id]; if (st === 'hidden') continue;
    const lv = nodeLv(n.id), c = T.br[n.b].c;
    const cost = lv < n.max ? nodeCost(n, lv) : 0;
    let cls = 'node ' + st + (n.id === 'core' ? ' core' : '');
    if (st === 'avail' || st === 'owned') cls += xp >= cost ? ' afford' : ' cant';
    if (st === 'owned') cls = cls.replace('owned', 'owned avail');
    const inner = st === 'mystery' ? '?' : n.ic;
    const lvTxt = st === 'mystery' || n.id === 'core' ? '' : (n.max > 1 ? `<span class="lv">${lv}/${n.max}</span>` : (lv ? '<span class="lv">✓</span>' : ''));
    const costTxt = (st === 'avail' || st === 'owned') ? `<span class="cost">✦ ${fmt(cost)}</span>` : '';
    h += `<div class="${cls}" data-id="${n.id}" style="left:${TOX + n.x * TU}px;top:${TOY + n.y * TU}px;--bc:${c};--bcA:${c}55">${inner}${lvTxt}${costTxt}</div>`;
  }
  box.innerHTML = h;
}
function nodeTipHtml(n) {
  const T = curTree(), st = nodeState(n), lv = nodeLv(n.id), c = T.br[n.b].c, xp = save[curKey()].xp;
  if (st === 'mystery') return `<h4>???</h4><div class="sub" style="color:${c}">${T.br[n.b].n}</div>Un savoir encore inconnu. Débloquez le nœud précédent pour le révéler.`;
  let foot = '';
  if (n.id === 'core') foot = '';
  else if (lv >= n.max) foot = `<div class="foot" style="color:${c}">✓ Niveau maximum</div>`;
  else {
    const cost = nodeCost(n, lv);
    foot = `<div class="foot">${n.max > 1 ? `Niveau ${lv} → ${lv + 1} · ` : ''}<span style="color:${xp >= cost ? '#9fe3ff' : '#ff7a6a'}">✦ ${fmt(cost)} XP</span></div>`;
  }
  let eff = '';
  if (n.max > 1 && n.e) {
    const cur = nodeEffectText(n, lv), nxt = lv < n.max ? nodeEffectText(n, lv + 1) : '';
    eff = `<div class="eff">${cur ? `<div><span>Actuel</span>${cur}</div>` : ''}${nxt ? `<div class="nx"><span>Niveau ${lv + 1}</span>${nxt}</div>` : ''}</div>`;
  }
  return `<h4>${n.ic} ${n.n}</h4><div class="sub" style="color:${c}">${T.br[n.b].n}${n.max > 1 ? ` · ${lv}/${n.max}` : ''}</div>${n.d}${n.max > 1 ? ' <i style="color:#9aa0ab">(par niveau)</i>' : ''}${eff}${foot}`;
}
function buyNode(id, el) {
  const key = curKey(), n = curTree().map[id], st = nodeState(n);
  if (st !== 'avail' && st !== 'owned') return;
  const lv = nodeLv(id); if (lv >= n.max) return;
  const cost = nodeCost(n, lv);
  if (save[key].xp < cost) { SFX.err(); if (el) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 }); return; }
  mutateSave(s => { s[key].xp -= cost; s[key].nodes[id] = lv + 1; });
  SFX.node();
  refreshHub();
  if (NET.mode === 'guest' && NET.open) netSend({ t: 'prof', prof: { tower: save.tower.nodes, inv: save.inv.nodes } });
  const ne = document.querySelector(`.node[data-id="${id}"]`);
  if (ne) { ne.classList.add('pop'); burstDom(ne, curTree().br[n.b].c); }
}
function burstDom(el, color) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const d = document.createElement('div');
    const a = Math.random() * Math.PI * 2, sp = rand(40, 110);
    d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:7px;height:7px;border-radius:50%;background:${color};pointer-events:none;z-index:40;box-shadow:0 0 8px ${color}`;
    document.body.appendChild(d);
    d.animate([{ transform: 'translate(-50%,-50%)', opacity: 1 }, { transform: `translate(${Math.cos(a) * sp - 3}px,${Math.sin(a) * sp - 3}px) scale(.3)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => d.remove();
  }
}
(() => {
  const w = $('#treeWrap');
  let drag = null, moved = 0;
  w.addEventListener('pointerdown', e => { const p = PAN[curKey()]; drag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; moved = 0; w.setPointerCapture(e.pointerId); });
  w.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved > 4) { const p = PAN[curKey()]; w.classList.add('drag'); p.x = drag.px + dx; p.y = drag.py + dy; applyPan(); hideTip(); return; }
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const nd = el && el.closest && el.closest('.node');
    if (nd) showTip(nodeTipHtml(curTree().map[nd.dataset.id]), e.clientX, e.clientY); else hideTip();
  });
  w.addEventListener('pointerup', e => {
    w.classList.remove('drag');
    if (drag && moved <= 4) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const nd = el && el.closest && el.closest('.node');
      if (nd) { buyNode(nd.dataset.id, nd); if (document.querySelector(`.node[data-id="${nd.dataset.id}"]`)) showTip(nodeTipHtml(curTree().map[nd.dataset.id]), e.clientX, e.clientY); }
    }
    drag = null;
  });
  w.addEventListener('pointerleave', hideTip);
  const zoom = (f, cx, cy) => {
    const p = PAN[curKey()], nz = clamp(p.z * f, 0.35, 1.8), k = nz / p.z;
    p.x = cx - (cx - p.x) * k; p.y = cy - (cy - p.y) * k; p.z = nz; applyPan();
  };
  w.addEventListener('wheel', e => { e.preventDefault(); const r = w.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  $('#zIn').onclick = () => zoom(1.2, w.clientWidth / 2, w.clientHeight / 2);
  $('#zOut').onclick = () => zoom(1 / 1.2, w.clientWidth / 2, w.clientHeight / 2);
  $('#zCenter').onclick = centerTree;
})();

// ---------- collection & règles ----------
function renderCodex() {
  const pool = invStats(save.inv.nodes).pool;
  const found = CARD_LIST.filter(c => save.codex[c.id]).length;
  let h = `<div class="codexHead"><h2 class="tf">Collection</h2><span class="pill">${found} / ${CARD_LIST.length} cartes découvertes</span></div>
    <div class="codexSub">Une carte est découverte quand elle arrive dans votre main d'Invocateur. Chaque carte peut monter jusqu'au rang Légendaire par fusion : deux cartes identiques de même rang donnent le rang au-dessus.</div>`;
  for (let r = 0; r < 4; r++) {
    h += `<div class="codexRow"><h3 style="color:${rarOf(r).c}">Rang de départ : ${rarOf(r).n}</h3><div class="codexGrid">`;
    for (const c of CARD_LIST.filter(c => c.b === r)) {
      const unk = !save.codex[c.id], inPool = pool.includes(c.id);
      const node = TREES.inv.nodes.find(n => n.card === c.id);
      h += `<div class="ccard ${unk ? 'unk' : ''}" style="--rc:${rarOf(r).c}">
        ${save.codex[c.id] ? `<span class="cnt">×${save.codex[c.id]}</span>` : ''}
        <div class="ic">${c.ic}</div><div class="nm">${unk ? '???' : c.n}</div>
        <div class="ty">${c.type === 'fighter' ? 'Combattant' : 'Effet'}</div>
        <div class="ds">${unk ? 'Pas encore découverte.' : c.d}</div>
        ${inPool ? '' : `<span class="lock">🔒 ${node ? node.n : 'À débloquer'}</span>`}</div>`;
    }
    h += '</div></div>';
  }
  $('#tabCodex').innerHTML = h;
}
function renderHelp() {
  $('#tabHelp').innerHTML = `<div class="help">
  <h2 class="tf">Comment jouer</h2>
  <p>Deux défenseurs, un seul objectif : protéger la tour. Le <b>niveau 1</b> compte 5 vagues et se termine par un boss, le Seigneur Démon. Le <b>niveau 2</b> enchaîne avec 5 vagues de monstres plus résistants et un second boss, le Roi-Liche. Vous jouez l'un des deux rôles. L'autre est tenu par un ami en ligne, ou par une IA.</p>
  <h3>🏹 La Tour</h3>
  <ul>
    <li><b>Maintenez le clic gauche</b> pour bander l'arc, <b>relâchez</b> pour tirer vers le curseur. Une flèche peu chargée tombe très vite : chargez pour atteindre les ennemis lointains.</li>
    <li>La flèche s'arrête sur le premier ennemi touché. La <b>perforation</b> se débloque dans l'arbre.</li>
    <li>Avec le <b>Tir instinctif</b>, un simple clic tire à pleine portée et maintenir le clic tire en continu.</li>
    <li>Plus loin : <b>Pot de glu</b> <kbd>Q</kbd> pour ralentir, puis immobiliser les monstres au sol, et <b>Pluie de flèches</b> <kbd>E</kbd>.</li>
  </ul>
  <h3>🃏 L'Invocateur</h3>
  <ul>
    <li>Vous <b>piochez une carte toutes les 10 s</b>, dans une main de <b>3 cartes</b> au départ. Quand la main est pleine, la pioche attend.</li>
    <li>Vous pouvez <b>poser une carte toutes les 15 s</b> : glissez-la sur le terrain. Un combattant apparaît où vous la lâchez ; une Boule de feu ou un Météore tombe à cet endroit ; les autres effets touchent tout le terrain.</li>
    <li><b>Fusion</b> : déposez une carte sur une carte identique de même rang pour obtenir le rang au-dessus (Normale → Rare → Épique → Légendaire). Une carte fusionnée est bien plus puissante.</li>
    <li><b>Jeter</b> : glissez une carte dans la corbeille pour libérer de la place. Le <b>Recyclage</b> de l'arbre fait alors avancer la pioche.</li>
  </ul>
  <h3>Progression</h3>
  <p>Chaque rôle a <b>son propre arbre</b> et sa propre expérience. À la fin d'une partie, gagnée ou perdue, les deux joueurs reçoivent <b>la même quantité d'XP</b>, versée dans l'arbre du rôle joué. En solo, l'IA coéquipière utilise votre arbre de l'autre rôle : jouez les deux rôles pour la rendre plus forte.</p>
  <h3>Jouer en ligne</h3>
  <p>« Créer une partie en ligne » vous donne un <b>code de 4 lettres</b>. Votre ami clique sur « Rejoindre » et tape ce code. L'hôte choisit qui joue quel rôle, puis lance la partie. Si un joueur se déconnecte, l'IA prend sa place.</p>
  <h3>Commandes</h3>
  <p><kbd>Espace</kbd> : prêt pour la vague · <kbd>Clic droit</kbd> : signaler un endroit au partenaire · <kbd>Q</kbd> / <kbd>E</kbd> : sorts de la tour · <kbd>Échap</kbd> : annuler · en solo : <kbd>P</kbd> pause, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> vitesse.</p>
  </div>`;
}

// =====================================================================
//  LANCER UNE PARTIE
// =====================================================================
$('#btnPlay').onclick = () => { actx(); openPlayModal(); };
$('#btnLobbyBack').onclick = () => goLobby();
function openPlayModal() {
  let role = save.lastRole || 'tower';
  const card = r => `<div class="roleCard ${r === role ? 'sel' : ''}" data-r="${r}" style="--sc:${roleColor(r)}">
      <div class="ic">${ROLE_INFO[r].ic}</div><div class="nm">${ROLE_INFO[r].nn}</div><div class="ds">${ROLE_INFO[r].d}</div>
      <div class="xp">Arbre : ${Object.keys(save[r].nodes).length - 1} nœud(s) · ✦ ${fmt(save[r].xp)} XP</div></div>`;
  const online = netAvailable();
  $('#modalRoot').innerHTML = `<div class="modal"><div class="mbox">
    <button class="mclose" id="mClose">✕</button>
    <h2 class="tf">⚔ Jouer</h2><div class="sub">Choisissez votre rôle</div>
    <div class="roleCards">${card('tower')}${card('inv')}</div>
    <div class="modes">
      <div class="row">
        <button class="btn gold big tf" id="pSolo">🤖 Avec une IA</button>
        <button class="btn violet big tf" id="pHost" ${online ? '' : 'disabled'}>🌐 Créer une partie en ligne</button>
      </div>
      <div class="row"><input id="pCode" maxlength="4" placeholder="CODE" autocomplete="off" ${online ? '' : 'disabled'}><button class="btn" id="pJoin" ${online ? '' : 'disabled'}>🔑 Rejoindre un ami</button></div>
      <div id="netMsg">${online ? '' : 'Le jeu en ligne nécessite une connexion internet (bibliothèque PeerJS non chargée).'}</div>
      <div class="note">En ligne, l'hôte choisit son rôle et l'autre joueur prend le second. Celui qui rejoint n'a pas besoin de choisir.</div>
    </div></div></div>`;
  document.querySelectorAll('.roleCard').forEach(el => el.onclick = () => {
    role = el.dataset.r; SFX.card();
    document.querySelectorAll('.roleCard').forEach(x => x.classList.toggle('sel', x === el));
  });
  const msg = t => { const m = $('#netMsg'); if (m) m.textContent = t; };
  $('#mClose').onclick = closeModal;
  $('#pSolo').onclick = () => { closeModal(); startSolo(role); };
  $('#pHost').onclick = () => {
    msg('Création du salon…');
    mutateSave(s => s.lastRole = role);
    netHost(role, () => { closeModal(); goLobby(); SFX.ready(); }, err => { toast(err, 1); msg(err); if (screenIs('lobby')) goHub(); });
  };
  const join = () => {
    const code = $('#pCode').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) { msg('Le code fait 4 lettres.'); SFX.err(); return; }
    closeModal();
    netJoin(code, err => { toast(err, 1); if (!screenIs('battle')) goHub(); });
    showScreen('lobby'); lobbyRender();
  };
  $('#pJoin').onclick = join;
  $('#pCode').onkeydown = e => { if (e.key === 'Enter') join(); e.stopPropagation(); };
}
function countNodes(nodes) { let n = 0; for (const k in nodes || {}) if (k !== 'core') n += nodes[k]; return n; }
function lobbyRender() {
  if (!screenIs('lobby')) { if (screenIs('hub')) refreshHub(); return; }
  const host = NET.mode === 'host', open = NET.open;
  const myRole = host ? NET.hostRole : otherRole(NET.hostRole);
  $('#lobbyStatus').textContent = NET.mode === 'solo' ? 'Salon fermé.'
    : host ? (open ? 'Votre partenaire est là ! Choisissez les rôles, puis lancez la partie.' : 'En attente d\'un second joueur… Donnez-lui ce code.')
    : (open ? 'Connecté ! L\'hôte va lancer la partie.' : `Connexion à la partie ${NET.code}…`);
  $('#lobbyCodeTxt').textContent = NET.code || '····';
  $('#btnCopy').classList.toggle('hidden', !host || !NET.code);
  let h = '';
  for (const r of ['tower', 'inv']) {
    const mine = r === myRole;
    let who, lvl = '';
    if (mine) { who = '<span class="who">Vous</span>'; lvl = `${countNodes(save[r].nodes)} point(s) dans l'arbre`; }
    else if (open) { who = '<span class="who">Votre partenaire</span>'; const rp = host ? NET.remote && NET.remote[r] : null; lvl = host ? (rp ? `${countNodes(rp)} point(s) dans l'arbre` : '') : ''; }
    else who = '<span class="who wait">en attente…</span>';
    h += `<div class="slot" style="--sc:${roleColor(r)}"><div class="ic">${ROLE_INFO[r].ic}</div><div class="nm">${ROLE_INFO[r].nn}</div>${who}<div class="lvl">${lvl}</div></div>`;
  }
  $('#slots').innerHTML = h;
  $('#btnSwap').classList.toggle('hidden', !host);
  $('#btnLobbyStart').classList.toggle('hidden', !host);
  $('#btnLobbyStart').disabled = !open;
}
$('#btnCopy').onclick = () => { try { navigator.clipboard.writeText(NET.code); toast('Code copié : ' + NET.code); } catch (e) { } };
$('#btnSwap').onclick = () => { NET.hostRole = otherRole(NET.hostRole); netSend({ t: 'lobby', hostRole: NET.hostRole, v: VERSION }); SFX.card(); lobbyRender(); };
$('#btnLobbyQuit').onclick = () => { netSend({ t: 'bye' }); netClose(); goHub(); };
$('#btnLobbyTree').onclick = () => { TAB = NET.mode === 'host' ? NET.hostRole : otherRole(NET.hostRole); goHub(); };
$('#btnLobbyStart').onclick = () => hostStartGame();

function startSolo(role) {
  mutateSave(s => s.lastRole = role);
  newGame({ ST: towerStats(save.tower.nodes), SI: invStats(save.inv.nodes), ctl: { [role]: 'local', [otherRole(role)]: 'ai' }, diff: gameDiff() });
  startBattleScreen(role);
}
function hostStartGame() {
  if (NET.mode !== 'host' || !NET.open) return;
  const hr = NET.hostRole, gr = otherRole(hr);
  const nodesFor = r => r === hr ? save[r].nodes : (NET.remote && NET.remote[r]) || { core: 1 };
  newGame({ ST: towerStats(nodesFor('tower')), SI: invStats(nodesFor('inv')), ctl: { [hr]: 'local', [gr]: 'remote' }, diff: gameDiff() });
  NET.evq = []; NET.sendAcc = 999;
  netSend({ t: 'start', role: gr, diff: gameDiff() });
  startBattleScreen(hr);
}
function startBattleScreen(role) {
  ROLE = role;
  MODE = NET.mode === 'guest' ? 'guest' : NET.mode === 'host' ? 'host' : 'solo';
  if (MODE === 'guest') G = null;
  mutateSave(s => s.lastRole = role);
  MY.ST = MODE === 'guest' ? towerStats(save.tower.nodes) : G.ST;
  MY.SI = MODE === 'guest' ? invStats(save.inv.nodes) : G.SI;
  Object.assign(LOCAL, { down: false, charging: false, chargeT: 0, k: 0, reloadUntil: 0, mode: null, sel: null, drag: null, preview: null, pending: {}, handSig: '', prevHand: {}, seen: new Set(), hint: '' });
  resetVisuals();
  if (!ground) makeGround();
  for (const k in hudCache) delete hudCache[k];
  closeModal();
  showScreen('battle'); resize();
  $('#towerUI').classList.toggle('hidden', role !== 'tower');
  $('#invUI').classList.toggle('hidden', role !== 'inv');
  $('#spdSolo').classList.toggle('hidden', MODE !== 'solo');
  $('#netInfo').classList.toggle('hidden', MODE === 'solo');
  $('#pauseOv').classList.add('hidden');
  $('#bossBox').classList.add('hidden');
  $('#hand').innerHTML = '';
  if (MODE === 'solo') setSpeed(1);
  const dk = MODE === 'guest' ? CL.diff : G.diffKey, DF = DIFFS[dk] || DIFFS.normal;
  LOCAL.diffName = DF.n; $('#diffLbl').style.color = DF.c;
  lastSim = performance.now();
  banner('Défendez la tour !', role === 'tower' ? '🏹 Vous tenez l\'arc de la tour' : '🃏 Vous êtes l\'Invocateur', roleColor(role));
}

// =====================================================================
//  ACTIONS DU JOUEUR LOCAL (directes en solo/hôte, envoyées en invité)
// =====================================================================
const guest = () => MODE === 'guest';
function reloadReady() { return guest() ? performance.now() >= LOCAL.reloadUntil : G.tower.reload <= 0; }
function doFire(ang, k) {
  if (guest()) { netSend({ t: 'fire', a: r2(ang), k: r2(k) }); LOCAL.reloadUntil = performance.now() + MY.ST.reload * 1000; SFX.bow(); }
  else towerFire(ang, k);
}
function doGlue(x, y) { if (guest()) netSend({ t: 'glue', x: Math.round(x), y: Math.round(y) }); else { const e = towerGlue(x, y); if (e) toast(e, 1); } }
function doRain(x, y) { if (guest()) netSend({ t: 'rain', x: Math.round(x), y: Math.round(y) }); else { const e = towerRain(x, y); if (e) toast(e, 1); } }
function doPlay(uid, x, y) {
  if (guest()) {
    if (RV && RV.inv.charges < 1) { toast(`Invocation possible dans ${Math.ceil(RV.inv.poseCd)} s`, 1); return; }
    netSend({ t: 'play', u: uid, x: Math.round(x), y: Math.round(y) }); LOCAL.pending[uid] = performance.now(); SFX.card();
  } else { const e = invPlay(uid, x, y); if (e) toast(e, 1); else SFX.card(); }
  LOCAL.handSig = '';
}
function doFuse(target, dragged) {
  if (guest()) { netSend({ t: 'fuse', a: target, b: dragged }); LOCAL.pending[dragged] = performance.now(); }
  else { const e = invFuse(target, dragged); if (e) toast(e, 1); }
  LOCAL.fusedUid = target; LOCAL.handSig = '';
}
function doDiscard(uid) {
  if (guest()) { netSend({ t: 'disc', u: uid }); LOCAL.pending[uid] = performance.now(); SFX.trash(); }
  else { const e = invDiscard(uid); if (e) toast(e, 1); }
  LOCAL.handSig = '';
}
function doReady() {
  if (!RV || RV.phase !== 'prep') return;
  const cur = RV.ready[ROLE];
  if (guest()) { netSend({ t: 'ready', v: !cur }); if (!cur) SFX.ready(); }
  else setReady(ROLE, !cur);
}
function doPing(x, y) { if (guest()) netSend({ t: 'ping', x: Math.round(x), y: Math.round(y) }); else fx('ping', Math.round(x), Math.round(y), roleColor(ROLE)); }
function armSkill(kind) {
  if (ROLE !== 'tower' || !RV || RV.phase === 'end') return;
  const S = MY.ST, T = RV.tower;
  if (kind === 'glue') { if (!S.glue) return toast('Le Pot de glu se débloque dans l\'arbre de la Tour (Alchimie).', 1); if (T.glueCd > 0) return toast(`Glu prête dans ${Math.ceil(T.glueCd)} s`, 1); }
  if (kind === 'rain') { if (!S.rain) return toast('La Pluie de flèches se débloque dans l\'arbre de la Tour (Alchimie).', 1); if (T.rainCd > 0) return toast(`Pluie prête dans ${Math.ceil(T.rainCd)} s`, 1); }
  LOCAL.mode = LOCAL.mode === kind ? null : kind;
  LOCAL.charging = false; LOCAL.chargeT = 0;
  SFX.card();
}
$('#skGlue').onclick = () => armSkill('glue');
$('#skRain').onclick = () => armSkill('rain');
$('#btnReady').onclick = () => { actx(); doReady(); };

// ---------- souris sur le terrain ----------
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointermove', e => {
  LOCAL.mouse = toWorld(e);
  if (ROLE === 'inv' && LOCAL.sel != null && !LOCAL.drag) {
    const c = cardByUid(LOCAL.sel);
    LOCAL.preview = c ? { id: c.id, lv: c.lv, x: LOCAL.mouse.x, y: LOCAL.mouse.y } : null;
  }
});
cv.addEventListener('pointerleave', () => { if (!LOCAL.drag) LOCAL.preview = null; });
cv.addEventListener('pointerdown', e => {
  actx();
  if (!RV || RV.phase === 'end' || (MODE === 'solo' && G.paused)) return;
  const w = toWorld(e); LOCAL.mouse = w;
  if (e.button === 2) { doPing(w.x, w.y); return; }
  if (e.button !== 0) return;
  if (ROLE === 'tower') {
    if (LOCAL.mode === 'glue') { doGlue(w.x, w.y); LOCAL.mode = null; return; }
    if (LOCAL.mode === 'rain') { doRain(w.x, w.y); LOCAL.mode = null; return; }
    LOCAL.down = true;
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    if (!MY.ST.quick) { LOCAL.charging = true; LOCAL.chargeT = 0; LOCAL.fullSnd = false; SFX.creak(); }
  } else if (LOCAL.sel != null) {
    doPlay(LOCAL.sel, w.x, w.y); LOCAL.sel = null; LOCAL.preview = null;
  }
});
function releaseBow() {
  if (!LOCAL.down) return;
  LOCAL.down = false;
  if (LOCAL.charging) {
    if (LOCAL.chargeT > 0 && RV && RV.phase !== 'end') doFire(LOCAL.ang, LOCAL.k);
    LOCAL.charging = false; LOCAL.chargeT = 0; LOCAL.k = 0;
  }
}

// ---------- main de l'Invocateur ----------
const cardByUid = uid => RV && RV.inv.hand.find(c => c.uid === uid);
function cardTipHtml(card) {
  const d = CARDS[card.id], S = MY.SI, rc = rarOf(card.lv).c, m = cardMult(card, S), up = card.lv - d.b;
  let st = '';
  if (d.type === 'fighter') {
    const u = d.u;
    st = `❤️ ${Math.round(u.hp * m * (1 + S.fHp))} PV · ⚔️ ${Math.round(u.dmg * m * (1 + S.fDmg))} dégâts · ${u.range > 60 ? '🏹 distance' : '🗡️ mêlée'}`;
  } else {
    const p = (1 + S.sDmg) * m, sp = d.sp;
    if (d.id === 'eclair' || d.id === 'orage') { const mul = d.id === 'eclair' ? 1 : 3; st = `${sp.strikes + S.bolt * mul + up * mul} éclairs de ${Math.round(sp.dmg * p)} dégâts`; }
    else if (d.id === 'benediction') st = `Soigne ${Math.round(Math.min(1, sp.heal * (1 + 0.5 * up)) * 100)} % de la tour`;
    else if (d.id === 'faille' || d.id === 'blizzard') st = `${(sp.dur * (1 + S.freeze) * (1 + 0.25 * up)).toFixed(1)} s${sp.dmg ? ` · ${Math.round(sp.dmg * p)} dégâts` : ''}`;
    else if (sp.dmg) st = `${Math.round(sp.dmg * p)} dégâts${d.target ? ' dans la zone' : ' à chaque ennemi'}`;
  }
  $('#cardTip').style.setProperty('--rc', rc);
  return `<h4>${d.ic} ${d.n}</h4><div class="sub">${d.type === 'fighter' ? 'Combattant' : 'Effet'} · ${rarOf(card.lv).n}${up > 0 ? ' ' + '★'.repeat(up) : ''}${card.fz && S.fuseBonus ? ' · fusion parfaite' : ''}</div>${d.d}
    ${st ? `<div class="st">${st}</div>` : ''}
    <div class="act">Glisser sur le terrain : poser · sur une carte identique : fusionner${card.lv >= 3 ? ' (rang max)' : ''}</div>`;
}
function renderHand(R) {
  const now = performance.now();
  for (const k in LOCAL.pending) if (now - LOCAL.pending[k] > 1200) delete LOCAL.pending[k];
  const hand = R.inv.hand.filter(c => !LOCAL.pending[c.uid]);
  const sig = hand.map(c => c.uid + ':' + c.lv).join(',') + '|' + LOCAL.sel + '|' + (LOCAL.drag && LOCAL.drag.moved ? LOCAL.drag.uid : '');
  if (sig === LOCAL.handSig) return;
  LOCAL.handSig = sig;
  const prev = LOCAL.prevHand, next = {};
  const count = {};
  for (const c of hand) { const k = c.id + c.lv; count[k] = (count[k] || 0) + 1; }
  let h = '';
  for (const c of hand) {
    const d = CARDS[c.id], up = c.lv - d.b;
    const isNew = prev[c.uid] === undefined, fusedNow = prev[c.uid] !== undefined && prev[c.uid] < c.lv;
    next[c.uid] = c.lv;
    const cls = ['hcard', 'r' + c.lv, LOCAL.sel === c.uid ? 'sel' : '', isNew ? 'newc' : '', fusedNow ? 'fused' : '', LOCAL.drag && LOCAL.drag.moved && LOCAL.drag.uid === c.uid ? 'dragging' : ''].join(' ');
    h += `<div class="${cls}" data-u="${c.uid}" style="--rc:${rarOf(c.lv).c}">
      <span class="ty ${d.type === 'fighter' ? 'f' : 's'}">${d.type === 'fighter' ? '⚔' : '✦'}</span>
      ${count[c.id + c.lv] >= 2 && c.lv < 3 ? '<span class="pair">⇄ fusion</span>' : ''}
      <div class="ic">${d.ic}</div><div class="nm">${d.n}</div><div class="rk">${rarOf(c.lv).n}${up > 0 ? ' ' + '★'.repeat(up) : ''}</div></div>`;
    if (!LOCAL.seen.has(c.uid)) { LOCAL.seen.add(c.uid); mutateSave(s => s.codex[c.id] = (s.codex[c.id] || 0) + 1); }
  }
  LOCAL.prevHand = next;
  $('#hand').innerHTML = h || '<span class="empty">Votre main est vide : la prochaine carte arrive…</span>';
  if (LOCAL.drag && LOCAL.drag.moved) { const el = $(`#hand .hcard[data-u="${LOCAL.drag.uid}"]`); if (el) LOCAL.drag.el = el; }
}
$('#hand').addEventListener('pointerover', e => {
  const el = e.target.closest('.hcard'); if (!el || LOCAL.drag) return;
  const c = cardByUid(+el.dataset.u); if (!c) return;
  const ct = $('#cardTip'); ct.innerHTML = cardTipHtml(c); ct.classList.remove('hidden');
  const r = el.getBoundingClientRect(), tr = ct.getBoundingClientRect();
  ct.style.left = clamp(r.left + r.width / 2 - tr.width / 2, 8, innerWidth - tr.width - 8) + 'px';
  ct.style.top = (r.top - tr.height - 14) + 'px';
});
$('#hand').addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.hcard')) $('#cardTip').classList.add('hidden'); });
$('#hand').addEventListener('pointerdown', e => {
  const el = e.target.closest('.hcard'); if (!el || !RV || RV.phase === 'end') return;
  e.preventDefault(); actx();
  LOCAL.drag = { uid: +el.dataset.u, el, sx: e.clientX, sy: e.clientY, moved: false, ghost: null, over: null };
});
function clearDropMarks() { $$('.hcard.fuseOk,.hcard.fuseBad').forEach(x => x.classList.remove('fuseOk', 'fuseBad')); $('#trash').classList.remove('over'); }
addEventListener('pointermove', e => {
  const d = LOCAL.drag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) {
    d.moved = true; LOCAL.sel = null;
    d.ghost = d.el.cloneNode(true); d.ghost.classList.remove('sel', 'newc', 'fused'); d.ghost.classList.add('ghost');
    document.body.appendChild(d.ghost); d.el.classList.add('dragging');
    $('#cardTip').classList.add('hidden');
  }
  if (!d.moved) return;
  d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
  clearDropMarks(); d.over = null; LOCAL.preview = null;
  const t = document.elementFromPoint(e.clientX, e.clientY), card = cardByUid(d.uid);
  const hc = t && t.closest && t.closest('.hcard');
  if (hc && +hc.dataset.u !== d.uid) {
    const o = cardByUid(+hc.dataset.u), ok = !!(o && card && o.id === card.id && o.lv === card.lv && o.lv < 3);
    hc.classList.add(ok ? 'fuseOk' : 'fuseBad'); d.over = { kind: 'fuse', uid: +hc.dataset.u, ok };
  } else if (t && t.closest && t.closest('#trash')) { $('#trash').classList.add('over'); d.over = { kind: 'trash' }; }
  else if (t === cv) {
    const w = toWorld(e); LOCAL.mouse = w; d.over = { kind: 'field', x: w.x, y: w.y };
    if (card) LOCAL.preview = { id: card.id, lv: card.lv, x: w.x, y: w.y };
  }
  d.ghost.style.opacity = d.over && d.over.kind === 'field' ? 0.3 : 0.92;
});
addEventListener('pointerup', e => {
  releaseBow();
  const d = LOCAL.drag; if (!d) return;
  LOCAL.drag = null; LOCAL.preview = null; clearDropMarks();
  if (d.ghost) d.ghost.remove();
  d.el.classList.remove('dragging');
  LOCAL.handSig = '';
  if (!d.moved) { LOCAL.sel = LOCAL.sel === d.uid ? null : d.uid; SFX.card(); return; }
  if (!d.over || !RV || RV.phase === 'end') return;
  if (d.over.kind === 'fuse') { if (d.over.ok) doFuse(d.over.uid, d.uid); else toast('Il faut deux cartes identiques de même rang', 1); }
  else if (d.over.kind === 'trash') doDiscard(d.uid);
  else if (d.over.kind === 'field') doPlay(d.uid, d.over.x, d.over.y);
});
addEventListener('blur', () => { releaseBow(); });

// ---------- clavier ----------
addEventListener('keydown', e => {
  if (!screenIs('battle') || e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); doReady(); }
  else if (e.key === 'q' || e.key === 'Q' || e.key === 'a' || e.key === 'A') armSkill('glue');
  else if (e.key === 'e' || e.key === 'E') armSkill('rain');
  else if (e.key === 'Escape') { if (LOCAL.mode || LOCAL.sel != null) { LOCAL.mode = null; LOCAL.sel = null; LOCAL.preview = null; LOCAL.handSig = ''; } else togglePause(); }
  else if (e.key === 'p' || e.key === 'P') togglePause();
  else if (['1', '2', '3'].includes(e.key)) setSpeed(+e.key);
});
function setSpeed(s) { if (MODE !== 'solo' || !G) return; G.speed = s; document.querySelectorAll('#spdSolo button[data-spd]').forEach(b => b.classList.toggle('on', +b.dataset.spd === s)); }
function togglePause() { if (MODE !== 'solo' || !G || G.phase === 'end') return; G.paused = !G.paused; $('#pauseOv').classList.toggle('hidden', !G.paused); }
document.querySelectorAll('#spdSolo button[data-spd]').forEach(b => b.onclick = () => setSpeed(+b.dataset.spd));
$('#btnPause').onclick = togglePause;
$('#btnQuit').onclick = () => {
  if (!RV || RV.phase === 'end') return;
  if (guest()) {
    if (!confirm('Quitter la partie ? L\'IA prendra votre place et vous gardez l\'expérience déjà gagnée.')) return;
    const last = CL.last; netSend({ t: 'bye' }); netClose(); CL.ended = true;
    showEndModal({ win: false, xp: last ? last.xp : 0, wave: last ? last.wv : 0, kills: last ? last.k : 0, lost: true, quit: true });
    return;
  }
  if (confirm(MODE === 'host' ? 'Abandonner la partie pour vous deux ? Vous gardez l\'expérience déjà gagnée.' : 'Abandonner la partie ? Vous gardez l\'expérience déjà gagnée.')) {
    G.paused = false; $('#pauseOv').classList.add('hidden'); endRun(false);
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && MODE === 'solo' && G && screenIs('battle') && G.phase !== 'end' && !G.paused) togglePause();
});

// ---------- dessins locaux sur le terrain ----------
function drawLocalUnder(c, R) {
  if (ROLE === 'tower' && LOCAL.mode && R.phase !== 'end') {
    const m = LOCAL.mouse, r = LOCAL.mode === 'glue' ? MY.ST.glueR : 130;
    const col = LOCAL.mode === 'glue' ? '240,207,85' : '255,233,176';
    c.fillStyle = `rgba(${col},0.16)`; c.strokeStyle = `rgba(${col},0.9)`; c.lineWidth = 2.5; c.setLineDash([10, 8]);
    c.beginPath(); c.ellipse(m.x, m.y, r, r * (LOCAL.mode === 'glue' ? 0.58 : 0.6), 0, 0, 7); c.fill(); c.stroke(); c.setLineDash([]);
    drawEmo(c, LOCAL.mode === 'glue' ? '🍯' : '🌧️', m.x, m.y - 10, 22);
  }
  if (ROLE === 'inv' && LOCAL.preview && R.phase !== 'end') {
    const p = LOCAL.preview, def = CARDS[p.id], ready = R.inv.charges > 0;
    const col = ready ? rarOf(p.lv).c : '#ff5b4a';
    c.save();
    if (def.type === 'fighter') {
      const u = def.u;
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.setLineDash([6, 10]); c.lineWidth = 2;
      c.beginPath(); c.ellipse(p.x, p.y, 330, 330 * 0.6, 0, 0, 7); c.stroke(); c.setLineDash([]);
      c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x, p.y, u.rad * 1.5, u.rad * 0.75, 0, 0, 7); c.stroke();
      c.globalAlpha = 0.55; drawEmo(c, def.ic, p.x, p.y - u.rad * 0.9 - (u.fly ? 28 : 0), u.rad * 3.1); c.globalAlpha = 1;
    } else if (def.target) {
      const r = def.target * (1 + MY.SI.area);
      c.fillStyle = ready ? 'rgba(255,140,60,0.15)' : 'rgba(255,60,60,0.12)'; c.strokeStyle = col; c.lineWidth = 2.5; c.setLineDash([10, 8]);
      c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.55, 0, 0, 7); c.fill(); c.stroke(); c.setLineDash([]);
      drawEmo(c, def.ic, p.x, p.y - 8, 24);
    } else {
      drawEmo(c, def.ic, p.x, p.y - 10, 26);
      c.font = '800 14px Inter,sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)';
      c.strokeText('Effet sur tout le terrain', p.x, p.y + 26); c.fillStyle = '#fff'; c.fillText('Effet sur tout le terrain', p.x, p.y + 26);
    }
    if (!ready) {
      const t = `Invocation dans ${Math.ceil(R.inv.poseCd)} s`;
      c.font = '800 15px Inter,sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)';
      c.strokeText(t, p.x, p.y + 48); c.fillStyle = '#ff8a7e'; c.fillText(t, p.x, p.y + 48);
    }
    c.restore();
  }
}
function drawLocalOver(c, R) {
  if (ROLE !== 'tower' || LOCAL.mode || R.phase === 'end') return;
  const S = MY.ST, a = LOCAL.ang, k = S.quick ? 1 : LOCAL.k;
  const cosA = Math.cos(a), sinA = Math.sin(a), x0 = OX + cosA * 30, y0 = OY + sinA * 30;
  const cur = S.range * (S.quick ? 1 : 0.12 + 0.88 * k * k);
  c.save(); c.lineCap = 'round';
  c.setLineDash([5, 11]); c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(OX + cosA * S.range, OY + sinA * S.range); c.stroke();
  if (LOCAL.charging || S.quick) {
    const full = k >= 1;
    c.setLineDash([12, 8]); c.strokeStyle = full ? 'rgba(255,210,90,0.9)' : 'rgba(255,255,255,0.65)'; c.lineWidth = full ? 3 : 2.4;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(OX + cosA * cur, OY + sinA * cur); c.stroke();
    c.setLineDash([]);
    const ex = OX + cosA * cur, ey = OY + sinA * cur;
    c.strokeStyle = full ? '#ffd25a' : '#fff'; c.lineWidth = 2;
    c.beginPath(); c.arc(ex, ey, 8, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(ex - 12, ey); c.lineTo(ex - 5, ey); c.moveTo(ex + 5, ey); c.lineTo(ex + 12, ey); c.moveTo(ex, ey - 12); c.lineTo(ex, ey - 5); c.moveTo(ex, ey + 5); c.lineTo(ex, ey + 12); c.stroke();
    if (LOCAL.charging) {
      c.strokeStyle = full ? 'rgba(255,210,90,0.25)' : 'rgba(255,255,255,0.12)'; c.lineWidth = 2; c.setLineDash([4, 10]);
      c.beginPath(); c.arc(OX, OY, cur, 0, 7); c.stroke(); c.setLineDash([]);
    }
  }
  c.restore();
}

// =====================================================================
//  HUD
// =====================================================================
const hudCache = {};
function setTxt(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).textContent = v; } }
function setHtml(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).innerHTML = v; } }
function setW(sel, pct) { const v = Math.round(clamp(pct, 0, 100) * 10) / 10 + '%'; if (hudCache[sel + 'w'] !== v) { hudCache[sel + 'w'] = v; $(sel).style.width = v; } }
function updateHud(R) {
  const T = R.tower;
  const remaining = guest() ? R.remaining : R.enemies.filter(e => !e.dead).length + R.queue.length;
  const shownW = R.phase === 'prep' ? R.wave + 1 : Math.max(1, R.wave), wDef = WAVES[Math.min(WAVES.length, shownW) - 1];
  setTxt('#waveLbl', wDef && wDef.boss ? `☠ ${ENEMIES[wDef.boss].n}` : `Vague ${shownW}/${WAVES.length}`);
  setTxt('#diffLbl', `Niveau ${levelOf(Math.min(WAVES.length, shownW))} · ${LOCAL.diffName || ''}`);
  setTxt('#enemyLbl', R.phase === 'wave' ? `${remaining} ennemis restants` : R.phase === 'end' ? 'Partie terminée' : 'Préparation');
  setTxt('#towerTxt', `${Math.ceil(T.hp)} / ${T.max}`);
  setW('#towerFill', T.hp / T.max * 100); $('#towerFill').classList.toggle('low', T.hp / T.max < 0.35);
  setTxt('#runXp', fmt(R.xp));
  const boss = R.bossRef;
  if (boss && !boss.dead) { $('#bossBox').classList.remove('hidden'); setW('#bossFill', boss.hp / boss.max * 100); setTxt('#bossName', `${ENEMIES[boss.type].ic} ${ENEMIES[boss.type].n}`); }
  else $('#bossBox').classList.add('hidden');
  // partenaire
  const pr = otherRole(ROLE), isAI = R.ctl[pr] === 'ai';
  let ps = '';
  if (pr === 'inv') {
    const hd = R.inv.hand;
    ps = `<div class="ps">${hd.length} carte(s) en main · ${R.inv.charges > 0 ? `invocation prête${R.inv.charges > 1 ? ' ×' + R.inv.charges : ''}` : `invocation dans ${Math.ceil(R.inv.poseCd)} s`}</div>
      <div class="mh">${hd.map(c => `<span style="--rc:${rarOf(c.lv).c}">${CARDS[c.id].ic}</span>`).join('')}</div>`;
  } else {
    ps = `<div class="ps">${T.charge > 0 ? 'bande son arc…' : 'vise les ennemis'}${T.glueCd > 0 ? ` · 🍯 ${Math.ceil(T.glueCd)} s` : ''}${T.rainCd > 0 ? ` · 🌧️ ${Math.ceil(T.rainCd)} s` : ''}</div>`;
  }
  setHtml('#partnerBox', `<div class="pn" style="color:${roleColor(pr)}">${isAI ? '🤖 IA' : '👤 Partenaire'} · ${ROLE_INFO[pr].ic} ${ROLE_INFO[pr].nn}</div>${ps}`);
  // bouton prêt
  const prep = R.phase === 'prep';
  $('#readyRow').classList.toggle('hidden', !prep);
  if (prep) {
    const me = R.ready[ROLE], other = R.ready[pr];
    setTxt('#btnReady', me ? '✓ Prêt — en attente' : WAVES[R.wave] && WAVES[R.wave].boss ? '☠ Prêt pour le boss' : `▶ Prêt pour la vague ${R.wave + 1}`);
    $('#btnReady').classList.toggle('wait', !!me);
    setTxt('#partnerReady', other ? `${ROLE_INFO[pr].ic} partenaire prêt ✓` : `${ROLE_INFO[pr].ic} partenaire pas encore prêt`);
    $('#partnerReady').classList.toggle('ok', !!other);
  }
  // tour
  if (ROLE === 'tower') {
    const S = MY.ST;
    const rl = guest() ? Math.max(0, (LOCAL.reloadUntil - performance.now()) / 1000) : T.reload;
    let fill;
    if (LOCAL.charging) fill = LOCAL.k * 100;
    else fill = (1 - rl / S.reload) * 100;
    setW('#bowFill', fill);
    setTxt('#bowMode', S.quick ? 'tir instinctif' : LOCAL.charging ? (LOCAL.k >= 1 ? 'pleine puissance !' : 'charge…') : 'maintenir pour charger');
    skillUi('#skGlue', S.glue, T.glueCd, S.glueCd, LOCAL.mode === 'glue');
    skillUi('#skRain', S.rain, T.rainCd, S.rainCd, LOCAL.mode === 'rain');
  }
  // invocateur
  if (ROLE === 'inv') {
    renderHand(R);
    const S = MY.SI, I = R.inv, full = I.hand.length >= S.handMax;
    setW('#drawFill', full ? 100 : I.drawT / S.drawInt * 100);
    setTxt('#drawTxt', full ? `main pleine ${I.hand.length}/${S.handMax}` : R.phase === 'wave' ? `${Math.ceil(S.drawInt - I.drawT)} s · ${I.hand.length}/${S.handMax}` : `${I.hand.length}/${S.handMax}`);
    const ch = I.charges || 0, mx = S.charges;
    setW('#poseFill', ch >= mx ? 100 : (1 - I.poseCd / S.poseCd) * 100);
    $('#poseFill').classList.toggle('full', ch > 0);
    setTxt('#poseTxt', mx > 1 ? `${'◆'.repeat(ch)}${'◇'.repeat(Math.max(0, mx - ch))}${ch < mx ? ' ' + Math.ceil(I.poseCd) + ' s' : ''}` : ch > 0 ? 'prête !' : `${Math.ceil(I.poseCd)} s`);
  }
  if (MODE !== 'solo') setTxt('#netInfo', NET.open ? `📶 ${Math.round(NET.rtt)} ms · partie ${NET.code}` : MODE === 'host' ? '⚠ partenaire déconnecté (IA)' : '⚠ connexion perdue');
  // astuces
  let hint = '';
  if (R.phase !== 'end' && save.stats.runs < 4) {
    if (ROLE === 'tower') {
      if (LOCAL.mode) hint = LOCAL.mode === 'glue' ? 'Cliquez sur le terrain pour lancer la glu (Échap pour annuler)' : 'Cliquez sur la zone à couvrir de flèches';
      else if (R.phase === 'prep' && R.wave === 0) hint = MY.ST.quick ? 'Cliquez pour tirer, maintenez pour tirer en continu. Clic droit : signaler un endroit.' : '🏹 Maintenez le clic gauche pour bander l\'arc, relâchez pour tirer. Plus la flèche est chargée, plus elle va loin.';
      else if (R.phase === 'prep') hint = 'Appuyez sur Espace quand vous êtes prêt.';
    } else {
      const I = R.inv, cnt = {};
      let pair = false; for (const c of I.hand) { const k = c.id + c.lv; cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] >= 2 && c.lv < 3) pair = true; }
      if (pair) hint = '⇄ Deux cartes identiques ! Glissez l\'une sur l\'autre pour les fusionner en une carte plus forte.';
      else if (I.hand.length >= MY.SI.handMax && R.phase === 'wave') hint = 'Main pleine : la pioche attend. Posez une carte ou jetez-en une dans la corbeille.';
      else if (R.phase === 'prep' && R.wave === 0) hint = '🃏 Glissez une carte sur le terrain pour la poser (une toutes les 15 s). Clic droit : signaler un endroit.';
      else if (R.phase === 'prep') hint = 'Appuyez sur Espace quand vous êtes prêt.';
    }
  }
  if (hint !== LOCAL.hint) { LOCAL.hint = hint; $('#hint').textContent = hint; $('#hint').classList.toggle('hidden', !hint); }
}
function skillUi(sel, unlocked, cd, max, armed) {
  const el = $(sel);
  el.classList.toggle('hidden', !unlocked);
  if (!unlocked) return;
  el.classList.toggle('ready', cd <= 0 && !armed); el.classList.toggle('armed', armed);
  el.querySelector('.cd').style.height = (cd > 0 ? cd / max * 100 : 0) + '%';
  el.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
}

// =====================================================================
//  FIN DE PARTIE
// =====================================================================
function checkEnd() {
  if (!G || G.phase !== 'end' || G.endT < 2.6 || G.shown) return;
  G.shown = true;
  const info = { win: G.result === 'win', xp: Math.floor(G.xp), wave: G.wave, kills: G.kills, played: G.played, fused: G.fused, shots: G.shots, hits: G.hits };
  if (MODE === 'host' && NET.open) netSend(Object.assign({ t: 'end' }, info));
  showEndModal(info);
}
function showEndModal(info) {
  const xmul = DEV_MODE ? save.dev.xpMult || 1 : 1, gained = Math.floor((info.xp || 0) * xmul);
  mutateSave(s => {
    s[ROLE].xp += gained; s.stats.runs++; if (info.win) s.stats.wins++;
    s.stats.bestWave = Math.max(s.stats.bestWave, info.win ? WAVES.length : Math.max(0, (info.wave || 1) - 1));
    s.stats.kills += info.kills || 0;
  });
  const win = info.win;
  const waves = win ? `${WAVES.length} / ${WAVES.length}` : `${Math.max(0, (info.wave || 1) - 1)} / ${WAVES.length}`;
  const roleRow = ROLE === 'tower'
    ? (info.shots !== undefined ? `<div><span>Flèches tirées · touchées</span><b>${info.shots} · ${info.hits}</b></div>` : '')
    : (info.played !== undefined ? `<div><span>Cartes posées · fusions</span><b>${info.played} · ${info.fused}</b></div>` : '');
  const partnerTxt = MODE === 'solo' ? 'L\'IA ne gagne pas d\'expérience : jouez l\'autre rôle pour faire grandir son arbre.' : info.lost ? '' : 'Votre partenaire reçoit la même quantité d\'expérience.';
  const online = MODE !== 'solo' && NET.open && !info.lost;
  $('#modalRoot').innerHTML = `<div class="modal"><div class="mbox">
    <h2 class="tf" style="color:${win ? '#ffcc4d' : '#ff7a6a'}">${win ? '🏆 Victoire !' : info.lost ? (info.quit ? '🚪 Partie quittée' : '📡 Connexion perdue') : '💀 Défaite'}</h2>
    <div class="sub">${win ? 'Le Roi-Liche est tombé : les deux niveaux sont terminés. Bravo à vous deux !' : info.lost ? 'Vous gardez l\'expérience déjà gagnée.' : 'La tour s\'est effondrée, mais votre savoir grandit.'}</div>
    <div class="rows">
      <div><span>Vagues repoussées</span><b>${waves}</b></div>
      <div><span>Niveau atteint</span><b>${win ? 'Les deux niveaux terminés !' : 'Niveau ' + levelOf(Math.max(1, info.wave || 1))}</b></div>
      <div><span>Ennemis vaincus</span><b>${info.kills || 0}</b></div>
      ${roleRow}
      <div><span>Expérience gagnée (${ROLE_INFO[ROLE].ic} ${ROLE_INFO[ROLE].nn})${xmul > 1 ? ` · mode créateur ×${xmul}` : ''}</span><b style="color:#9fe3ff">+${fmt(gained)} ✦</b></div>
      <div><span>Total dans l'arbre de ${ROLE_INFO[ROLE].n}</span><b style="color:#9fe3ff">${fmt(save[ROLE].xp)} ✦</b></div>
    </div>
    ${partnerTxt ? `<div class="sub" style="margin-top:-8px">${partnerTxt}</div>` : ''}
    <div class="mbtns">
      <button class="btn gold big tf" id="mTree">🌳 Faire grandir l'arbre</button>
      ${MODE === 'solo' ? '<button class="btn big" id="mAgain">⚔ Rejouer</button>' : ''}
      ${online ? '<button class="btn violet big" id="mLobby">🏠 Salon</button>' : ''}
    </div></div></div>`;
  $('#mTree').onclick = () => { TAB = ROLE; if (MODE === 'host' && NET.open) netSend({ t: 'toLobby' }); goHub(); };
  if ($('#mAgain')) $('#mAgain').onclick = () => { closeModal(); startSolo(ROLE); };
  if ($('#mLobby')) $('#mLobby').onclick = () => { if (MODE === 'host') netSend({ t: 'toLobby' }); goLobby(); };
}

// =====================================================================
//  BOUCLE PRINCIPALE
// =====================================================================
let lastFrame = 0, lastSim = performance.now();
function pump() {
  const now = performance.now();
  let dt = (now - lastSim) / 1000; lastSim = now;
  if (!G || MODE === 'guest' || !screenIs('battle') || G.paused) return;
  dt = Math.min(dt, document.hidden ? 1.5 : 0.1);
  let rem = dt * (G.phase === 'end' ? 1 : G.speed);
  while (rem > 1e-6) { const s = Math.min(rem, 1 / 50); simUpdate(s); rem -= s; }
  hostNetTick(dt);
  checkEnd();
}
function localTick(dt, R) {
  if (R.phase === 'end') { LOCAL.charging = false; LOCAL.down = false; return; }
  if (ROLE !== 'tower' || (!guest() && G.ctl.tower !== 'local')) return;
  const S = MY.ST, m = LOCAL.mouse;
  LOCAL.ang = Math.atan2(m.y - OY, m.x - OX);
  const ready = reloadReady();
  let k = 0;
  if (S.quick) { if (LOCAL.down && !LOCAL.mode && ready) doFire(LOCAL.ang, 1); }
  else if (LOCAL.charging) {
    if (ready) LOCAL.chargeT += dt;
    k = Math.min(1, LOCAL.chargeT / S.chargeT);
    if (k >= 1 && !LOCAL.fullSnd) { LOCAL.fullSnd = true; tone(1320, 0.08, 'triangle', 0.05); }
  }
  LOCAL.k = k;
  if (!guest()) { G.tower.ang = LOCAL.ang; G.tower.charge = k; G.tower.charging = LOCAL.charging; }
  else {
    R.tower.ang = LOCAL.ang; R.tower.charge = k; R.tower.reloadK = ready ? 0 : 1;
    LOCAL.aimSendT -= dt;
    if (LOCAL.aimSendT <= 0) { LOCAL.aimSendT = 1 / 15; netSend({ t: 'aim', a: r2(LOCAL.ang), k: r2(k), c: LOCAL.charging ? 1 : 0 }); }
  }
}
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastFrame) / 1000 || 0); lastFrame = ts;
  netPingTick(dt);
  if (!screenIs('battle')) return;
  pump();
  if (guest()) clientTick();
  const R = guest() ? clientView() : G;
  if (!R) return;
  RV = R;
  localTick(dt, R);
  updateVisuals(dt);
  render(R);
  updateHud(R);
}
requestAnimationFrame(frame);
setInterval(() => { if (document.hidden) { pump(); netPingTick(0.1); } }, 100);
addEventListener('beforeunload', () => { if (NET.open) netSend({ t: 'bye' }); });

// =====================================================================
//  DÉMARRAGE
// =====================================================================
refreshHub();
requestAnimationFrame(centerTree);
addEventListener('resize', () => { if (screenIs('hub')) centerTree(); });
if (!save.intro) {
  mutateSave(s => s.intro = true);
  $('#modalRoot').innerHTML = `<div class="modal"><div class="mbox">
    <h2 class="tf" style="color:#ffcc4d">🏰 Tour de Fortune · Duo</h2>
    <div class="sub" style="font-size:15.5px;line-height:1.55;color:#d6d2c6;text-align:left">
    Deux défenseurs, une seule tour. Tenez <b>10 vagues</b> de monstres sur deux niveaux, chacun terminé par un <b>boss</b>.<br><br>
    🏹 <b>La Tour</b> : vous tenez l'arc. Maintenez le clic pour charger, relâchez pour tirer.<br>
    🃏 <b>L'Invocateur</b> : vous piochez des cartes, fusionnez les paires et posez combattants et sorts sur le terrain.<br><br>
    Jouez avec un ami en ligne grâce à un code, ou avec une IA. Chaque rôle a son propre <b>arbre de compétences</b>.</div>
    <div class="mbtns"><button class="btn gold big tf" id="mIntro">Commencer</button></div></div></div>`;
  $('#mIntro').onclick = () => { closeModal(); actx(); SFX.node(); };
}
