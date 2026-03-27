const modeSelect = document.getElementById('mode');
const stateEl = document.getElementById('state');
const createMatchButton = document.getElementById('createMatch');
const resetMatchButton = document.getElementById('resetMatch');
const addPlayerButton = document.getElementById('addPlayer');
const playerNameInput = document.getElementById('playerName');
const teamIdSelect = document.getElementById('teamId');
const playerSelect = document.getElementById('playerSelect');
const stockCount = document.getElementById('stockCount');
const discardTop = document.getElementById('discardTop');
const turnInfo = document.getElementById('turnInfo');
const handEl = document.getElementById('hand');
const meldsA = document.getElementById('meldsA');
const meldsB = document.getElementById('meldsB');
const drawCardsButton = document.getElementById('drawCards');
const drawDiscardButton = document.getElementById('drawDiscard');
const meldCardsButton = document.getElementById('meldCards');
const stageOpenGroupButton = document.getElementById('stageOpenGroup');
const openTableButton = document.getElementById('openTable');
const clearOpenGroupsButton = document.getElementById('clearOpenGroups');
const pendingOpenGroupsEl = document.getElementById('pendingOpenGroups');
const meldTargetSelect = document.getElementById('meldTargetSelect');
const extendMeldButton = document.getElementById('extendMeld');
const discardCardButton = document.getElementById('discardCard');
const goOutButton = document.getElementById('goOut');

let activeMatch = null;
let selectedCardIds = new Set();
let pendingOpenGroups = [];
let pendingOpenGroupsPlayerId = null;
let refreshPromise = null;

const POLL_INTERVAL_MS = 1000;

const SUIT_ORDER = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
const RANK_ORDER = { A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, J: 10, Q: 11, K: 12, JOKER: 13 };

// ─── Suit SVG helpers ────────────────────────────────────────────────────────

const SUIT_FILES = {
  hearts: '/assets/suits/hearts.svg',
  diamonds: '/assets/suits/diamonds.svg',
  clubs: '/assets/suits/clubs.svg',
  spades: '/assets/suits/spades.svg',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);
const SUIT_CHARS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

function suitImg(suit, cls = 'card-suit-icon') {
  if (!suit) return '';
  return `<img class="${cls}" src="${SUIT_FILES[suit]}" alt="${suit}" />`;
}

function cardColorClass(card) {
  if (card.rank === 'JOKER') return 'joker';
  return RED_SUITS.has(card.suit) ? 'red' : 'black';
}

function rankLabel(card) {
  if (card.rank === 'JOKER') return '🃏';
  return card.rank;
}

function cardLabel(card) {
  if (!card) return '?';
  if (card.rank === 'JOKER') return '🃏';
  return `${card.rank}${SUIT_CHARS[card.suit] ?? ''}`;
}

function selectedPlayer() {
  return activeMatch?.players.find((player) => player.id === playerSelect.value) || null;
}

function compareCards(a, b) {
  const rankDelta = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
  if (rankDelta !== 0) return rankDelta;

  const suitDelta = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
  if (suitDelta !== 0) return suitDelta;

  return a.id.localeCompare(b.id);
}

function compareCardCollections(cardsA, cardsB) {
  const sortedA = [...cardsA].sort(compareCards);
  const sortedB = [...cardsB].sort(compareCards);
  const maxLength = Math.max(sortedA.length, sortedB.length);

  for (let index = 0; index < maxLength; index += 1) {
    const cardA = sortedA[index];
    const cardB = sortedB[index];

    if (!cardA && !cardB) return 0;
    if (!cardA) return 1;
    if (!cardB) return -1;

    const delta = compareCards(cardA, cardB);
    if (delta !== 0) return delta;
  }

  return 0;
}

function compareMeldsBySize(a, b) {
  const cardDelta = compareCardCollections(a.cards, b.cards);
  if (cardDelta !== 0) return cardDelta;

  const sizeDelta = a.cards.length - b.cards.length;
  if (sizeDelta !== 0) return sizeDelta;

  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.id.localeCompare(b.id);
}

function clearPendingOpenGroups() {
  pendingOpenGroups = [];
  pendingOpenGroupsPlayerId = playerSelect.value || null;
}

function syncPendingOpenGroups() {
  const currentPlayerId = playerSelect.value || null;

  if (!activeMatch?.game || !currentPlayerId) {
    pendingOpenGroups = [];
    pendingOpenGroupsPlayerId = currentPlayerId;
    return;
  }

  if (pendingOpenGroupsPlayerId && pendingOpenGroupsPlayerId !== currentPlayerId) {
    pendingOpenGroups = [];
  }

  pendingOpenGroupsPlayerId = currentPlayerId;

  const handIds = new Set((activeMatch.game.hands[currentPlayerId] || []).map((card) => card.id));
  pendingOpenGroups = pendingOpenGroups.filter((group) => group.every((cardId) => handIds.has(cardId)));
}

