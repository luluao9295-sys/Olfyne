const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dictionary = JSON.parse(fs.readFileSync('data/keywords.json', 'utf8'));
const context = vm.createContext({
  window: {}, console,
  fetch: async () => ({ json: async () => ({}) }),
  document: {
    getElementById: () => ({ innerHTML: '', addEventListener() {} }),
    querySelectorAll: () => [], addEventListener() {}
  }
});
vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
vm.runInContext(`dictionary = ${JSON.stringify(dictionary)}`, context);

function expectMatch(query, perfume) {
  const intent = vm.runInContext(`extractIntent(${JSON.stringify(query)})`, context);
  const score = vm.runInContext(`scorePerfume(${JSON.stringify(perfume)}, ${JSON.stringify(intent)})`, context);
  assert.ok(score > 0, `${query} should find ${perfume.name}`);
}

expectMatch('épices', { name: 'Référence A', brand: 'Maison A', notes: ['epices'] });
expectMatch('poire juteuse', { name: 'Référence B', brand: 'Maison B', notes: ['poire'] });
expectMatch('baies roses', { name: 'Référence C', brand: 'Maison C', notes: ['baies_rose'] });
expectMatch('brise marine', { name: 'Référence D', brand: 'Maison D', families: ['aquatique'] });
expectMatch('fleurs blanches', { name: 'Référence E', brand: 'Maison E', families: ['floral'] });
expectMatch('poivre noir', { name: 'Référence F', brand: 'Maison F', notes: ['poivre_noir'] });
expectMatch('sillage modéré', { name: 'Référence G', brand: 'Maison G', performance: ['modere'] });

const catalog = [
  ...JSON.parse(fs.readFileSync('data/perfumes.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('data/curated-additions.json', 'utf8')),
  ...JSON.parse(fs.readFileSync('data/sephora-additions.json', 'utf8'))
];
const suggestions = [...fs.readFileSync('index.html', 'utf8').matchAll(/<button data-query="([^"]+)">/g)].map((match) => match[1]);
for (const query of suggestions) {
  const intent = vm.runInContext(`extractIntent(${JSON.stringify(query)})`, context);
  const matches = catalog.filter((perfume) => vm.runInContext(`scorePerfume(${JSON.stringify(perfume)}, ${JSON.stringify(intent)}) > 0`, context));
  assert.ok(matches.length >= 5, `${query} should return several actual perfumes`);
}
console.log('search keyword tests passed');
