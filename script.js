const API = 'https://api.opendota.com/api';
const IMG = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';

// ====== ЗВУКОВЫЕ ЭФФЕКТЫ ======
let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'remove') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) { console.log('Звук не поддерживается'); }
}

const state = { heroes: [], heroMap: {}, enemyIds: [], allyIds: [], matchupsCache: {}, mode: 'enemy', activeSlot: null, roleFilter: '', attrFilter: '' };

const imgUrl = (name) => IMG + '/' + name.replace('npc_dota_hero_', '') + '.png';
const dotabuffUrl = (name) => 'https://www.dotabuff.com/heroes/' + name.replace('npc_dota_hero_', '');
const displayName = (hero) => hero.localized_name || hero.name.replace('npc_dota_hero_', '');

function translateRole(role) {
  const dict = { 'Carry': 'Керри', 'Support': 'Поддержка', 'Nuker': 'Нюкер', 'Disabler': 'Обездвиживание', 'Initiator': 'Инициатор', 'Durable': 'Танк', 'Escape': 'Побег', 'Pusher': 'Пушер', 'Jungler': 'Лесник' };
  return dict[role] || role;
}

function getHeroDifficulty(heroName) {
  const easy = ['npc_dota_hero_wraith_king', 'npc_dota_hero_sniper', 'npc_dota_hero_lion', 'npc_dota_hero_crystal_maiden', 'npc_dota_hero_lich', 'npc_dota_hero_ogre_magi', 'npc_dota_hero_medusa', 'npc_dota_hero_spirit_breaker', 'npc_dota_hero_centaur', 'npc_dota_hero_drow_ranger', 'npc_dota_hero_witch_doctor', 'npc_dota_hero_zeus'];
  const hard = ['npc_dota_hero_invoker', 'npc_dota_hero_meepo', 'npc_dota_hero_morphling', 'npc_dota_hero_arc_warden', 'npc_dota_hero_earth_spirit', 'npc_dota_hero_ember_spirit', 'npc_dota_hero_storm_spirit', 'npc_dota_hero_visage', 'npc_dota_hero_chen', 'npc_dota_hero_naga_siren', 'npc_dota_hero_broodmother', 'npc_dota_hero_lone_druid'];
  if (easy.includes(heroName)) return { label: 'Легко', class: 'diff-easy' };
  if (hard.includes(heroName)) return { label: 'Хард', class: 'diff-hard' };
  return { label: 'Средне', class: 'diff-medium' };
}

async function loadHeroes() {
  const grid = document.getElementById('heroGrid');
  try {
    grid.innerHTML = '<p class="loading">Загрузка героев...</p>';
    const res = await fetch(API + '/heroes');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const heroes = await res.json();
    state.heroes = heroes.sort((a, b) => displayName(a).localeCompare(displayName(b)));
    state.heroMap = Object.fromEntries(state.heroes.map(h => [h.id, h]));
    populateRoleFilter(); renderHeroGrid(); updateStats();
  } catch (e) { grid.innerHTML = '<div class="loading"><p style="color:#ff4d3d;">Ошибка загрузки</p></div>'; }
}

function populateRoleFilter() {
  const select = document.getElementById('roleFilter');
  const rolesSet = new Set();
  state.heroes.forEach(h => (h.roles || []).forEach(r => rolesSet.add(r)));
  select.innerHTML = '<option value="">Все роли</option>' + Array.from(rolesSet).sort().map(r => `<option value="${r}">${translateRole(r)}</option>`).join('');
}

async function loadMatchups(heroId) {
  if (state.matchupsCache[heroId]) return state.matchupsCache[heroId];
  const res = await fetch(API + '/heroes/' + heroId + '/matchups');
  const data = await res.json();
  const map = {};
  data.forEach(row => { map[row.hero_id] = row.wins / row.games_played; });
  state.matchupsCache[heroId] = map;
  return map;
}

