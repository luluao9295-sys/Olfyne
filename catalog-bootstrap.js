(() => {
  const nativeFetch = window.fetch.bind(window);

  const pagePreview = (url) => {
    if (!url) return '';
    return `https://image.thum.io/get/width/700/crop/700/noanimate/${url}`;
  };

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('data/perfumes.json')) return nativeFetch(input, init);

    const [perfumesResponse, metaResponse] = await Promise.all([
      nativeFetch(input, init),
      nativeFetch('data/catalog-meta.json')
    ]);
    const perfumes = await perfumesResponse.json();
    const meta = metaResponse.ok ? await metaResponse.json() : {};
    const merged = perfumes.map((perfume) => {
      const override = meta[`${perfume.name}|${perfume.brand}`] || {};
      const item = {
        ...perfume,
        ...override
      };

      // Aucune fiche ne reste sans visuel : on privilégie toujours la vraie
      // photo produit renseignée, puis un aperçu de la page officielle.
      if (!item.image_url && item.official_url) {
        item.image_url = pagePreview(item.official_url);
        item.image_status = 'official-page-preview';
      }

      return item;
    });
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();