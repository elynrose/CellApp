/**
 * Sheet-level oversight agent: reviews all cards, issues per-card directives,
 * runs cells in dependency order, repeats until the goal is met or max rounds.
 */

import { generateAI, getModelType } from '../api';
import { orderCellsByPromptDeps } from '../utils/dependencies';
import { mergeConnections, generateConnectionsFromDependencies } from '../utils/connections';

const DEFAULT_MODEL = 'gpt-4o-mini';

function truncate(s, n = 1200) {
  if (s == null) return '';
  const t = String(s);
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function parseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function buildSnapshot(cellsMap, connections, sheetName) {
  const ids = Object.keys(cellsMap || {}).sort();
  const cards = ids.map((id) => {
    const c = cellsMap[id] || {};
    const out = (c.output != null ? String(c.output) : '').trim();
    return {
      cellId: id,
      name: c.name || '',
      model: c.model || '',
      modelType: getModelType(c.model || ''),
      promptPreview: truncate(c.prompt || '', 500),
      outputPreview: out ? truncate(out, 800) : '(no output yet)',
      status: c.status || null,
      autoRun: !!c.autoRun,
      enableTools: !!c.enableTools
    };
  });
  return {
    sheetName: sheetName || 'Sheet',
    connections: connections || [],
    cards
  };
}

const PLAN_SYSTEM = `You are the Oversight Agent for a multi-card AI canvas. Your job is to align all cards toward ONE main goal.

You receive a snapshot of every card (id, prompts, latest outputs, graph edges). You must:
1. Assess progress toward the goal.
2. Decide if the goal is FULLY achieved (all essential deliverables present in card outputs).
3. If not complete, issue a SHORT directive for EACH card that should act this round. Directives tell that card what to focus on in its NEXT run (constraints, tone, what to fix, what to produce). Empty or redundant cards may get "Hold; wait for upstream" or minimal guidance.
4. Stay consistent with dependencies: upstream cards should stabilize before downstream elaborates.

Reply with ONLY valid JSON:
{
  "complete": true or false,
  "summary": "one sentence status",
  "directives": {
    "A1": "directive text for card A1",
    "B2": "..."
  }
}

Rules:
- Keys in "directives" MUST be cell ids from the snapshot (e.g. A1, B2).
- Only include cards that should run or need steering this round; you may omit ids that should stay idle.
- If complete is true, "directives" can be {}.
- Be concrete and actionable; reference the goal and other cards when helpful.`;

/**
 * @param {object} params
 * @param {string} params.goal - Main goal text
 * @param {object} params.cellsMap - cellId -> cell
 * @param {Array} params.manualConnections - optional canvas edges
 * @param {string} params.sheetName
 * @param {number} params.round - 1-based
 * @param {string} params.model
 */
export async function fetchOversightPlan({
  goal,
  cellsMap,
  manualConnections = [],
  sheetName,
  round,
  model = DEFAULT_MODEL
}) {
  const cellsArr = Object.values(cellsMap || {});
  const depConn = generateConnectionsFromDependencies(cellsArr);
  const merged = mergeConnections(manualConnections || [], depConn);
  const snapshot = buildSnapshot(cellsMap, merged, sheetName);

  const userMsg = [
    `Main goal (keep everyone aligned to this):\n${goal.trim()}`,
    '',
    `Review round: ${round}`,
    '',
    'Current sheet snapshot:',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');

  const result = await generateAI(`${PLAN_SYSTEM}\n\n${userMsg}`, model, 0.35, 4096);
  if (!result.success) {
    return { success: false, error: result.error, raw: null, parsed: null };
  }
  const parsed = parseJsonFromText(result.output || '');
  if (!parsed || typeof parsed.complete !== 'boolean') {
    return {
      success: false,
      error: 'Oversight model did not return valid JSON',
      raw: result.output,
      parsed: null
    };
  }
  return {
    success: true,
    complete: !!parsed.complete,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    directives: parsed.directives && typeof parsed.directives === 'object' ? parsed.directives : {},
    raw: result.output
  };
}

/**
 * @param {object} params
 * @param {string} params.goal
 * @param {() => object} params.getCellsMap - latest cells object
 * @param {Array} params.manualConnections
 * @param {string} params.sheetName
 * @param {function} params.runCellWithOversight - async (cellId, oversightDirective, meta) => runCell result
 * @param {number} params.maxRounds
 * @param {function} [params.onProgress]
 */
export async function runOversightOrchestration({
  goal,
  getCellsMap,
  manualConnections = [],
  sheetName = '',
  runCellWithOversight,
  maxRounds = 5,
  onProgress,
  oversightModel = DEFAULT_MODEL
}) {
  if (!goal || !String(goal).trim()) {
    return { success: false, error: 'Goal is required' };
  }

  const log = [];

  for (let round = 1; round <= maxRounds; round++) {
    const cellsMap = getCellsMap();
    const plan = await fetchOversightPlan({
      goal,
      cellsMap,
      manualConnections,
      sheetName,
      round,
      model: oversightModel
    });

    log.push({
      round,
      planSuccess: plan.success,
      complete: plan.complete,
      summary: plan.summary,
      error: plan.error || null
    });

    if (onProgress) {
      onProgress({ type: 'round', round, plan });
    }

    if (!plan.success) {
      return { success: false, error: plan.error || 'Oversight plan failed', log, finalComplete: false };
    }

    if (plan.complete) {
      return { success: true, complete: true, log, rounds: round, summary: plan.summary };
    }

    const directiveEntries = Object.entries(plan.directives || {}).filter(
      ([id, text]) => id && text && String(text).trim()
    );
    if (directiveEntries.length === 0) {
      return {
        success: true,
        complete: false,
        log,
        stoppedReason: 'no_directives',
        message: 'Oversight returned no directives; stopping to avoid a loop.'
      };
    }

    const targetIds = directiveEntries.map(([id]) => id);
    const ordered = orderCellsByPromptDeps(targetIds, cellsMap);

    for (const cellId of ordered) {
      const text = plan.directives[cellId];
      if (!text || !String(text).trim()) continue;

      if (onProgress) {
        onProgress({ type: 'cell_start', round, cellId });
      }

      const res = await runCellWithOversight(cellId, String(text).trim(), {
        round,
        goal: goal.trim(),
        summary: plan.summary
      });

      log.push({ round, cellId, runSuccess: res?.success, error: res?.error });

      if (onProgress) {
        onProgress({ type: 'cell_done', round, cellId, result: res });
      }
    }
  }

  return {
    success: true,
    complete: false,
    log,
    stoppedReason: 'max_rounds',
    message: `Stopped after ${maxRounds} review rounds.`
  };
}
