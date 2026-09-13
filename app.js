let dictionary = null;
let perfumes = [];

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

  const searchable = {
    notes: perfume.notes || [],
    familles: perfume.families || [],
    sensations: perfume.sensations || [],
    saisons: perfume.seasons || [],
    occasions: perfume.occasions || [],
    performance: perfume.performance || []
  };

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

function search(rawQuery) {
  const summary = document.getElementById('resultSummary');
  const query = rawQuery.trim();

  if (!query) {
    summary.textContent = 'Écrivez quelques mots pour lancer la recherche.';
    renderFeatured();
    return;
  }

  const intent = extractIntent(query);
  const ranked = perfumes
    .map((perfume) => ({ ...perfume, score: scorePerfume(perfume, intent) }))
    .filter((perfume) => perfume.score > 0)
    .sort((a, b) => b.score - a.score);

  const understood = intent.positive.map((x) => x.canonical).slice(0, 6);
  summary.textContent = understood.length
    ? `OLFYNE comprend : ${understood.join(' · ')}`
    : `Recherche : “${query}”`;

  renderCards(ranked.length ? ranked : perfumes.slice(0, 6).map((p) => ({ ...p, score: 0 })));
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFeatured() {
  const featured = perfumes.slice(0, 6).map((perfume, index) => ({
    ...perfume,
    score: [94, 91, 88, 86, 83, 81][index] || 80
  }));
  renderCards(featured);
}

function renderCards(items) {
  const grid = document.getElementById('resultGrid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty">Aucune correspondance pour le moment.</div>';
    return;
  }

  grid.innerHTML = items.slice(0, 6).map((item) => {
    const notes = (item.notes || []).slice(0, 4)
      .map((note) => `<span>${pretty(note)}</span>`)
      .join('');

    return `
      <article class="card">
        <div class="match">${item.score}%</div>
        <h3>${item.name}</h3>
        <div class="brand-name">${item.brand}</div>
        <div class="notes">${notes}</div>
        <div class="meta">${pretty((item.families || [])[0] || 'signature')} · ${pretty((item.seasons || [])[0] || 'toute saison')}</div>
      </article>
    `;
  }).join('');
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
