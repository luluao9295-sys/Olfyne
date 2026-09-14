(() => {
  const nativeFetch = window.fetch.bind(window);

  const pagePreview = (url) => {
    if (!url) return '';
    return `https://image.thum.io/get/width/700/crop/700/noanimate/${url}`;
  };

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('data/perfumes.json')) return nativeFetch(input, init);

    const linkFiles = [
      'data/official-links.json',
      'data/official-links-2.json',
      'data/official-links-3.json',
      'data/official-links-4.json',
      'data/official-links-5.json',
      'data/official-links-6.json',
      'data/official-links-7.json',
      'data/official-links-8.json',
      'data/official-links-9.json'
    ];
    const [perfumesResponse, metaResponse, ...linkResponses] = await Promise.all([
      nativeFetch(input, init),
      nativeFetch('data/catalog-meta.json'),
      ...linkFiles.map((file) => nativeFetch(file))
    ]);
    const perfumes = await perfumesResponse.json();
    const meta = metaResponse.ok ? await metaResponse.json() : {};
    const linkSets = await Promise.all(linkResponses.map(async (response) => response.ok ? response.json() : {}));

    const merged = perfumes.map((perfume) => {
      const key = `${perfume.name}|${perfume.brand}`;
      const linkOverrides = Object.assign({}, ...linkSets.map((set) => set[key] || {}));
      const item = {
        ...perfume,
        ...(meta[key] || {}),
        ...linkOverrides
      };

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