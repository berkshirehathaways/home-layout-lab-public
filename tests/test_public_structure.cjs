const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('public starter has no private seed and exposes plan upload controls', () => {
  const seed = read('src/seed.js');
  assert.match(seed, /furniture: \[\]/);
  assert.match(seed, /kind: 'blank'/);
  for (const marker of ['PERSONAL_DATA_SENTINEL', 'PRIVATE_ACCOUNT_PLACEHOLDER']) assert.doesNotMatch(seed, new RegExp(marker));
  const index = read('index.html');
  assert.match(index, /id="background-upload"/);
  assert.match(index, /id="background-file"/);
  assert.match(index, /id="add-item"/);
  assert.doesNotMatch(index, /PERSONAL_DATA_SENTINEL|PRIVATE_ACCOUNT_PLACEHOLDER/);
});

test('generic geometry modules remain usable without a DOM', () => {
  const context = {window: {}};
  for (const file of ['src/door-swing.js', 'src/room-boundary.js', 'src/geometry.js']) vm.runInNewContext(read(file), context);
  const geometry = context.window.HOME_GEOMETRY;
  const value = geometry.empty();
  assert.equal(value.walls.length, 0);
  value.walls.push({id: 'wall-1', name: '벽', source: '', verification: 'unconfirmed', locked: false, visible: true, checkEnabled: true, x1Mm: 0, y1Mm: 0, x2Mm: 1000, y2Mm: 0, thicknessMm: 100});
  assert.equal(geometry.validate(value), value);
});