function renderHeroGrid(filter = '') {
  const grid = document.getElementById('heroGrid');
  const q = filter.toLowerCase().trim();
  const filtered = state.heroes.filter(h => {
    if (q && !displayName(h).toLowerCase().includes(q)) return false;
    if (state.roleFilter && !(h.roles || []).includes(state.roleFilter)) return false;
    if (state.attrFilter && h.primary_attr !== state.attrFilter) return false;
    return true;
  });
  if (!filtered.length) { grid.innerHTML = '<p class="loading">Ничего не найдено</p>'; return; }
  grid.innerHTML = filtered.map(h => {
    const id = h.id; let cls = 'hero-card';
    if (state.enemyIds.includes(id)) cls += ' selected-enemy';
    if (state.allyIds.includes(id)) cls += ' selected-ally';
    return `<div class="${cls}" data-id="${id}" data-attr="${h.primary_attr || ''}" title="${displayName(h)}"><img src="${imgUrl(h.name)}" loading="lazy" /><div class="tooltip">${displayName(h)}</div></div>`;
  }).join('');
  grid.querySelectorAll('.hero-card').forEach(card => {
    card.addEventListener('click', () => onHeroClick(Number(card.dataset.id)));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); window.open(dotabuffUrl(state.heroMap[Number(card.dataset.id)].name), '_blank'); });
  });
}

function onHeroClick(heroId) {
  const team = state.mode; const arr = team === 'enemy' ? state.enemyIds : state.allyIds; const limit = 5;
  
  if (state.enemyIds.includes(heroId) || state.allyIds.includes(heroId)) { playSound('remove'); } 
  else { playSound('click'); }

  if (arr.includes(heroId)) {
    if (team === 'enemy') state.enemyIds = state.enemyIds.filter(id => id !== heroId); else state.allyIds = state.allyIds.filter(id => id !== heroId);
    state.activeSlot = null; renderAll(); return;
  }
  if (team === 'enemy') state.allyIds = state.allyIds.filter(id => id !== heroId); else state.enemyIds = state.enemyIds.filter(id => id !== heroId);
  if (state.activeSlot && state.activeSlot.team === team) { arr[state.activeSlot.index] = heroId; compactArr(arr); } 
  else { if (arr.length >= limit) { alert('Уже выбрано ' + limit + ' героев.'); return; } arr.push(heroId); }
  state.activeSlot = null; renderAll();
}

function compactArr(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === undefined || arr[i] === null) arr.splice(i, 1); }
function setMode(team) { state.mode = team; state.activeSlot = null; renderAll(); }

function updateStats(avgWr) {
  document.getElementById('statTotal').textContent = state.heroes.length;
  document.getElementById('statAvail').textContent = state.heroes.length - state.enemyIds.length - state.allyIds.length;
  document.getElementById('statAvgWr').textContent = avgWr !== undefined ? (avgWr * 100).toFixed(1) + '%' : '—';
}

function renderSlots() {
  renderTeamSlots('enemy', state.enemyIds); renderTeamSlots('ally', state.allyIds);
  document.querySelectorAll('.draft-progress .seg').forEach(seg => {
    const key = seg.dataset.seg; const isEnemy = key[0] === 'e'; const idx = parseInt(key[1]);
    seg.classList.toggle('filled', idx < (isEnemy ? state.enemyIds : state.allyIds).length);
  });
  const eCount = document.getElementById('enemyCount'); const aCount = document.getElementById('allyCount');
  if (eCount) { eCount.textContent = state.enemyIds.length + '/5'; eCount.classList.remove('pulse'); void eCount.offsetWidth; eCount.classList.add('pulse'); }
  if (aCount) { aCount.textContent = state.allyIds.length + '/5'; aCount.classList.remove('pulse'); void aCount.offsetWidth; aCount.classList.add('pulse'); }
  
  const hasHeroes = state.enemyIds.length > 0 || state.allyIds.length > 0;
  document.getElementById('recommendBtn').disabled = !hasHeroes;
  const expBtn = document.getElementById('exportBtn');
  if (expBtn) expBtn.disabled = !hasHeroes;

  const pickerMode = document.getElementById('pickerMode');
  if (pickerMode) {
    pickerMode.textContent = state.mode === 'enemy' ? '→ во ВРАГИ' : '→ в СОЮЗНИКИ';
    pickerMode.classList.toggle('ally', state.mode === 'ally');
  }
  document.querySelectorAll('.mode-btn').forEach(btnEl => btnEl.classList.toggle('active', btnEl.dataset.team === state.mode));
  updateStats();
}

