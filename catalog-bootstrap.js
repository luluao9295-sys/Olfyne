(() => {
  const nativeFetch = window.fetch.bind(window);

  const pagePreview = (url) => {
    if (!url) return '';
    return `https://image.thum.io/get/width/700/crop/700/noanimate/${url}`;
  };

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('data/perfumes.json')) return nativeFetch(input, init);

    const [perfumesResponse, metaResponse, linksResponse, links2Response] = await Promise.all([
      nativeFetch(input, init),
      nativeFetch('data/catalog-meta.json'),
      nativeFetch('data/official-links.json'),
      nativeFetch('data/official-links-2.json')
    ]);
    const perfumes = await perfumesResponse.json();
    const meta = metaResponse.ok ? await metaResponse.json() : {};
    const links = linksResponse.ok ? await linksResponse.json() : {};
    const links2 = links2Response.ok ? await links2Response.json() : {};
    const merged = perfumes.map((perfume) => {
      const key = `${perfume.name}|${perfume.brand}`;
      const override = meta[key] || {};
      const linkOverride = links[key] || {};
      const linkOverride2 = links2[key] || {};
      const item = {
        ...perfume,
        ...override,
        ...linkOverride,
        ...linkOverride2
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