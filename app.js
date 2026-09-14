let dictionary = null;
let perfumes = [];
let currentResults = [];
let lastIntent = { positive: [], negative: [] };

const normalize = (value) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, "'")
  .replace(/[^a-z0-9'\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const categoryWeight = {
  notes: 1,
  familles: 0.85,
  sensations: 0.72,
  saisons: 0.62,
  occasions: 0.56,
  performance: 0.68
};

async function boot() {
  const [keywordsRes, perfumesRes] = await Promise.all([
    fetch('data/keywords.json'),
    fetch('data/perfumes.json')
  ]);

  dictionary = await keywordsRes.json();
  perfumes = await perfumesRes.json();

  renderFeatured();
  bindUI();
}

function bindUI() {
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search(input.value);
  });

  document.querySelectorAll('[data-query]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.query;
      search(button.dataset.query);
    });
  });

  ['seasonFilter', 'occasionFilter', 'priceFilter', 'sortFilter'].forEach((id) => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('seasonFilter').value = '';
    document.getElementById('occasionFilter').value = '';
    document.getElementById('priceFilter').value = '';
    document.getElementById('sortFilter').value = 'match';
    applyFilters();
  });

  document.addEventListener('click', (event) => {
    const card = event.target.closest('.card[data-index]');
    if (card) openPerfume(Number(card.dataset.index));

    if (event.target.matches('.perfume-modal, .modal-close')) closePerfume();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePerfume();
  });
}

function extractIntent(rawQuery) {
  const query = normalize(rawQuery);
  const positive = [];
  const negative = [];

  Object.entries(dictionary).forEach(([category, entries]) => {
    if (category === 'negations') return;
    if (Array.isArray(entries)) return;

    Object.entries(entries).forEach(([canonical, synonyms]) => {
      const matchedSynonym = synonyms.find((synonym) => query.includes(normalize(synonym)));
      if (!matchedSynonym) return;

      const token = normalize(matchedSynonym);
      const idx = query.indexOf(token);
      const before = query.slice(Math.max(0, idx - 18), idx);
      const isNegative = dictionary.negations.some((neg) => before.includes(normalize(neg)));
      const target = isNegative ? negative : positive;

      target.push({
        category,
        canonical,
        weight: categoryWeight[category] || 0.5
      });
    });
  });

  if (query.includes('pas trop sucre') || query.includes('peu sucre')) {
    negative.push({ category: 'sensations', canonical: 'sucre', weight: 0.8 });
  }

  return { query, positive, negative };
}

function scorePerfume(perfume, intent) {
  if (!intent.positive.length && !intent.negative.length) return 0;

  const searchable = getSearchable(perfume);
  let earned = 0;
  let possible = intent.positive.reduce((sum, item) => sum + item.weight, 0);
  let penalty = 0;

  intent.positive.forEach((item) => {
    if ((searchable[item.category] || []).includes(item.canonical)) earned += item.weight;
  });

  intent.negative.forEach((item) => {
    if ((searchable[item.category] || []).includes(item.canonical)) penalty += item.weight;
  });

  if (possible === 0) possible = 1;
  const raw = ((earned - penalty * 0.9) / possible) * 100;
  return Math.max(0, Math.min(99, Math.round(raw)));
}

function getSearchable(perfume) {
  return {
    notes: perfume.notes || [],
    familles: perfume.families || [],
    sensations: perfume.sensations || [],
    saisons: perfume.seasons || [],
    occasions: perfume.occasions || [],
    performance: perfume.performance || []
  };
}