function renderTeamSlots(team, ids) {
  const container = document.getElementById(team === 'enemy' ? 'enemySlots' : 'allySlots');
  container.querySelectorAll('.slot').forEach((slot, i) => {
    const heroId = ids[i]; const isActive = state.activeSlot && state.activeSlot.team === team && state.activeSlot.index === i;
    slot.classList.toggle('filled', !!heroId); slot.classList.toggle('active', isActive);
    if (heroId && state.heroMap[heroId]) {
      const hero = state.heroMap[heroId];
      slot.innerHTML = `<span class="slot-num">${i + 1}</span><img src="${imgUrl(hero.name)}" /><div class="name">${displayName(hero)}</div>`;
    } else { slot.innerHTML = `<span class="slot-num">${i + 1}</span><span class="slot-plus">+</span>`; }
    slot.onclick = () => {
      if (heroId) {
        playSound('remove');
        if (team === 'enemy') state.enemyIds = state.enemyIds.filter(id => id !== heroId); else state.allyIds = state.allyIds.filter(id => id !== heroId);
        state.activeSlot = null; renderAll(); return;
      }
      playSound('click');
      state.mode = team; state.activeSlot = { team, index: i }; renderAll();
    };
  });
}

async function showRecommendations() {
  const btn = document.getElementById('recommendBtn'); const status = document.getElementById('recStatus'); const list = document.getElementById('recList');
  btn.disabled = true; document.getElementById('welcomeScreen').style.display = 'none'; status.style.display = 'block'; status.textContent = 'Считаем...'; list.innerHTML = ''; document.getElementById('statsPanel').style.display = 'flex';
  
  playSound('success');
  
  try {
    const enemies = state.enemyIds; const allies = state.allyIds;
    const allMatchups = await Promise.all([...enemies, ...allies].map(id => loadMatchups(id)));
    const enemyMatchups = allMatchups.slice(0, enemies.length);
    const allyMatchups = allMatchups.slice(enemies.length);
    const scored = state.heroes.filter(h => !state.enemyIds.includes(h.id) && !state.allyIds.includes(h.id)).map(hero => {
      let eSum = 0, eW = 0, aSum = 0, aW = 0; const details = [];
      enemyMatchups.forEach((map, i) => { const wr = map[hero.id]; if (wr === undefined) return; eSum += wr; eW += 1; details.push({ enemy: displayName(state.heroMap[enemies[i]]), wr }); });
      allyMatchups.forEach(map => { const wr = map[hero.id]; if (wr === undefined) return; aSum += (1 - wr); aW += 1; });
      const avgE = eW > 0 ? eSum / eW : 0.5; const avgA = aW > 0 ? aSum / aW : 0.5;
      return { hero, score: aW > 0 ? (avgE * 0.7) + (avgA * 0.3) : avgE, allySynergy: aW > 0 ? avgA : null, details };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 10);
    status.textContent = enemies.length === 0 ? 'Топ-10 по общему винрейту:' : 'Топ-10 контр-пиков:';
    document.getElementById('recCount').textContent = `(${top.length})`;
    updateStats(enemies.length > 0 ? 0.52 : 0.5);
    list.innerHTML = top.map(item => {
      const pct = (item.score * 100).toFixed(1);
      let scoreClass = item.score >= 0.53 ? 'score-high' : (item.score < 0.48 ? 'score-low' : 'score-mid');
      const best = item.details.sort((a, b) => b.wr - a.wr).slice(0, 2).map(d => `${d.enemy} ${(d.wr * 100).toFixed(0)}%`).join(', ');
      const diff = getHeroDifficulty(item.hero.name);
      let detailText = best ? 'Против: ' + best : '';
      if (item.allySynergy !== null) detailText += (detailText ? ' · ' : '') + 'Синергия: ' + (item.allySynergy * 100).toFixed(0) + '%';
      if (!detailText) detailText = 'Нет данных';
      return `<div class="rec-item" data-hero-id="${item.hero.id}"><img src="${imgUrl(item.hero.name)}" /><div class="rec-info"><div class="rec-name-row"><div class="name">${displayName(item.hero)}</div><span class="difficulty ${diff.class}">${diff.label}</span></div><div class="detail">${detailText}</div></div><div class="rec-score ${scoreClass}">${pct}%</div></div>`;
    }).join('');
    list.querySelectorAll('.rec-item').forEach(item => item.addEventListener('click', () => window.open(dotabuffUrl(state.heroMap[Number(item.dataset.heroId)].name), '_blank')));
  } catch (e) { status.textContent = 'Ошибка.'; } finally { btn.disabled = false; }
}

async function exportDraft() {
  const btn = document.getElementById('exportBtn');
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Рисуем...';
  btn.disabled = true;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = 800; const height = 600;
  canvas.width = width * 2; canvas.height = height * 2;
  ctx.scale(2, 2);

  ctx.fillStyle = '#06080d'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, width - 4, height - 4);

  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px "Rajdhani", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DOTA 2 DRAFT', width / 2, 60);
  ctx.fillStyle = '#7c8aa0'; ctx.font = '16px "Inter", sans-serif'; ctx.fillText('Мой план на игру', width / 2, 90);

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = reject; img.src = url;
  });

  const drawColumn = async (heroIds, startX, title, color) => {
    const colWidth = 340; const colY = 130;
    ctx.fillStyle = color; ctx.font = 'bold 24px "Rajdhani", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, startX + colWidth / 2, colY);
    let currentY = colY + 30;
    if (heroIds.length === 0) { ctx.fillStyle = '#7c8aa0'; ctx.font = '14px "Inter", sans-serif'; ctx.fillText('Не выбраны', startX + colWidth / 2, currentY + 20); return; }
    for (const id of heroIds) {
      const hero = state.heroMap[id]; if (!hero) continue;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(startX, currentY, colWidth, 60);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(startX, currentY, colWidth, 60);
      const proxiedUrl = 'https://wsrv.nl/?url=' + encodeURIComponent(imgUrl(hero.name));
      try { const img = await loadImage(proxiedUrl); ctx.drawImage(img, startX + 10, currentY + 5, 50, 50); } 
      catch (e) { ctx.fillStyle = color; ctx.fillRect(startX + 10, currentY + 5, 50, 50); }
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px "Rajdhani", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(displayName(hero), startX + 75, currentY + 25);
      ctx.fillStyle = '#7c8aa0'; ctx.font = '12px "Inter", sans-serif'; ctx.fillText(translateRole(hero.roles ? hero.roles[0] : ''), startX + 75, currentY + 45);
      currentY += 70;
    }
  };

  try {
    await drawColumn(state.allyIds, 50, 'СОЮЗНИКИ', '#3ddc84');
    await drawColumn(state.enemyIds, width - 390, 'ВРАГИ', '#ff4d3d');
    ctx.textAlign = 'center'; ctx.fillStyle = '#7c8aa0'; ctx.font = '12px "Inter", sans-serif'; ctx.fillText('Сгенерировано в Dota 2 Draft Helper', width / 2, height - 30);
    const link = document.createElement('a'); link.download = 'dota-draft.png'; link.href = canvas.toDataURL('image/png'); link.click();
    playSound('success');
  } catch (err) { console.error('Ошибка отрисовки:', err); } finally { btn.innerHTML = originalText; btn.disabled = false; }
}

