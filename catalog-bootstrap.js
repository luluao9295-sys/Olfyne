(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!url.endsWith('data/perfumes.json')) return nativeFetch(input, init);

    const [perfumesResponse, metaResponse] = await Promise.all([
      nativeFetch(input, init),
      nativeFetch('data/catalog-meta.json')
    ]);
    const perfumes = await perfumesResponse.json();
    const meta = metaResponse.ok ? await metaResponse.json() : {};
    const merged = perfumes.map((perfume) => ({
      ...perfume,
      ...(meta[`${perfume.name}|${perfume.brand}`] || {})
    }));
    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
})();