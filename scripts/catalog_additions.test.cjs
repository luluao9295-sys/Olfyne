const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function testBootstrapIncludesRetailerSelection() {
  const fixtures = {
    'data/perfumes.json': [{ name: 'Original', brand: 'Maison', official_url: 'https://example.com/o', image_url: 'https://example.com/o.jpg' }],
    'data/curated-additions.json': [],
    'data/sephora-additions.json': [{ name: 'Rare Beginnings', brand: 'Rare Beauty', source_site: 'Sephora France', official_url: 'https://www.sephora.fr/p/rare-beginnings.html', image_url: 'https://media.sephora.eu/rare.jpg' }]
  };
  const window = { fetch: async (url) => ({ ok: true, json: async () => fixtures[url] ?? {} }) };
  const context = vm.createContext({ window, Response });
  vm.runInContext(fs.readFileSync('catalog-bootstrap.js', 'utf8'), context);
  const response = await window.fetch('data/perfumes.json');
  const names = (await response.json()).map((x) => x.name);
  assert.deepEqual(names, ['Original', 'Rare Beginnings']);
}

async function testActualCatalogKeepsAllAddedProducts() {
  const window = { fetch: async (url) => {
    const path = url.startsWith('data/') ? url : 'data/perfumes.json';
    const exists = fs.existsSync(path);
    return { ok: exists, json: async () => exists ? JSON.parse(fs.readFileSync(path, 'utf8')) : {} };
  } };
  vm.runInContext(fs.readFileSync('catalog-bootstrap.js', 'utf8'), vm.createContext({ window, Response }));
  const merged = await (await window.fetch('data/perfumes.json')).json();
  const added = merged.filter((x) => x.source_site === 'Sephora France');
  assert.equal(added.length, 500);
  assert.ok(added.every((x) => x.official_url.includes('sephora.fr/p/') && x.image_url && Number.isFinite(x.price_eur)));
}

function testNameSearchFindsSelectionWithoutNotes() {
  const context = vm.createContext({
    window: {}, console,
    fetch: async () => ({ json: async () => ({}) }),
    document: {
      getElementById: () => ({ innerHTML: '', addEventListener() {} }),
      querySelectorAll: () => [], addEventListener() {}
    }
  });
  vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
  const score = vm.runInContext("scorePerfume({name:'Rare Beginnings',brand:'Rare Beauty',notes:[]}, {query:'rare beginnings',positive:[],negative:[]})", context);
  assert.ok(score > 0, 'a product name query should return a result');
}

(async () => {
  await testBootstrapIncludesRetailerSelection();
  await testActualCatalogKeepsAllAddedProducts();
  testNameSearchFindsSelectionWithoutNotes();
  console.log('catalog additions tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
