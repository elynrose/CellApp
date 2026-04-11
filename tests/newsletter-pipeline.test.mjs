/**
 * Validates the built-in "newsletter-generator" template: dependency order for oversight / runs.
 * Run: node tests/newsletter-pipeline.test.mjs
 */
import assert from 'node:assert/strict';
import { TEMPLATES } from '../src/data/templates.js';
import { orderCellsByPromptDeps } from '../src/utils/dependencies.js';

const template = TEMPLATES['newsletter-generator'];
assert.ok(template, 'newsletter-generator template must exist');

const cellsMap = {};
for (const c of template.cells) {
  cellsMap[c.cellId] = { ...c, cell_id: c.cellId };
}

const ids = template.cells.map((c) => c.cellId);
const order = orderCellsByPromptDeps(ids, cellsMap);

function indexOf(id) {
  const i = order.indexOf(id);
  assert.ok(i >= 0, `${id} missing from topological order`);
  return i;
}

// Chain: Theme → Research → Draft → Subject → Send
assert.ok(indexOf('A1') < indexOf('B1'), 'A1 must run before B1');
assert.ok(indexOf('B1') < indexOf('C1'), 'B1 must run before C1');
assert.ok(indexOf('C1') < indexOf('D1'), 'C1 must run before D1');
assert.ok(indexOf('D1') < indexOf('E1'), 'D1 must run before E1');

// Header image depends on theme
assert.ok(indexOf('A1') < indexOf('B2'), 'A1 must run before B2');

// Tool + schedule configuration sanity
const research = cellsMap['B1'];
assert.equal(research.enableTools, true);
assert.equal(research.enabledTools?.tavily, true);

const send = cellsMap['E1'];
assert.equal(send.enableTools, true);
assert.equal(send.enabledTools?.email, true);
assert.ok(send.schedule?.cronExpression?.trim(), 'E1 should have cron for daily send');
assert.ok(send.autoRun, 'E1 should use autoRun for cron scheduling');

console.log('newsletter-pipeline.test: OK');
