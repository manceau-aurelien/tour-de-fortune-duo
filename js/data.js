'use strict';
/* =====================================================================
   TOUR DE FORTUNE — DUO · données (cartes, ennemis, vagues, arbres)
   ===================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => Math.floor(n).toLocaleString('fr-FR');
const RORD = 'NREL';
const VERSION = 2;
// Mode créateur : seulement en local (pas sur la version en ligne)
const DEV_MODE = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);

// ---------- monde ----------
const W = 1600, H = 1000, TX = 800, TY = 520, TR = 44;
const OX = TX, OY = TY - 112;          // point de départ des flèches (haut de la tour)
const ARROW_SPD = 1050;
const RAIN_R = 150;          // rayon de la Pluie de flèches

const RAR = {
  N: { n: 'Normale', c: '#b8c0cc' },
  R: { n: 'Rare', c: '#4da3ff' },
  E: { n: 'Épique', c: '#b45cff' },
  L: { n: 'Légendaire', c: '#ffb321' },
};
const rarOf = lv => RAR[RORD[lv]];

// Chaque carte a un rang de base (b). Fusionner deux cartes identiques de même rang donne le rang au-dessus.
const FMUL = 2.1;   // puissance d'un combattant par rang gagné
const SMUL = 1.8;   // puissance d'un effet par rang gagné
const CARDS = {
  // ---- combattants ----
  milicien:   { type: 'fighter', b: 0, n: 'Milicien', ic: '💂', d: 'Combattant de mêlée robuste et fidèle.', u: { hp: 70, dmg: 9, cd: 1.0, range: 22, spd: 70, rad: 13 } },
  archer:     { type: 'fighter', b: 0, n: 'Archer', ic: '🧝', d: 'Tire des flèches à distance.', u: { hp: 40, dmg: 7, cd: 1.1, range: 150, spd: 60, rad: 12, proj: 'arrow' } },
  chevalier:  { type: 'fighter', b: 1, n: 'Chevalier', ic: '🤺', d: "Un mur d'acier qui encaisse et cogne fort.", u: { hp: 230, dmg: 16, cd: 1.1, range: 24, spd: 62, rad: 15 } },
  arbaletrier:{ type: 'fighter', b: 1, n: 'Arbalétrier', ic: '🎯', d: 'Carreaux lourds à très longue portée.', u: { hp: 70, dmg: 24, cd: 1.5, range: 200, spd: 55, rad: 12, proj: 'bolt' } },
  mage:       { type: 'fighter', b: 2, n: 'Mage de bataille', ic: '🧙', d: 'Projette des orbes qui explosent en zone.', u: { hp: 90, dmg: 18, cd: 1.5, range: 170, spd: 55, rad: 13, proj: 'orb', aoe: 55 } },
  paladin:    { type: 'fighter', b: 2, n: 'Paladin', ic: '⚜️', d: 'Guerrier sacré qui soigne les alliés proches.', u: { hp: 340, dmg: 20, cd: 1.0, range: 24, spd: 62, rad: 16, heal: 7 } },
  dragon:     { type: 'fighter', b: 3, n: 'Dragon', ic: '🐉', d: 'Vole et crache un cône de flammes dévastateur.', u: { hp: 650, dmg: 9, cd: 0.22, range: 130, spd: 95, rad: 22, fly: 1, breath: 1 } },
  titan:      { type: 'fighter', b: 3, n: 'Titan de pierre', ic: '🗿', d: 'Colosse dont chaque coup ébranle le sol.', u: { hp: 1500, dmg: 65, cd: 1.8, range: 30, spd: 42, rad: 24, slam: 75 } },
  // ---- effets ----
  eclair:     { type: 'spell', b: 0, n: 'Éclair', ic: '⚡', d: "Pendant 5 s, des éclairs frappent des ennemis au hasard, où qu'ils soient.", sp: { strikes: 3, dur: 5, dmg: 32 } },
  feu:        { type: 'spell', b: 0, n: 'Boule de feu', ic: '🔥', target: 75, d: "Une boule de feu s'abat là où vous lâchez la carte.", sp: { dmg: 45, rad: 75 } },
  blizzard:   { type: 'spell', b: 1, n: 'Blizzard', ic: '❄️', d: 'Tous les ennemis subissent des dégâts et sont ralentis de 50 % pendant 6 s.', sp: { dmg: 15, slow: 0.5, dur: 6 } },
  benediction:{ type: 'spell', b: 1, n: 'Bénédiction', ic: '💖', d: 'Soigne la tour et tous les combattants, et augmente leurs dégâts de 30 % pendant 12 s.', sp: { heal: 0.3, buff: 12 } },
  orage:      { type: 'spell', b: 2, n: 'Orage', ic: '🌩️', d: "Pendant 6 s, une pluie d'éclairs s'abat sur des ennemis au hasard.", sp: { strikes: 12, dur: 6, dmg: 48 } },
  meteore:    { type: 'spell', b: 2, n: 'Météore', ic: '☄️', target: 130, d: 'Un météore écrase la zone où vous lâchez la carte et étourdit les survivants.', sp: { dmg: 220, rad: 130, stun: 1.5 } },
  jugement:   { type: 'spell', b: 3, n: 'Jugement céleste', ic: '☀️', d: 'Une colonne de lumière frappe chaque ennemi présent.', sp: { dmg: 450 } },
  faille:     { type: 'spell', b: 3, n: 'Faille temporelle', ic: '⏳', d: "Le temps s'arrête pour les ennemis. Ils subissent +50 % de dégâts.", sp: { dur: 7 } },
};
const CARD_IDS = Object.keys(CARDS);
CARD_IDS.forEach((k, i) => { CARDS[k].id = k; CARDS[k].ix = i; });
const CARD_LIST = Object.values(CARDS);
const BASE_POOL = ['milicien', 'archer', 'eclair', 'feu'];

const ENEMIES = {
  gob:  { n: 'Gobelin', ic: '👺', hp: 28, spd: 42, dmg: 6, cd: 1.0, rad: 12, xp: 1 },
  wolf: { n: 'Loup', ic: '🐺', hp: 20, spd: 88, dmg: 5, cd: 0.7, rad: 12, xp: 1 },
  ogre: { n: 'Ogre', ic: '👹', hp: 190, spd: 26, dmg: 21, cd: 1.4, rad: 18, xp: 4 },
  skel: { n: 'Squelette archer', ic: '💀', hp: 38, spd: 36, dmg: 8, cd: 1.6, rad: 12, xp: 2, range: 150 },
  bat:  { n: 'Chauve-souris', ic: '🦇', hp: 15, spd: 74, dmg: 3, cd: 0.6, rad: 10, xp: 1, fly: 1 },
  boss: { n: 'Seigneur Démon', ic: '👿', hp: 9000, spd: 17, dmg: 45, cd: 1.5, rad: 38, xp: 80, boss: 1, slam: 45, summon: ['gob'] },
  // ---- niveau 2 (à partir de la vague 6) ----
  imp:   { n: 'Diablotin', ic: '😈', hp: 40, spd: 74, dmg: 12, cd: 0.8, rad: 13, xp: 3 },
  troll: { n: 'Troll des cavernes', ic: '🧌', hp: 270, spd: 24, dmg: 34, cd: 1.6, rad: 21, xp: 8, regen: 6 },
  scorp: { n: 'Scorpion cuirassé', ic: '🦂', hp: 130, spd: 46, dmg: 18, cd: 1.1, rad: 16, xp: 5, armor: 0.4 },
  wraith:{ n: 'Spectre', ic: '👻', hp: 60, spd: 54, dmg: 14, cd: 1.0, rad: 13, xp: 4, fly: 1 },
  boss2: { n: 'Roi-Liche', ic: '☠️', hp: 45000, spd: 15, dmg: 70, cd: 1.6, rad: 42, xp: 200, boss: 1, slam: 75, summon: ['wraith', 'skel', 'imp'] },
};
const ENEMY_IDS = Object.keys(ENEMIES);
ENEMY_IDS.forEach((k, i) => { ENEMIES[k].id = k; ENEMIES[k].ix = i; });

let HP_WAVE = 0.45;  // PV des ennemis : +45 % par vague au niveau 1
let HP_WAVE2 = 0.6;  // puis +60 % de PV par vague au niveau 2
let DMG_WAVE2 = 0.3; // et +30 % d'attaque par vague au niveau 2
// Niveau 1 : vagues 1 à 5 (boss à la 5) · Niveau 2 : vagues 6 à 10 (boss à la 10)
const WAVES = [
  { dur: 18, list: { gob: 10 } },
  { dur: 24, list: { gob: 12, wolf: 8 } },
  { dur: 28, list: { gob: 14, wolf: 8, ogre: 3 } },
  { dur: 34, list: { gob: 18, wolf: 12, ogre: 5, skel: 6, bat: 8 } },
  { dur: 46, boss: 'boss', list: { gob: 16, wolf: 10, skel: 6, ogre: 3, bat: 6 } },
  { dur: 30, list: { gob: 12, wolf: 10, imp: 8, skel: 6, troll: 1 } },
  { dur: 34, list: { imp: 12, wolf: 10, scorp: 4, bat: 10, wraith: 4, ogre: 3 } },
  { dur: 36, list: { imp: 12, troll: 2, scorp: 6, skel: 8, wraith: 6, ogre: 4 } },
  { dur: 40, list: { imp: 16, troll: 4, scorp: 8, wraith: 8, ogre: 5, wolf: 12 } },
  { dur: 50, boss: 'boss2', list: { imp: 12, troll: 2, wraith: 6, skel: 8, scorp: 4 } },
];
const LEVEL_END = 5;   // dernière vague du niveau 1
const levelOf = w => w <= LEVEL_END ? 1 : 2;

// =====================================================================
//  ARBRES DE COMPÉTENCES (un par rôle)
// =====================================================================
const TREES = {
  tower: {
    n: 'la Tour', ic: '🏹',
    br: {
      core: { c: '#ffd56b', n: 'Cœur' },
      A: { c: '#ffcc4d', n: 'Archerie' },
      R: { c: '#a9b6c9', n: 'Rempart' },
      L: { c: '#6fdc8c', n: 'Alchimie' },
    },
    labels: { A: [0, -7.6], R: [-4.2, 3.2], L: [4.2, 3.2] },
    nodes: [
      { id: 'core', b: 'core', x: 0, y: 0, ic: '🏰', n: 'Archer de la tour', d: "Vous tenez l'arc au sommet de la tour. Maintenez le clic pour bander l'arc, relâchez pour tirer : plus la flèche est chargée, plus elle va loin.", max: 1, cost: 0, req: [] },
      // ARCHERIE (haut) — confort de tir bon marché, puissance chère, Tir instinctif tout au bout
      { id: 'A1', b: 'A', x: 0, y: -1.3, ic: '💪', n: 'Bras de fer', d: "L'arc se bande 15 % plus vite.", max: 3, cost: 4, g: 1.7, req: ['core'], e: { charge: 1 } },
      { id: 'A2', b: 'A', x: -0.95, y: -2.3, ic: '🗡️', n: "Pointes d'acier", d: '+30 % de dégâts des flèches.', max: 3, cost: 20, g: 2.2, req: ['A1'], e: { aDmg: 0.3 } },
      { id: 'A3', b: 'A', x: 0.95, y: -2.3, ic: '🪶', n: 'Carquois léger', d: '+15 % de cadence de tir.', max: 3, cost: 8, g: 2, req: ['A1'], e: { cadence: 1 } },
      { id: 'A5', b: 'A', x: -0.95, y: -3.4, ic: '🦅', n: 'Œil de faucon', d: '+15 % de portée.', max: 2, cost: 10, g: 2, req: ['A2'], e: { range: 0.15 } },
      { id: 'A4', b: 'A', x: 0.95, y: -3.4, ic: '💥', n: 'Coup critique', d: '+10 % de chances de coup critique (dégâts ×2,5).', max: 3, cost: 45, g: 1.9, req: ['A3'], e: { crit: 0.1 } },
      { id: 'A6', b: 'A', x: -1.95, y: -4.3, ic: '🎯', n: 'Flèche perforante', d: 'Chaque flèche traverse +1 ennemi avant de s\'arrêter.', max: 2, cost: 110, g: 2.4, req: ['A5'], e: { pierce: 1 } },
      { id: 'A7', b: 'A', x: 0, y: -4.5, ic: '🏹', n: 'Double flèche', d: 'Vous tirez deux flèches à la fois.', max: 1, cost: 260, req: ['A4', 'A5'], e: { multi: 1 } },
      { id: 'A11', b: 'A', x: 1.95, y: -4.3, ic: '🌀', n: 'Main du maître', d: '+15 % de cadence de tir.', max: 2, cost: 220, g: 2, req: ['A4'], e: { cadence: 1 } },
      { id: 'A10', b: 'A', x: -1.6, y: -5.55, ic: '⚒️', n: 'Flèches lourdes', d: '+50 % de dégâts des flèches.', max: 3, cost: 320, g: 2, req: ['A6'], e: { aDmg: 0.5 } },
      { id: 'A13', b: 'A', x: 1.6, y: -5.55, ic: '🪓', n: 'Tueur de géants', d: '+50 % de dégâts des flèches contre les Ogres, les Trolls et les boss.', max: 2, cost: 180, g: 2.2, req: ['A11'], e: { giant: 0.5 } },
      { id: 'A9', b: 'A', x: 0, y: -5.6, ic: '🔱', n: 'Triple flèche', d: 'Une troisième flèche part à chaque tir.', max: 1, cost: 700, req: ['A7'], e: { multi: 1 } },
      { id: 'A12', b: 'A', x: 0, y: -6.75, ic: '⚡', n: 'Tir instinctif', d: "Le sommet de l'art : un simple clic tire à portée maximale, et maintenir le clic tire en continu.", max: 1, cost: 1200, req: ['A9', 'A10', 'A13'], e: { quick: 1 } },
      // REMPART (bas gauche)
      { id: 'R1', b: 'R', x: -1.3, y: 0.55, ic: '🧱', n: 'Pierres taillées', d: '+60 PV pour la tour.', max: 3, cost: 12, g: 2, req: ['core'], e: { tHp: 60 } },
      { id: 'R2', b: 'R', x: -2.4, y: 0.1, ic: '🔧', n: 'Réparations', d: 'La tour récupère 12 % de ses PV entre les vagues.', max: 2, cost: 15, g: 2.4, req: ['R1'], e: { repair: 0.12 } },
      { id: 'R3', b: 'R', x: -2.0, y: 1.5, ic: '🌵', n: 'Remparts épineux', d: 'Chaque coup reçu par la tour renvoie 5 dégâts à l\'attaquant.', max: 3, cost: 35, g: 2, req: ['R1'], e: { thorns: 5 } },
      { id: 'R4', b: 'R', x: -3.5, y: 0.35, ic: '🧰', n: 'Maçons', d: 'Pendant les vagues, la tour se répare de 1,5 PV par seconde.', max: 2, cost: 70, g: 2.2, req: ['R2'], e: { regen: 1.5 } },
      { id: 'R5', b: 'R', x: -3.0, y: 2.0, ic: '🛡️', n: 'Bastion', d: '−12 % de dégâts subis par la tour.', max: 2, cost: 90, g: 2.2, req: ['R3'], e: { armor: 0.12 } },
      { id: 'R6', b: 'R', x: -4.2, y: 1.45, ic: '🗻', n: 'Murailles de granite', d: '+200 PV pour la tour.', max: 3, cost: 180, g: 2, req: ['R4', 'R5'], e: { tHp: 200 } },
      { id: 'R7', b: 'R', x: -5.25, y: 1.9, ic: '🏯', n: 'Forteresse', d: '+40 % de PV maximum pour la tour.', max: 1, cost: 600, req: ['R6'], e: { tHpPct: 0.4 } },
      // ALCHIMIE (bas droite)
      { id: 'L1', b: 'L', x: 1.3, y: 0.55, ic: '🔥', n: 'Flèches enflammées', d: 'Les flèches enflamment leur cible : +40 % de dégâts sur 3 s.', max: 2, cost: 25, g: 2.4, req: ['core'], e: { burn: 0.4 } },
      { id: 'L2', b: 'L', x: 2.4, y: 0.1, ic: '❄️', n: 'Flèches givrées', d: 'Les flèches ralentissent leur cible de 25 % pendant 1,5 s.', max: 2, cost: 30, g: 2.2, req: ['L1'], e: { frost: 0.25 } },
      { id: 'L3', b: 'L', x: 2.0, y: 1.5, ic: '🍯', n: 'Pot de glu', d: 'Nouveau sort (touche Q) : un pot de glu ralentit fortement les monstres au sol dans une zone. Recharge : 40 s, uniquement pendant les vagues.', max: 1, cost: 70, req: ['L1'], e: { glue: 1 } },
      { id: 'L4', b: 'L', x: 3.0, y: 2.0, ic: '🕸️', n: 'Glu tenace', d: 'Les monstres pris dans la glu sont totalement immobilisés pendant 1,5 s de plus.', max: 2, cost: 90, g: 2, req: ['L3'], e: { glueStop: 1.5 } },
      { id: 'L5', b: 'L', x: 2.2, y: 2.9, ic: '🫕', n: 'Grand chaudron', d: '+25 % de zone pour la glu.', max: 2, cost: 60, g: 2, req: ['L3'], e: { glueRad: 0.25 } },
      { id: 'L6', b: 'L', x: 4.1, y: 2.2, ic: '⏳', n: 'Recette rapide', d: '−15 % de temps de recharge de la glu.', max: 3, cost: 100, g: 1.8, req: ['L4'], e: { glueCd: 1 } },
      { id: 'L7', b: 'L', x: 3.5, y: 0.35, ic: '💣', n: 'Flèches explosives', d: 'Les flèches explosent à l\'impact et touchent les ennemis proches (50 % des dégâts).', max: 1, cost: 220, req: ['L2'], e: { explode: 1 } },
      { id: 'L8', b: 'L', x: 3.2, y: 3.5, ic: '🧪', n: 'Glu acide', d: 'La glu ronge les monstres : 8 dégâts par seconde.', max: 2, cost: 160, g: 2, req: ['L5'], e: { acid: 8 } },
      { id: 'L9', b: 'L', x: 5.2, y: 2.7, ic: '🌧️', n: 'Pluie de flèches', d: 'Nouveau sort (touche E) : 45 flèches s\'abattent sur une large zone. Chacune touche tous les ennemis autour de son impact (130 % des dégâts d\'une flèche, critiques et bonus compris) et les ralentit de 40 %. Recharge : 35 s.', max: 1, cost: 450, req: ['L6'], e: { rain: 1 } },
    ],
  },
  inv: {
    n: "l'Invocateur", ic: '🃏',
    br: {
      core: { c: '#ffd56b', n: 'Cœur' },
      P: { c: '#ffcc4d', n: 'Pioche' },
      V: { c: '#c070ff', n: 'Réserve' },
      G: { c: '#ff5b4a', n: 'Guerre' },
      S: { c: '#4da3ff', n: 'Arcanes' },
    },
    labels: { P: [0, -6.6], V: [-2.9, 3.6], G: [-7.5, 0.1], S: [7.5, 0.1] },
    nodes: [
      { id: 'core', b: 'core', x: 0, y: 0, ic: '🃏', n: 'Grimoire', d: 'Vous piochez une carte toutes les 10 s et pouvez en poser une toutes les 15 s. Fusionnez deux cartes identiques pour monter leur rang.', max: 1, cost: 0, req: [] },
      // PIOCHE (haut) — rythme du jeu, bon marché
      { id: 'P2', b: 'P', x: 0, y: -1.3, ic: '⏱️', n: 'Pioche rapide', d: '−10 % de temps entre deux pioches.', max: 4, cost: 3, g: 1.6, req: ['core'], e: { drawSpd: 1 } },
      { id: 'P1', b: 'P', x: -0.95, y: -2.3, ic: '✋', n: 'Main agile', d: '+1 carte maximum en main.', max: 3, cost: 6, g: 1.9, req: ['P2'], e: { hand: 1 } },
      { id: 'P3', b: 'P', x: 0.95, y: -2.3, ic: '🍀', n: 'Trèfle à quatre feuilles', d: 'Fortune +1 : les cartes piochées sont plus souvent de rang élevé.', max: 3, cost: 15, g: 1.9, req: ['P2'], e: { luck: 1 } },
      { id: 'P7', b: 'P', x: -0.95, y: -3.4, ic: '🎴', n: 'Préparation', d: '+1 carte piochée au début de chaque vague.', max: 2, cost: 20, g: 2.2, req: ['P1'], e: { startDraw: 1 } },
      { id: 'P8', b: 'P', x: 0.95, y: -3.4, ic: '🐎', n: 'Fer à cheval', d: 'Fortune +1.', max: 3, cost: 70, g: 1.8, req: ['P3'], e: { luck: 1 } },
      { id: 'P6', b: 'P', x: 0, y: -4.5, ic: '🂠', n: 'Double pioche', d: '+1 carte à chaque pioche.', max: 2, cost: 110, g: 2.6, req: ['P7', 'P8'], e: { drawN: 1 } },
      { id: 'P11', b: 'P', x: -1.95, y: -4.3, ic: '🧳', n: 'Grande main', d: '+1 carte maximum en main.', max: 2, cost: 120, g: 2, req: ['P7'], e: { hand: 1 } },
      { id: 'P10', b: 'P', x: 1.95, y: -4.3, ic: '🌟', n: 'Étoile filante', d: '+8 % de chances qu\'une carte piochée arrive avec un rang de plus.', max: 2, cost: 250, g: 2, req: ['P8'], e: { upDraw: 0.08 } },
      { id: 'P9', b: 'P', x: 0, y: -5.6, ic: '🔮', n: 'Fusion parfaite', d: 'Les cartes nées d\'une fusion gagnent +25 % de puissance.', max: 2, cost: 350, g: 2, req: ['P6'], e: { fuseBonus: 0.25 } },
      // RÉSERVE (bas) — stocker des invocations
      { id: 'V1', b: 'V', x: 0, y: 1.3, ic: '🌬️', n: 'Célérité', d: '−1,5 s entre deux invocations.', max: 4, cost: 3, g: 1.7, req: ['core'], e: { poseCd: 1.5 } },
      { id: 'V2', b: 'V', x: -0.95, y: 2.3, ic: '🔋', n: 'Réserve', d: "Quand vous n'invoquez pas, la barre continue de se charger : vous pouvez stocker 1 invocation de plus et en faire deux d'affilée.", max: 1, cost: 15, req: ['V1'], e: { reserve: 1 } },
      { id: 'V3', b: 'V', x: 0.95, y: 2.3, ic: '♻️', n: 'Recyclage', d: 'Jeter une carte fait gagner 1 s sur la prochaine invocation (2 s au niveau 2).', max: 2, cost: 10, g: 2, req: ['V1'], e: { recycle: 1 } },
      { id: 'V4', b: 'V', x: 0, y: 3.4, ic: '🔋', n: 'Grande réserve', d: '+1 invocation stockable.', max: 2, cost: 90, g: 2.5, req: ['V2', 'V3'], e: { reserve: 1 } },
      { id: 'V5', b: 'V', x: -0.95, y: 4.5, ic: '📯', n: 'Clairon', d: 'Au début de chaque vague, vous gagnez immédiatement une invocation.', max: 1, cost: 120, req: ['V4'], e: { waveCharge: 1 } },
      { id: 'V6', b: 'V', x: 0.95, y: 4.5, ic: '🎐', n: 'Élan', d: '15 % de chances qu\'une invocation ne consomme rien.', max: 2, cost: 200, g: 2, req: ['V4'], e: { freePose: 0.15 } },
      // GUERRE (gauche) — nouvelles recrues abordables, renforcements chers
      { id: 'G1', b: 'G', x: -1.35, y: 0, ic: '🤺', n: 'Recrue : Chevalier', d: 'Le Chevalier (Rare) peut apparaître dans votre pioche.', max: 1, cost: 12, req: ['core'], card: 'chevalier' },
      { id: 'G2', b: 'G', x: -2.35, y: -0.9, ic: '⚔️', n: 'Entraînement', d: '+15 % de dégâts pour les combattants.', max: 3, cost: 30, g: 2.1, req: ['G1'], e: { fDmg: 0.15 } },
      { id: 'G3', b: 'G', x: -2.35, y: 0.9, ic: '🎯', n: 'Recrue : Arbalétrier', d: "L'Arbalétrier (Rare) peut apparaître dans votre pioche.", max: 1, cost: 15, req: ['G1'], card: 'arbaletrier' },
      { id: 'G4', b: 'G', x: -3.4, y: -0.9, ic: '🥋', n: 'Armures de cuir', d: '+20 % de PV pour les combattants.', max: 3, cost: 35, g: 2.1, req: ['G2'], e: { fHp: 0.2 } },
      { id: 'G5', b: 'G', x: -3.4, y: 0.9, ic: '💢', n: 'Rage', d: "+12 % de vitesse d'attaque des combattants.", max: 3, cost: 40, g: 2.1, req: ['G3'], e: { fAs: 0.12 } },
      { id: 'G13', b: 'G', x: -3.4, y: -2.1, ic: '🎖️', n: 'Vétérans', d: 'Les combattants récupèrent +35 % de PV entre les vagues (base 30 %).', max: 2, cost: 50, g: 2.2, req: ['G4'], e: { fHeal: 0.35 } },
      { id: 'G6', b: 'G', x: -4.45, y: -1.6, ic: '⚜️', n: 'Recrue : Paladin', d: 'Le Paladin (Épique) peut apparaître dans votre pioche.', max: 1, cost: 80, req: ['G4'], card: 'paladin' },
      { id: 'G7', b: 'G', x: -4.45, y: 0, ic: '🧙', n: 'Recrue : Mage', d: 'Le Mage de bataille (Épique) peut apparaître dans votre pioche.', max: 1, cost: 80, req: ['G4', 'G5'], card: 'mage' },
      { id: 'G8', b: 'G', x: -4.45, y: 1.6, ic: '🛡️', n: 'Boucliers', d: '+30 % de PV pour les combattants.', max: 2, cost: 90, g: 2.2, req: ['G5'], e: { fHp: 0.3 } },
      { id: 'G9', b: 'G', x: -5.5, y: -0.8, ic: '🔥', n: 'Lames runiques', d: '+25 % de dégâts pour les combattants.', max: 3, cost: 250, g: 2, req: ['G6', 'G7'], e: { fDmg: 0.25 } },
      { id: 'G10', b: 'G', x: -5.5, y: 0.8, ic: '👥', n: 'Écuyers', d: 'Chaque combattant invoqué arrive accompagné d\'un Milicien.', max: 1, cost: 260, req: ['G7', 'G8'], e: { squire: 1 } },
      { id: 'G11', b: 'G', x: -6.5, y: -1.0, ic: '🐉', n: 'Recrue : Dragon', d: 'Le Dragon (Légendaire) peut apparaître dans votre pioche.', max: 1, cost: 500, req: ['G9'], card: 'dragon' },
      { id: 'G12', b: 'G', x: -6.5, y: 1.0, ic: '🗿', n: 'Recrue : Titan', d: 'Le Titan de pierre (Légendaire) peut apparaître dans votre pioche.', max: 1, cost: 500, req: ['G10'], card: 'titan' },
      // ARCANES (droite)
      { id: 'S1', b: 'S', x: 1.35, y: 0, ic: '❄️', n: 'Grimoire : Blizzard', d: 'Le Blizzard (Rare) peut apparaître dans votre pioche.', max: 1, cost: 12, req: ['core'], card: 'blizzard' },
      { id: 'S2', b: 'S', x: 2.35, y: -0.9, ic: '✨', n: 'Étincelle', d: '+15 % de dégâts des effets.', max: 3, cost: 30, g: 2.1, req: ['S1'], e: { sDmg: 0.15 } },
      { id: 'S3', b: 'S', x: 2.35, y: 0.9, ic: '💖', n: 'Grimoire : Bénédiction', d: 'La Bénédiction (Rare) peut apparaître dans votre pioche.', max: 1, cost: 15, req: ['S1'], card: 'benediction' },
      { id: 'S4', b: 'S', x: 3.4, y: -0.9, ic: '⚡', n: 'Foudre surchargée', d: 'Éclair : +1 frappe. Orage : +3 frappes.', max: 3, cost: 35, g: 2, req: ['S2'], e: { bolt: 1 } },
      { id: 'S5', b: 'S', x: 3.4, y: 0.9, ic: '🌀', n: 'Amplification', d: '+25 % de zone pour les effets, +20 % de durée des tempêtes.', max: 2, cost: 40, g: 2.2, req: ['S3'], e: { area: 0.25, dur: 0.2 } },
      { id: 'S13', b: 'S', x: 3.4, y: -2.1, ic: '🔗', n: 'Conduction', d: 'Les éclairs rebondissent sur +1 ennemi proche (60 % des dégâts).', max: 2, cost: 60, g: 2.2, req: ['S4'], e: { chain: 1 } },
      { id: 'S6', b: 'S', x: 4.45, y: -1.6, ic: '🌩️', n: 'Grimoire : Orage', d: "L'Orage (Épique) peut apparaître dans votre pioche.", max: 1, cost: 80, req: ['S4'], card: 'orage' },
      { id: 'S7', b: 'S', x: 4.45, y: 0, ic: '☄️', n: 'Grimoire : Météore', d: 'Le Météore (Épique) peut apparaître dans votre pioche.', max: 1, cost: 80, req: ['S4', 'S5'], card: 'meteore' },
      { id: 'S8', b: 'S', x: 4.45, y: 1.6, ic: '🧊', n: 'Givre éternel', d: '+30 % de durée pour les ralentissements et étourdissements.', max: 3, cost: 70, g: 2, req: ['S5'], e: { freeze: 0.3 } },
      { id: 'S9', b: 'S', x: 5.5, y: -0.8, ic: '📕', n: 'Puissance arcanique', d: '+25 % de dégâts des effets.', max: 3, cost: 250, g: 2, req: ['S6', 'S7'], e: { sDmg: 0.25 } },
      { id: 'S10', b: 'S', x: 5.5, y: 0.8, ic: '🔁', n: 'Écho', d: '+15 % de chances qu\'un effet se relance gratuitement.', max: 2, cost: 260, g: 2, req: ['S7', 'S8'], e: { echo: 0.15 } },
      { id: 'S11', b: 'S', x: 6.5, y: -1.0, ic: '☀️', n: 'Grimoire : Jugement', d: 'Le Jugement céleste (Légendaire) peut apparaître dans votre pioche.', max: 1, cost: 500, req: ['S9'], card: 'jugement' },
      { id: 'S12', b: 'S', x: 6.5, y: 1.0, ic: '⏳', n: 'Grimoire : Faille', d: 'La Faille temporelle (Légendaire) peut apparaître dans votre pioche.', max: 1, cost: 500, req: ['S10'], card: 'faille' },
    ],
  },
};
for (const k in TREES) { const T = TREES[k]; T.map = {}; T.nodes.forEach(n => T.map[n.id] = n); }
// Texte de l'effet total d'un nœud à un niveau donné (affiché dans l'info-bulle)
const pct = v => Math.round(v * 100) + ' %';
const sec = v => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' s';
const plur = (v, w) => v + ' ' + w + (v > 1 ? 's' : '');
const EFX = {
  charge: v => `arc bandé ${pct(1 - Math.pow(0.85, v))} plus vite`,
  aDmg: v => `+${pct(v)} de dégâts des flèches`,
  cadence: v => `+${pct(Math.pow(1.15, v) - 1)} de cadence de tir`,
  range: v => `+${pct(v)} de portée`,
  crit: v => `${pct(v)} de chances de coup critique`,
  pierce: v => `traverse ${plur(v, 'ennemi')}`,
  giant: v => `+${pct(v)} contre Ogres, Trolls et boss`,
  tHp: v => `+${v} PV pour la tour`,
  repair: v => `${pct(v)} des PV réparés entre les vagues`,
  thorns: v => `${v} dégâts renvoyés à chaque coup`,
  regen: v => `${sec(v).replace(' s', '')} PV par seconde pendant les vagues`,
  armor: v => `−${pct(v)} de dégâts subis`,
  burn: v => `brûlure : +${pct(v)} de dégâts sur 3 s`,
  frost: v => `ralentit de ${pct(v)} pendant 1,5 s`,
  glueStop: v => `immobilise pendant ${sec(v)}`,
  glueRad: v => `+${pct(v)} de zone de glu`,
  glueCd: v => `recharge de la glu : ${sec(40 * Math.pow(0.85, v))}`,
  acid: v => `${v} dégâts par seconde dans la glu`,
  drawSpd: v => `une carte toutes les ${sec(10 * Math.pow(0.9, v))}`,
  hand: v => `+${plur(v, 'carte')} en main`,
  luck: v => `Fortune +${v}`,
  startDraw: v => `+${plur(v, 'carte')} au début de chaque vague`,
  drawN: v => `+${plur(v, 'carte')} à chaque pioche`,
  upDraw: v => `${pct(v)} de chances d'un rang en plus`,
  fuseBonus: v => `+${pct(v)} de puissance après fusion`,
  poseCd: v => `invocation toutes les ${sec(15 - v)}`,
  reserve: v => `+${plur(v, 'invocation')} en réserve`,
  recycle: v => `jeter une carte : −${sec(v)} sur l'invocation`,
  freePose: v => `${pct(v)} de chances d'invocation gratuite`,
  fDmg: v => `+${pct(v)} de dégâts des combattants`,
  fHp: v => `+${pct(v)} de PV des combattants`,
  fAs: v => `+${pct(v)} de vitesse d'attaque`,
  fHeal: v => `soin entre les vagues : ${pct(0.3 + v)} des PV`,
  sDmg: v => `+${pct(v)} de dégâts des effets`,
  bolt: v => `Éclair +${plur(v, 'frappe')}, Orage +${3 * v} frappes`,
  area: v => `+${pct(v)} de zone des effets`,
  dur: v => `+${pct(v)} de durée des tempêtes`,
  chain: v => `rebond sur ${plur(v, 'ennemi')}`,
  freeze: v => `+${pct(v)} de durée des ralentissements`,
  echo: v => `${pct(v)} de chances d'écho`,
};
function nodeEffectText(n, lv) {
  if (!n.e || lv <= 0) return '';
  return Object.keys(n.e).filter(k => EFX[k]).map(k => EFX[k](Math.round(n.e[k] * lv * 1000) / 1000)).join(' · ');
}
const COSTK = 1;   // multiplicateur global du prix des nœuds
const nodeCost = (n, lv) => Math.round(n.cost * COSTK * Math.pow(n.g || 2, lv));

// =====================================================================
//  STATISTIQUES (calculées à partir des niveaux de nœuds)
// =====================================================================
function treeEffects(tree, nodes) {
  const e = { cards: [] };
  for (const n of TREES[tree].nodes) {
    const lv = nodes[n.id] || 0;
    if (!lv) continue;
    if (n.e) for (const k in n.e) e[k] = (e[k] || 0) + n.e[k] * lv;
    if (n.card) e.cards.push(n.card);
  }
  return e;
}
function towerStats(nodes) {
  const e = treeEffects('tower', nodes || {}), g = k => e[k] || 0;
  return {
    chargeT: 1.2 * Math.pow(0.85, g('charge')),
    dmg: 12 * (1 + g('aDmg')),
    reload: 0.7 / Math.pow(1.15, g('cadence')),
    range: 540 * (1 + g('range')),
    pierce: g('pierce'), multi: 1 + g('multi'), crit: g('crit'), quick: g('quick') > 0, giant: g('giant'),
    hp: Math.round((200 + g('tHp')) * (1 + g('tHpPct'))),
    repair: g('repair'), thorns: g('thorns'), regen: g('regen'), armor: g('armor'),
    burn: g('burn'), frost: g('frost'), explode: g('explode') > 0,
    glue: g('glue') > 0, glueStop: g('glueStop'), glueR: 110 * (1 + g('glueRad')), glueCd: 40 * Math.pow(0.85, g('glueCd')), acid: g('acid'),
    rain: g('rain') > 0, rainCd: 35,
  };
}
function invStats(nodes) {
  const e = treeEffects('inv', nodes || {}), g = k => e[k] || 0;
  return {
    handMax: 3 + g('hand'), drawInt: 10 * Math.pow(0.9, g('drawSpd')), drawN: 1 + g('drawN'),
    poseCd: 15 - g('poseCd'), luck: g('luck'), recycle: g('recycle'), startDraw: g('startDraw'),
    charges: 1 + g('reserve'), waveCharge: g('waveCharge'), freePose: g('freePose'),
    fuseBonus: g('fuseBonus'), upDraw: g('upDraw'),
    fDmg: g('fDmg'), fHp: g('fHp'), fAs: g('fAs'), fHeal: g('fHeal'), squire: g('squire'),
    sDmg: g('sDmg'), bolt: g('bolt'), chain: g('chain'), freeze: g('freeze'), area: g('area'), dur: g('dur'), echo: g('echo'),
    pool: BASE_POOL.concat(e.cards),
  };
}
// probabilités de rang à la pioche, décalées par la Fortune
function drawOdds(luck) {
  const o = [82, 15, 2.7, 0.3];
  const shift = Math.min(luck * 4, o[0] - 20);
  o[0] -= shift; o[1] += shift * 0.55; o[2] += shift * 0.32; o[3] += shift * 0.13;
  return o;
}
// puissance d'une carte (instance) : rang au-dessus de la base + bonus de fusion
function cardMult(card, SI) {
  const def = CARDS[card.id], up = card.lv - def.b;
  return Math.pow(def.type === 'fighter' ? FMUL : SMUL, up) * (card.fz ? 1 + SI.fuseBonus : 1);
}

// =====================================================================
//  SAUVEGARDE (relue avant chaque écriture : deux onglets peuvent jouer en même temps)
// =====================================================================
// difficultés (mode créateur) : multiplient la vie et l'attaque des monstres
const DIFFS = {
  easy: { n: 'Facile', hp: 0.7, atk: 0.7, c: '#7eff9a' },
  normal: { n: 'Normal', hp: 1, atk: 1, c: '#ffcc4d' },
  hard: { n: 'Difficile', hp: 1.4, atk: 1.4, c: '#ff6a5a' },
};
const SAVE_KEY = 'tourFortuneDuo_v2';
const PROFILES_KEY = 'tourFortuneDuo_profiles';
function defaultSave() {
  return {
    tower: { xp: 0, nodes: { core: 1 } }, inv: { xp: 0, nodes: { core: 1 } },
    codex: {}, stats: { runs: 0, wins: 0, bestWave: 0, kills: 0 }, sound: true, intro: false, lastRole: 'tower',
    dev: { diff: 'hard', xpMult: 1 },
  };
}
const validSave = s => !!(s && s.tower && s.inv && s.tower.nodes && s.inv.nodes);
function normalizeSave(s) { const d = defaultSave(); return Object.assign(d, s, { stats: Object.assign(d.stats, s.stats), dev: Object.assign(d.dev, s.dev) }); }

// ---------- profils (une sauvegarde séparée par profil) ----------
function loadProfiles() {
  try { const p = JSON.parse(localStorage.getItem(PROFILES_KEY)); if (p && p.list && p.list.length) return p; } catch (e) { }
  return { active: 'main', list: [{ id: 'main', name: 'Mon profil', created: Date.now() }] };
}
let PROFILES = loadProfiles();
function saveProfiles() { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(PROFILES)); } catch (e) { } }
saveProfiles();
const profKey = id => id === 'main' ? SAVE_KEY : SAVE_KEY + '_' + id;
// chaque onglet garde son profil (pratique pour jouer à deux sur le même PC)
let ACTIVE_PROFILE = (() => {
  let id = null; try { id = sessionStorage.getItem('tfd_profile'); } catch (e) { }
  if (!id || !PROFILES.list.some(p => p.id === id)) id = PROFILES.list.some(p => p.id === PROFILES.active) ? PROFILES.active : PROFILES.list[0].id;
  return id;
})();
const curProfile = () => PROFILES.list.find(p => p.id === ACTIVE_PROFILE) || PROFILES.list[0];

// ---------- lecture / écriture sécurisées ----------
// Chaque écriture garde la version précédente dans une copie de secours (_bak).
// Si la sauvegarde principale est illisible, la copie de secours est utilisée.
function readSaveKey(key) {
  for (const k of [key, key + '_bak']) {
    try { const s = JSON.parse(localStorage.getItem(k)); if (validSave(s)) return normalizeSave(s); } catch (e) { }
  }
  return null;
}
function loadSave() { return readSaveKey(profKey(ACTIVE_PROFILE)) || defaultSave(); }
let save = loadSave();
let SAVE_ERROR = false;
function writeSaveKey(key, s) {
  try {
    const prev = localStorage.getItem(key);
    if (prev) { try { if (validSave(JSON.parse(prev))) localStorage.setItem(key + '_bak', prev); } catch (e) { } }
    localStorage.setItem(key, JSON.stringify(s));
    SAVE_ERROR = false;
  } catch (e) { SAVE_ERROR = true; }
}
function mutateSave(fn) {
  const s = loadSave(); fn(s);
  s.savedAt = Date.now();
  writeSaveKey(profKey(ACTIVE_PROFILE), s);
  save = s;
}
// demande au navigateur de ne jamais effacer automatiquement les données du jeu
let STORAGE_SAFE = null;
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => STORAGE_SAFE = ok).catch(() => { }); } catch (e) { }
