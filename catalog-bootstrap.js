(() => {
  const nativeFetch = window.fetch.bind(window);

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
      'data/official-links-9.json',
      'data/official-links-10.json',
      'data/official-links-11.json'
    ];

    const [perfumesResponse, metaResponse, replacementsResponse, disabledResponse, ...linkResponses] = await Promise.all([
      nativeFetch(input, init),
      nativeFetch('data/catalog-meta.json'),
      nativeFetch('data/replacements.json'),
      nativeFetch('data/disabled-items.json'),
      ...linkFiles.map((file) => nativeFetch(file))
    ]);

    const perfumes = await perfumesResponse.json();
    const meta = metaResponse.ok ? await metaResponse.json() : {};
    const replacements = replacementsResponse.ok ? await replacementsResponse.json() : {};
    const disabled = disabledResponse.ok ? await disabledResponse.json() : {};
    const linkSets = await Promise.all(linkResponses.map(async (response) => response.ok ? response.json() : {}));

    const merged = perfumes.map((perfume) => {
      const originalKey = `${perfume.name}|${perfume.brand}`;
      const replacement = replacements[originalKey] || null;
      const baseItem = replacement ? { ...perfume, ...replacement } : perfume;
      const activeKey = `${baseItem.name}|${baseItem.brand}`;
      const linkOverrides = Object.assign({}, ...linkSets.map((set) => set[activeKey] || set[originalKey] || {}));
      const item = {
        ...baseItem,
        ...(meta[activeKey] || meta[originalKey] || {}),
        ...linkOverrides
      };
      item.__catalogKey = activeKey;
      return item;
    }).filter((item) => {
      if (disabled[item.__catalogKey]) return false;
      return Boolean(item.official_url && item.image_url);
    }).map((item) => {
      delete item.__catalogKey;
      return item;
    });

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();
