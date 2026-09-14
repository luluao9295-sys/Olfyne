(() => {
  const euro = (value) => Number(value).toLocaleString('fr-FR', { minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const priceHtml = (item, compact = false) => {
    if (item.price_eur == null) return compact ? '<strong>Prix à vérifier</strong>' : '<div class="price-line"><strong>Prix à vérifier</strong></div>';
    const label = `À partir de ${euro(item.price_eur)} €`;
    const size = item.price_volume ? item.price_volume : '';
    if (compact) return `<strong>${label}</strong>${size ? `<span>${size}</span>` : ''}`;
    return `<div class="price-line"><strong>${label}</strong>${size ? `<span>${size}</span>` : ''}</div><div class="price-source">${item.price_status === 'officiel' ? 'Prix officiel relevé' : 'Prix indicatif'}</div>`;
  };

  window.renderCards = function(items) {
    const grid = document.getElementById('resultGrid');
    if (!items.length) {
      grid.innerHTML = '<div class="empty">Aucun parfum pertinent trouvé pour cette recherche. Essayez avec d’autres notes ou une ambiance différente.</div>';
      return;
    }

    grid.innerHTML = items.slice(0, 12).map((item) => {
      const notes = (item.notes || []).slice(0, 4).map((note) => `<span>${pretty(note)}</span>`).join('');
      const index = perfumes.findIndex((p) => p.name === item.name && p.brand === item.brand);
      const visual = item.image_url
        ? `<div class="card-product-image"><img src="${item.image_url}" alt="${item.name} — ${item.brand}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('no-image');this.remove()"></div>`
        : '<div class="card-product-image no-image"></div>';

      return `
        <article class="card" data-index="${index}" tabindex="0" role="button" aria-label="Voir la fiche de ${item.name}">
          ${visual}
          <div class="match">${item.score}%</div>
          <h3>${item.name}</h3>
          <div class="brand-name">${item.brand}</div>
          ${priceHtml(item)}
          <div class="notes">${notes}</div>
          <div class="meta">${pretty((item.families || [])[0] || 'signature')} · ${pretty((item.seasons || [])[0] || 'toute saison')}</div>
          <div class="card-cta">Voir la fiche <span>↗</span></div>
        </article>`;
    }).join('');

    grid.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPerfume(Number(card.dataset.index));
        }
      });
    });
  };

  window.openPerfume = function(index) {
    const perfume = perfumes[index];
    if (!perfume) return;

    const score = currentResults.find((p) => p.name === perfume.name && p.brand === perfume.brand)?.score || 0;
    const matched = getMatchedCriteria(perfume);
    const intensity = inferIntensity(perfume);
    const sillage = inferSillage(perfume);
    const noteTags = (perfume.notes || []).map((x) => `<span>${pretty(x)}</span>`).join('');
    const familyTags = (perfume.families || []).map((x) => `<span>${pretty(x)}</span>`).join('');
    const officialLink = perfume.official_url
      ? `<a class="official-link" href="${perfume.official_url}" target="_blank" rel="noopener noreferrer" aria-label="Voir ${perfume.name} sur le site officiel français de ${perfume.brand}">Voir sur le site officiel français <span>↗</span></a>`
      : '';
    const imageBlock = perfume.image_url
      ? `<div class="modal-product-image"><img src="${perfume.image_url}" alt="${perfume.name} — ${perfume.brand}" referrerpolicy="no-referrer" onerror="this.parentElement.outerHTML='<div class=&quot;modal-bottle&quot;><span>${perfume.brand}</span></div>'"></div>`
      : `<div class="modal-bottle" aria-hidden="true"><span>${perfume.brand}</span></div>`;

    document.querySelector('.perfume-modal')?.remove();
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
              <div class="modal-price">${priceHtml(perfume, true)}</div>
              <div class="price-source">${perfume.price_eur == null ? 'Prix en cours de vérification' : perfume.price_status === 'officiel' ? 'Prix officiel relevé — susceptible d’évoluer' : 'Prix indicatif — susceptible d’évoluer'}</div>
              ${officialLink}
            </div>
            ${imageBlock}
          </div>
          <div class="modal-grid">
            <section><h3>Notes principales</h3><div class="modal-tags">${noteTags}</div></section>
            <section><h3>Famille olfactive</h3><div class="modal-tags">${familyTags}</div></section>
            <section class="modal-stats">
              <div><span>Saison</span><strong>${(perfume.seasons || []).map(pretty).join(' · ') || 'Toutes'}</strong></div>
              <div><span>Occasion</span><strong>${(perfume.occasions || []).map(pretty).join(' · ') || 'Polyvalent'}</strong></div>
              <div><span>Intensité</span><strong>${intensity}</strong></div>
              <div><span>Sillage</span><strong>${sillage}</strong></div>
              <div><span>Prix</span>${priceHtml(perfume, true)}</div>
            </section>
            <section class="why-box"><h3>Pourquoi OLFYNE le recommande</h3><p>${matched.length ? `Il correspond à votre recherche sur : ${matched.map(pretty).join(', ')}.` : 'Ce parfum fait partie de la sélection éditoriale OLFYNE.'}</p></section>
          </div>
        </div>
      </div>`);
    document.body.classList.add('modal-open');
  };

  window.applyFilters = function() {
    const season = document.getElementById('seasonFilter').value;
    const occasion = document.getElementById('occasionFilter').value;
    const price = document.getElementById('priceFilter').value;
    const sort = document.getElementById('sortFilter').value;
    let filtered = [...currentResults];
    if (season) filtered = filtered.filter((item) => (item.seasons || []).includes(season));
    if (occasion) filtered = filtered.filter((item) => (item.occasions || []).includes(occasion));
    if (price) filtered = filtered.filter((item) => Number(item.price_level || 0) === Number(price));
    if (sort === 'priceAsc') filtered.sort((a, b) => (a.price_eur ?? Infinity) - (b.price_eur ?? Infinity));
    else if (sort === 'priceDesc') filtered.sort((a, b) => (b.price_eur ?? -1) - (a.price_eur ?? -1));
    else filtered.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    renderCards(filtered);
  };
})();