function renderAll() { renderSlots(); renderHeroGrid(document.getElementById('searchInput').value); }
function attachPanelGlow() { document.querySelectorAll('.glass').forEach(panel => panel.addEventListener('mousemove', e => { const rect = panel.getBoundingClientRect(); panel.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%'); panel.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%'); })); }

// ====== ИНИЦИАЛИЗАЦИЯ ИНТРО ======
function handleIntroScreen() { 
  const intro = document.getElementById('introScreen'); 
  if (!intro) return; 
  
  
  setTimeout(() => { 
    intro.classList.add('fade-out'); 
    setTimeout(() => { 
      intro.style.display = 'none'; 
      
      // Запускаем сайт
      loadHeroes();
      renderSlots();
      attachPanelGlow();
      
    }, 800); 
  }, 3000); 
}

function init() {
  handleIntroScreen(); // Запуск интро
  
  document.getElementById('searchInput').addEventListener('input', e => renderHeroGrid(e.target.value));
  document.getElementById('roleFilter').addEventListener('change', e => { state.roleFilter = e.target.value; renderHeroGrid(document.getElementById('searchInput').value); });
  document.getElementById('attrFilter').addEventListener('change', e => { state.attrFilter = e.target.value; renderHeroGrid(document.getElementById('searchInput').value); });
  document.getElementById('recommendBtn').addEventListener('click', showRecommendations);
  document.getElementById('exportBtn').addEventListener('click', exportDraft);
  document.getElementById('clearBtn').addEventListener('click', () => {
    playSound('remove');
    state.enemyIds = []; state.allyIds = []; state.activeSlot = null; state.roleFilter = ''; state.attrFilter = '';
    document.getElementById('roleFilter').value = ''; document.getElementById('attrFilter').value = '';
    document.getElementById('recList').innerHTML = ''; document.getElementById('recStatus').style.display = 'none';
    document.getElementById('recCount').textContent = ''; document.getElementById('welcomeScreen').style.display = 'block'; document.getElementById('statsPanel').style.display = 'none';
    renderAll();
  });
  document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => { playSound('click'); setMode(btn.dataset.team); }));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