function stagedOpenCardIds() {
  const currentPlayerId = playerSelect.value || null;
  if (!currentPlayerId || pendingOpenGroupsPlayerId !== currentPlayerId) {
    return new Set();
  }

  return new Set(pendingOpenGroups.flat());
}

function visibleHandCards() {
  if (!activeMatch?.game || !playerSelect.value) return [];

  syncPendingOpenGroups();
  const hiddenCardIds = stagedOpenCardIds();

  return [...(activeMatch.game.hands[playerSelect.value] || [])]
    .filter((card) => !hiddenCardIds.has(card.id))
    .sort(compareCards);
}

// ─── Playing card element ────────────────────────────────────────────────────

function createCardElement(card, options = {}) {
  const div = document.createElement('button');
  div.className = `playing-card ${cardColorClass(card)}`;
  div.dataset.cardId = card.id;
  div.type = 'button';

  if (options.markSelected !== false && selectedCardIds.has(card.id)) {
    div.classList.add('selected');
  }

  if (card.rank === 'JOKER') {
    div.innerHTML = `
      <div class="card-corner tl"><span class="card-rank">🃏</span></div>
      <span style="font-size:26px">🃏</span>
      <div class="card-corner br"><span class="card-rank">🃏</span></div>`;
  } else {
    div.innerHTML = `
      <div class="card-corner tl">
        <span class="card-rank">${rankLabel(card)}</span>
        ${suitImg(card.suit)}
      </div>
      ${suitImg(card.suit, 'card-suit-center')}
      <div class="card-corner br">
        <span class="card-rank">${rankLabel(card)}</span>
        ${suitImg(card.suit)}
      </div>`;
  }

  if (options.selectable !== false) {
    div.addEventListener('click', () => {
      if (selectedCardIds.has(card.id)) {
        selectedCardIds.delete(card.id);
        div.classList.remove('selected');
      } else {
        selectedCardIds.add(card.id);
        div.classList.add('selected');
      }
    });
  }

  return div;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// ─── Render helpers ──────────────────────────────────────────────────────────

function renderState(payload) {
  stateEl.textContent = JSON.stringify(payload, null, 2);
}

function renderPlayerOptions(players) {
  const current = playerSelect.value;
  playerSelect.innerHTML = '';

  if (!players.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sem jogadores';
    playerSelect.append(option);
    return;
  }

  for (const player of players) {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = `${player.name} (Equipe ${player.teamId})`;
    playerSelect.append(option);
  }

  if (players.find((p) => p.id === current)) playerSelect.value = current;
}

function renderPendingOpenGroups() {
  syncPendingOpenGroups();

  pendingOpenGroupsEl.innerHTML = '';
  pendingOpenGroupsEl.classList.toggle('pending-open-groups', pendingOpenGroups.length > 0);

  if (!pendingOpenGroups.length) {
    pendingOpenGroupsEl.textContent = 'Nenhum grupo separado';
    return;
  }

  const hand = activeMatch?.game?.hands[playerSelect.value] || [];
  const byId = new Map(hand.map((card) => [card.id, card]));

  pendingOpenGroups.forEach((group, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pending-open-group';

    const title = document.createElement('div');
    title.className = 'pending-open-group-title';
    title.textContent = `Grupo ${index + 1}`;
    wrapper.append(title);

    const cardsRow = document.createElement('div');
    cardsRow.className = 'pending-open-group-cards';

    group
      .map((cardId) => byId.get(cardId))
      .filter(Boolean)
      .sort(compareCards)
      .forEach((card) => {
        cardsRow.append(createCardElement(card, { selectable: false, markSelected: false }));
      });

    wrapper.append(cardsRow);
    pendingOpenGroupsEl.append(wrapper);
  });
}

function renderMeldTargetOptions() {
  const current = meldTargetSelect.value;
  const teamId = selectedPlayer()?.teamId;
  const melds = teamId && activeMatch?.game ? (activeMatch.game.teamMelds?.[teamId] || []) : [];

  meldTargetSelect.innerHTML = '';

  if (!melds.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhum jogo da equipe';
    meldTargetSelect.append(option);
    return;
  }

  for (const meld of melds) {
    const option = document.createElement('option');
    option.value = meld.id;
    const typeLabel = meld.type === 'set' ? 'Trinca/Canastra' : 'Sequencia';
    const preview = meld.cards.slice(0, 4).map((card) => cardLabel(card)).join(' ');
    option.textContent = `${typeLabel} · ${meld.cards.length} cartas · ${preview}`;
    meldTargetSelect.append(option);
  }

  if (melds.find((meld) => meld.id === current)) meldTargetSelect.value = current;
}

function renderHand() {
  handEl.innerHTML = '';

  if (!activeMatch?.game || !playerSelect.value) {
    selectedCardIds = new Set();
    handEl.textContent = 'Aguardando inicio da rodada...';
    return;
  }

  const cards = visibleHandCards();
  const handIds = new Set(cards.map((card) => card.id));
  selectedCardIds = new Set([...selectedCardIds].filter((cardId) => handIds.has(cardId)));

  if (!cards.length) {
    handEl.textContent = 'Nenhuma carta visivel na mao.';
    return;
  }

  for (const card of cards) {
    handEl.append(createCardElement(card));
  }
}

function renderMelds(container, melds) {
  container.innerHTML = '';
  if (!melds?.length) {
    container.textContent = 'Nenhum jogo baixado';
    return;
  }

  const sortedMelds = [...melds].sort(compareMeldsBySize);
  for (const meld of sortedMelds) {
    const row = document.createElement('div');
    row.className = 'meld-item';

    const label = document.createElement('span');
    label.className = 'meld-type';
    label.textContent = `${meld.type === 'set' ? 'Trinca/Canastra' : 'Sequencia'} · ${meld.cards.length} cartas`;
    row.append(label);

    const cards = document.createElement('div');
    cards.className = 'meld-cards';
    const sortedCards = [...meld.cards].sort(compareCards);
    for (const card of sortedCards) {
      cards.append(createCardElement(card, { selectable: false, markSelected: false }));
    }
    row.append(cards);
    container.append(row);
  }
}

function renderDiscardTop(game) {
  const total = (game.discardDown?.length ?? 0) + (game.discardUp?.length ?? 0);
  const topCard = game.discardUp?.length ? game.discardUp[game.discardUp.length - 1] : null;

  discardTop.innerHTML = '';

  if (topCard) {
    const mini = createCardElement(topCard, { selectable: false, markSelected: false });
    mini.classList.add('discard-top-mini');
    if (game.discardBlocked) mini.classList.add('discard-top-mini--blocked');
    discardTop.append(mini);
    discardTop.classList.add('pile--has-card');
  } else {
    discardTop.classList.remove('pile--has-card');
  }

  const label = document.createElement('span');
  label.className = 'discard-top-label';
  label.textContent = `${total} carta${total !== 1 ? 's' : ''}`;
  discardTop.append(label);

  if (game.discardBlocked) discardTop.classList.add('highlight');
  else discardTop.classList.remove('highlight');
}

function renderBoard() {
  if (!activeMatch?.game) {
    stockCount.textContent = '0';
    discardTop.innerHTML = '<span class="discard-top-label">-</span>';
    discardTop.classList.remove('pile--has-card', 'highlight');
    turnInfo.textContent = 'Aguardando jogadores';
    renderMelds(meldsA, []);
    renderMelds(meldsB, []);
    renderHand();
    renderMeldTargetOptions();
    renderPendingOpenGroups();
    return;
  }

  const game = activeMatch.game;

  stockCount.textContent = String(game.stock.length);
  renderDiscardTop(game);

  const turnPlayer = activeMatch.players.find((p) => p.id === game.currentPlayerId);
  const phaseLabel = game.phase === 'must_draw' ? 'Comprar' : 'Jogar/Descartar';
  turnInfo.textContent = turnPlayer
    ? `${turnPlayer.name} (Eq. ${turnPlayer.teamId}) — ${phaseLabel}`
    : phaseLabel;

  renderMelds(meldsA, game.teamMelds?.A);
  renderMelds(meldsB, game.teamMelds?.B);
  renderHand();
  renderMeldTargetOptions();
  renderPendingOpenGroups();
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadModes() {
  const result = await request('/matches/modes');
  modeSelect.innerHTML = '';
  for (const mode of result.data.modes || []) {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.append(option);
  }
}

async function refreshState() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const result = await request('/matches/active');
    activeMatch = result.data.match || null;
    renderPlayerOptions(activeMatch?.players || []);
    renderBoard();
    renderState(result.data);
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function startAutoRefresh() {
  setInterval(() => {
    void refreshState();
  }, POLL_INTERVAL_MS);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

createMatchButton.addEventListener('click', async () => {
  const result = await request('/matches', { method: 'POST', body: JSON.stringify({ mode: modeSelect.value }) });
  if (!result.ok) alert(`Erro ao criar partida: ${result.data.error || result.status}`);
  await refreshState();
});

resetMatchButton.addEventListener('click', async () => {
  await request('/matches/active/reset', { method: 'POST' });
  await refreshState();
});

addPlayerButton.addEventListener('click', async () => {
  const name = playerNameInput.value.trim();
  if (!name) { alert('Informe um nome valido.'); return; }
  const result = await request('/matches/active/players', {
    method: 'POST',
    body: JSON.stringify({ name, teamId: teamIdSelect.value }),
  });
  if (!result.ok) alert(`Erro ao entrar: ${result.data.error || result.status}`);
  playerNameInput.value = '';
  await refreshState();
});

playerSelect.addEventListener('change', () => {
  clearPendingOpenGroups();
  renderHand();
  renderMeldTargetOptions();
  renderPendingOpenGroups();
});

drawCardsButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  const result = await request('/matches/active/draw', { method: 'POST', body: JSON.stringify({ playerId: playerSelect.value }) });
  if (!result.ok) alert(`Erro ao comprar: ${result.data.error || result.status}`);
  await refreshState();
});

drawDiscardButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  const result = await request('/matches/active/draw-discard', { method: 'POST', body: JSON.stringify({ playerId: playerSelect.value }) });
  if (!result.ok) alert(`Nao pode comprar o lixo: ${result.data.error || result.status}`);
  await refreshState();
});

meldCardsButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  if (selectedCardIds.size < 3) { alert('Selecione ao menos 3 cartas para baixar.'); return; }
  const result = await request('/matches/active/meld', {
    method: 'POST',
    body: JSON.stringify({ playerId: playerSelect.value, cardIds: [...selectedCardIds] }),
  });
  if (!result.ok) alert(`Erro ao baixar: ${result.data.error || result.status}`);
  await refreshState();
});

stageOpenGroupButton.addEventListener('click', () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  if (selectedCardIds.size < 3) { alert('Selecione ao menos 3 cartas para separar um grupo.'); return; }

  syncPendingOpenGroups();
  const usedCardIds = new Set(pendingOpenGroups.flat());
  const newGroup = [...selectedCardIds];

  if (newGroup.some((cardId) => usedCardIds.has(cardId))) {
    alert('Uma ou mais cartas ja foram separadas para outro grupo.');
    return;
  }

  pendingOpenGroups.push(newGroup);
  pendingOpenGroupsPlayerId = playerSelect.value;
  selectedCardIds = new Set([...selectedCardIds].filter((cardId) => !newGroup.includes(cardId)));
  renderPendingOpenGroups();
  renderHand();
});

clearOpenGroupsButton.addEventListener('click', () => {
  clearPendingOpenGroups();
  renderPendingOpenGroups();
  renderHand();
});

openTableButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }

  syncPendingOpenGroups();
  if (!pendingOpenGroups.length) { alert('Separe ao menos um grupo para abrir a mesa.'); return; }

  const result = await request('/matches/active/open-table', {
    method: 'POST',
    body: JSON.stringify({ playerId: playerSelect.value, cardGroups: pendingOpenGroups }),
  });

  if (!result.ok) {
    alert(`Erro ao abrir a mesa: ${result.data.error || result.status}`);
  } else {
    clearPendingOpenGroups();
  }

  await refreshState();
});

extendMeldButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  if (!meldTargetSelect.value) { alert('Selecione um jogo da equipe para estender.'); return; }
  if (selectedCardIds.size === 0) { alert('Selecione ao menos 1 carta para adicionar ao jogo.'); return; }

  const result = await request('/matches/active/meld/extend', {
    method: 'POST',
    body: JSON.stringify({
      playerId: playerSelect.value,
      meldId: meldTargetSelect.value,
      cardIds: [...selectedCardIds],
    }),
  });

  if (!result.ok) alert(`Erro ao estender jogo: ${result.data.error || result.status}`);
  await refreshState();
});

discardCardButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  if (selectedCardIds.size !== 1) { alert('Selecione exatamente 1 carta para descartar.'); return; }
  const [cardId] = [...selectedCardIds];
  const result = await request('/matches/active/discard', {
    method: 'POST',
    body: JSON.stringify({ playerId: playerSelect.value, cardId }),
  });
  if (!result.ok) alert(`Erro ao descartar: ${result.data.error || result.status}`);
  await refreshState();
});

goOutButton.addEventListener('click', async () => {
  if (!playerSelect.value) { alert('Selecione um jogador local.'); return; }
  if (selectedCardIds.size !== 1) { alert('Selecione 1 carta para descartar e bater.'); return; }
  const [cardId] = [...selectedCardIds];
  const result = await request('/matches/active/go-out', {
    method: 'POST',
    body: JSON.stringify({ playerId: playerSelect.value, cardId }),
  });
  if (!result.ok) {
    alert(`Nao pode bater: ${result.data.error || result.status}`);
  } else {
    const { scores, winType } = result.data;
    const lines = Object.values(scores).map(s => `Equipe ${s.teamId}: ${s.total} pts`).join('\n');
    alert(`Batida ${winType}!\n\n${lines}`);
  }
  await refreshState();
});

await loadModes();
await refreshState();
startAutoRefresh();