function search(rawQuery) {
  const summary = document.getElementById('resultSummary');
  const query = rawQuery.trim();

  if (!query) {
    summary.textContent = 'Écrivez quelques mots pour lancer la recherche.';
    renderFeatured();
    return;
  }

  lastIntent = extractIntent(query);
  currentResults = perfumes
    .map((perfume) => ({ ...perfume, score: scorePerfume(perfume, lastIntent) }))
    .filter((perfume) => perfume.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!currentResults.length) {
    currentResults = perfumes.slice(0, 6).map((p) => ({ ...p, score: 0 }));
  }

  const understood = lastIntent.positive.map((x) => x.canonical).slice(0, 6);
  summary.textContent = understood.length
    ? `OLFYNE comprend : ${understood.join(' · ')}`
    : `Recherche : “${query}”`;

  applyFilters();
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyFilters() {
  const season = document.getElementById('seasonFilter').value;
  const occasion = document.getElementById('occasionFilter').value;
  const price = document.getElementById('priceFilter').value;
  const sort = document.getElementById('sortFilter').value;

  let filtered = [...currentResults];

  if (season) filtered = filtered.filter((item) => (item.seasons || []).includes(season));
  if (occasion) filtered = filtered.filter((item) => (item.occasions || []).includes(occasion));
  if (price) filtered = filtered.filter((item) => Number(item.price_level || 0) === Number(price));

  if (sort === 'priceAsc') filtered.sort((a, b) => Number(a.price_level || 0) - Number(b.price_level || 0));
  else if (sort === 'priceDesc') filtered.sort((a, b) => Number(b.price_level || 0) - Number(a.price_level || 0));
  else filtered.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  renderCards(filtered);
}

function renderFeatured() {
  lastIntent = { positive: [], negative: [] };
  currentResults = perfumes.slice(0, 6).map((perfume, index) => ({
    ...perfume,
    score: [94, 91, 88, 86, 83, 81][index] || 80
  }));
  renderCards(currentResults);
}

function renderCards(items) {
  const grid = document.getElementById('resultGrid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty">Aucun parfum ne correspond à ces filtres.</div>';
    return;
  }

  grid.innerHTML = items.slice(0, 12).map((item) => {
    const notes = (item.notes || []).slice(0, 4).map((note) => `<span>${pretty(note)}</span>`).join('');
    const priceLabel = ['','€','€€','€€€','€€€€','€€€€€'][Number(item.price_level || 0)] || '';
    const index = perfumes.findIndex((p) => p.name === item.name && p.brand === item.brand);

    return `
      <article class="card" data-index="${index}" tabindex="0" role="button" aria-label="Voir la fiche de ${item.name}">
        <div class="match">${item.score}%</div>
        <h3>${item.name}</h3>
        <div class="brand-name">${item.brand}</div>
        <div class="notes">${notes}</div>
        <div class="meta">${pretty((item.families || [])[0] || 'signature')} · ${pretty((item.seasons || [])[0] || 'toute saison')} · ${priceLabel}</div>
        <div class="card-cta">Voir la fiche <span>↗</span></div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPerfume(Number(card.dataset.index));
      }
    });
  });
}

function openPerfume(index) {
  const perfume = perfumes[index];
  if (!perfume) return;

  const score = currentResults.find((p) => p.name === perfume.name && p.brand === perfume.brand)?.score || 0;
  const matched = getMatchedCriteria(perfume);
  const priceLabel = ['','€','€€','€€€','€€€€','€€€€€'][Number(perfume.price_level || 0)] || '—';
  const intensity = inferIntensity(perfume);
  const sillage = inferSillage(perfume);
  const noteTags = (perfume.notes || []).map((x) => `<span>${pretty(x)}</span>`).join('');
  const familyTags = (perfume.families || []).map((x) => `<span>${pretty(x)}</span>`).join('');
  const officialLink = perfume.official_url
    ? `<a class="official-link" href="${perfume.official_url}" target="_blank" rel="noopener noreferrer">Voir sur le site officiel <span>↗</span></a>`
    : '';

  const existing = document.querySelector('.perfume-modal');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', `
    <div class="perfume-modal" role="dialog" aria-modal="true" aria-label="Fiche parfum ${perfume.name}">
      <div class="modal-panel">
        <button class="modal-close" aria-label="Fermer">×</button>
        <div class="modal-topline">FICHE OLFYNE</div>
        <div class="modal-hero">
          <div>
            <div class="modal-score">${score ? `${score}% MATCH` : 'DÉCOUVERTE'}</div>
            <h2>${perfume.name}</h2>
            <p class="modal-brand">${perfume.brand}</p>
            ${officialLink}
          </div>
          <div class="modal-bottle" aria-hidden="true"><span>${perfume.brand}</span></div>
        </div>

        <div class="modal-grid">
          <section>
            <h3>Notes principales</h3>
            <div class="modal-tags">${noteTags}</div>
          </section>
          <section>
            <h3>Famille olfactive</h3>
            <div class="modal-tags">${familyTags}</div>
          </section>
          <section class="modal-stats">
            <div><span>Saison</span><strong>${(perfume.seasons || []).map(pretty).join(' · ') || 'Toutes'}</strong></div>
            <div><span>Occasion</span><strong>${(perfume.occasions || []).map(pretty).join(' · ') || 'Polyvalent'}</strong></div>
            <div><span>Intensité</span><strong>${intensity}</strong></div>
            <div><span>Sillage</span><strong>${sillage}</strong></div>
            <div><span>Prix</span><strong>${priceLabel}</strong></div>
          </section>
          <section class="why-box">
            <h3>Pourquoi OLFYNE le recommande</h3>
            <p>${matched.length ? `Il correspond à votre recherche sur : ${matched.map(pretty).join(', ')}.` : 'Ce parfum fait partie de la sélection éditoriale OLFYNE.'}</p>
          </section>
        </div>
      </div>
    </div>
  `);

  document.body.classList.add('modal-open');
}

function closePerfume() {
  const modal = document.querySelector('.perfume-modal');
  if (modal) modal.remove();
  document.body.classList.remove('modal-open');
}

function getMatchedCriteria(perfume) {
  const searchable = getSearchable(perfume);
  return lastIntent.positive
    .filter((item) => (searchable[item.category] || []).includes(item.canonical))
    .map((item) => item.canonical)
    .slice(0, 6);
}

function inferIntensity(perfume) {
  const sensations = perfume.sensations || [];
  if (sensations.includes('puissant')) return 'Intense';
  if ((perfume.performance || []).includes('discret')) return 'Légère';
  return 'Modérée';
}

function inferSillage(perfume) {
  const performance = perfume.performance || [];
  if (performance.includes('fort_sillage')) return 'Fort';
  if (performance.includes('discret')) return 'Discret';
  return 'Modéré';
}

function pretty(value) {
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

boot().catch((error) => {
  console.error(error);
  document.getElementById('resultGrid').innerHTML = '<div class="empty">Impossible de charger les données OLFYNE.</div>';
});