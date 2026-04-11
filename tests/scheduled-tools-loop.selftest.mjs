/**
 * Smoke test: tool parsing + server executeTool path (no Firestore).
 * Run: node tests/scheduled-tools-loop.selftest.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  CELL_TOOLS_INSTRUCTION,
  parseToolCallsFromText,
  isToolAllowedForCell,
  cellWantsTools
} from '../src/utils/cellTools.js';

const require = createRequire(import.meta.url);
const { executeTool } = require('../server/tools-executor.js');

const researchCell = {
  enableTools: true,
  enabledTools: { tavily: true, email: false, telegram: false, twilioSms: false }
};

assert.equal(cellWantsTools(researchCell), true);
assert.equal(isToolAllowedForCell(researchCell, 'tavily_search'), true);
assert.equal(isToolAllowedForCell(researchCell, 'send_email'), false);

const modelOut = [
  'Here is research.',
  '',
  '```json',
  '{"tool":"tavily_search","args":{"query":"AI news","max_results":2}}',
  '```'
].join('\n');

const calls = parseToolCallsFromText(modelOut).filter((c) =>
  isToolAllowedForCell(researchCell, c.tool)
);
assert.equal(calls.length, 1);
assert.equal(calls[0].tool, 'tavily_search');

const r = await executeTool(calls[0].tool, calls[0].args, {});
assert.equal(r.ok, false);
assert.ok(String(r.error || '').length > 0);

assert.ok(CELL_TOOLS_INSTRUCTION.includes('tavily_search'));

console.log('scheduled-tools-loop.selftest: OK');
