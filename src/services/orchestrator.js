/**
 * Orchestrator: matches user goals to existing templates or generates + saves new ones.
 */

import {
  getAllTemplates as fetchFirestoreTemplates,
  createUserTemplate,
  getUserTemplates
} from '../firebase/firestore';
import { getAllTemplates as getLocalTemplatesList, TEMPLATE_CATEGORIES } from '../data/templates';
import { generateAI, getModelType } from '../api';

function pickTextModelId(availableModels) {
  const textModels = (availableModels || []).filter((m) => {
    const id = m.id || m.originalId || '';
    return getModelType(id) === 'text' && (m.isActive !== false && m.status !== 'inactive');
  });
  const preferred = textModels.find((m) => m.orchestratorDefault === true);
  if (preferred) {
    return preferred.originalId || preferred.id;
  }
  if (textModels.length > 0) {
    const m = textModels[0];
    return m.originalId || m.id;
  }
  return 'gpt-4o-mini';
}

/** Pick an active model id that matches modelType, preferring AI's suggestion when valid. */
function coercePreferredModel(preferredRaw, modelType, availableModels, getFallbackId) {
  const pool = (availableModels || []).filter((m) => {
    const id = m.originalId || m.id;
    if (!id || m.isActive === false || m.status === 'inactive') return false;
    return getModelType(id) === modelType;
  });
  const pref = typeof preferredRaw === 'string' ? preferredRaw.trim() : '';
  if (pref && pool.some((m) => (m.originalId || m.id) === pref)) {
    return pref;
  }
  if (pool.length > 0) {
    return pool[0].originalId || pool[0].id;
  }
  return getFallbackId();
}

function formatModelCatalogForPrompt(availableModels) {
  const rows = (availableModels || [])
    .filter((m) => m.isActive !== false && m.status !== 'inactive')
    .slice(0, 48)
    .map((m) => {
      const id = m.originalId || m.id;
      return id ? { id, type: getModelType(id) } : null;
    })
    .filter(Boolean);
  return JSON.stringify(rows);
}

function enrichCellsFromGoal(cells, userGoal) {
  const g = String(userGoal || '').trim().slice(0, 400);
  return cells.map((c) => {
    let prompt = typeof c.prompt === 'string' ? c.prompt.trim() : '';
    if (!prompt) {
      const title = c.name || 'Step';
      prompt =
        `You are helping automate this user goal:\n${g || '(see workflow title)'}\n\n` +
        `Card "${title}": produce a concrete, actionable result for the next cards in the pipeline. ` +
        `Use clear structure (headings/bullets) where appropriate.`;
    }
    return { ...c, prompt };
  });
}

/**
 * Default automation: first card manual (no autoRun); downstream cards autoRun when they consume upstream via {{refs}}.
 */
function ensureAutomationDefaults(cells) {
  return cells.map((c, i) => {
    const hasSchedule = c.schedule && typeof c.schedule.cronExpression === 'string' && c.schedule.cronExpression.trim();
    const hasDep = /\{\{[A-Z]+\d+\}\}/.test(c.prompt || '');
    let autoRun = c.autoRun;
    if (autoRun === undefined || autoRun === null) {
      if (hasSchedule) autoRun = true;
      else if (i === 0) autoRun = false;
      else autoRun = hasDep || true;
    }
    const interval = typeof c.interval === 'number' ? c.interval : 0;
    return { ...c, autoRun, interval };
  });
}

function normalizeTemplateConnections(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const s = String(c.source || c.source_cell_id || c.from || '').trim().toUpperCase();
    const t = String(c.target || c.target_cell_id || c.to || '').trim().toUpperCase();
    if (s && t && s !== t) {
      out.push({ source: s, target: t });
    }
  }
  return out;
}

/**
 * Merge Firestore templates with built-in local templates (by id; Firestore wins).
 */
export function getMergedTemplateCatalog() {
  const local = getLocalTemplatesList();
  const map = new Map();
  for (const t of local) {
    if (t?.id) map.set(t.id, t);
  }
  return map;
}

export async function loadAllTemplatesMerged(userId = null) {
  const map = getMergedTemplateCatalog();
  const remote = await fetchFirestoreTemplates();
  if (remote.success && Array.isArray(remote.data)) {
    for (const t of remote.data) {
      if (t?.id) map.set(t.id, t);
    }
  }
  if (userId) {
    const mine = await getUserTemplates(userId);
    if (mine.success && Array.isArray(mine.data)) {
      for (const t of mine.data) {
        if (t?.id) map.set(t.id, t);
      }
    }
  }
  return [...map.values()];
}

function normalizeCell(cell, index, getTextModelId, availableModels) {
  const baseId = cell.cellId || cell.cellReference || `A${index + 1}`;
  const cellId = String(baseId).toUpperCase();
  const et = cell.enabledTools || {};
  const modelType = ['text', 'image', 'video', 'audio'].includes(cell.modelType) ? cell.modelType : 'text';
  const preferredModel = coercePreferredModel(
    cell.preferredModel || cell.model,
    modelType,
    availableModels,
    getTextModelId
  );
  return {
    cellId,
    cellReference: cell.cellReference || cellId,
    name: cell.name || `Step ${index + 1}`,
    prompt: cell.prompt || '',
    modelType,
    preferredModel,
    temperature: typeof cell.temperature === 'number' ? cell.temperature : 0.7,
    characterLimit: typeof cell.characterLimit === 'number' ? cell.characterLimit : 0,
    outputFormat: cell.outputFormat || '',
    autoRun: cell.autoRun ?? index > 0,
    interval: typeof cell.interval === 'number' ? cell.interval : 0,
    enableTools: cell.enableTools === true,
    enabledTools: {
      tavily: !!et.tavily,
      email: !!et.email,
      telegram: !!et.telegram,
      twilioSms: !!et.twilioSms
    },
    schedule:
      cell.schedule && typeof cell.schedule.cronExpression === 'string' && cell.schedule.cronExpression.trim()
        ? {
            cronExpression: cell.schedule.cronExpression.trim(),
            timeZone: cell.schedule.timeZone || 'UTC'
          }
        : null,
    x: typeof cell.x === 'number' ? cell.x : 100 + index * 150,
    y: typeof cell.y === 'number' ? cell.y : 100 + index * 120
  };
}

export function normalizeTemplateFromAI(raw, getTextModelId, availableModels = [], userGoal = '') {
  if (!raw || typeof raw !== 'object') return null;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const icon = typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : '✨';
  const category = TEMPLATE_CATEGORIES[raw.category] ? raw.category : 'content';
  const cells = Array.isArray(raw.cells) ? raw.cells : [];

  if (!name || cells.length === 0) return null;

  let normalizedCells = cells.map((c, i) => normalizeCell(c, i, getTextModelId, availableModels));
  normalizedCells = enrichCellsFromGoal(normalizedCells, userGoal);
  normalizedCells = ensureAutomationDefaults(normalizedCells);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = raw.id || `orch-${slug || 'template'}-${Date.now()}`;

  const connections = normalizeTemplateConnections(raw.connections);

  return {
    id,
    name,
    description: description || 'Orchestrator-generated workflow',
    category,
    icon,
    cells: normalizedCells,
    ...(connections.length > 0 ? { connections } : {}),
    orchestratorGenerated: true
  };
}

function parseJsonFromModel(text) {
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
    return null;
  }
}

/**
 * Ask the model which existing template id fits the goal, or null.
 * @param {string[]} excludeTemplateIds - do not pick these ids (hand-off diversity)
 */
export async function findMatchingTemplateId(userGoal, templates, getTextModelId, excludeTemplateIds = []) {
  const modelId = getTextModelId();
  const exclude = new Set((excludeTemplateIds || []).filter(Boolean));
  const filtered = templates.filter((t) => t?.id && !exclude.has(t.id));
  const compact = filtered
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      name: t.name || '',
      description: (t.description || '').slice(0, 240)
    }));

  const system = [
    'You are the Draftai orchestrator. Pick the single best existing workflow template for the user goal, or decide none fit.',
    'Reply with ONLY valid JSON: {"templateId": "<exact id from the list>" | null, "confidence": "high"|"medium"|"low", "reason": "one short sentence"}',
    'If no template is appropriate, use templateId: null.'
  ].join('\n');

  const user = `User goal:\n${String(userGoal).trim()}\n\nTemplates (id, name, description):\n${JSON.stringify(compact, null, 0)}`;

  const result = await generateAI(`${system}\n\n${user}`, modelId, 0.2, 800);
  if (!result.success) {
    return { templateId: null, error: result.error };
  }

  let text = (result.output || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  try {
    const parsed = JSON.parse(text);
    const tid = parsed.templateId != null && parsed.templateId !== '' ? String(parsed.templateId) : null;
    const validIds = new Set(compact.map((c) => c.id));
    if (tid && validIds.has(tid)) {
      return { templateId: tid, reason: parsed.reason };
    }
    return { templateId: null, reason: parsed.reason };
  } catch {
    return { templateId: null, error: 'Could not parse template match' };
  }
}

/**
 * After each template phase, decide if the main goal is met or what the next hand-off should do.
 */
export async function planNextHandoff(mainGoal, phaseHistory, phaseIndex, maxPhases, getTextModelId) {
  const modelId = getTextModelId();
  const system = [
    'You are the Draftai orchestrator. The MAIN GOAL is what the user ultimately wants.',
    'Several workflow templates (phases) may run one after another on the same sheet; each phase replaces the canvas with a new template.',
    'Rules:',
    '- If the phase history is EMPTY, you MUST set done: false and provide nextInstruction for the FIRST workflow (unless the goal is literally "nothing to do").',
    '- If the MAIN GOAL is fully satisfied by what has already been completed in phase history, set done: true.',
    '- Otherwise set done: false and nextInstruction: one concrete task string for the NEXT template only.',
    '- Do not invent infinite work. If uncertain after several phases, prefer done: true.',
    '- nextInstruction should not duplicate the last phase instruction verbatim.',
    `Reply with ONLY valid JSON: {"done": true|false, "reason": "short", "nextInstruction": "only when done is false"}`
  ].join('\n');

  const user = [
    `MAIN GOAL:\n${String(mainGoal).trim()}`,
    '',
    `Phase ${phaseIndex} of max ${maxPhases} (stops if goal met or max reached).`,
    '',
    'Completed phases (most recent last):',
    JSON.stringify(phaseHistory || [], null, 0)
  ].join('\n');

  const result = await generateAI(`${system}\n\n${user}`, modelId, 0.25, 1200);
  if (!result.success) {
    return { done: false, error: result.error, nextInstruction: null, reason: null };
  }

  const parsed = parseJsonFromModel(result.output || '');
  if (!parsed || typeof parsed.done !== 'boolean') {
    return { done: false, error: 'Invalid planner response', nextInstruction: null, reason: null };
  }

  if (parsed.done) {
    return {
      done: true,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Goal complete.',
      nextInstruction: null
    };
  }

  const nextInstruction =
    typeof parsed.nextInstruction === 'string' ? parsed.nextInstruction.trim() : '';
  if (!nextInstruction) {
    return {
      done: false,
      error: 'Planner did not provide nextInstruction',
      nextInstruction: null,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null
    };
  }

  return {
    done: false,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    nextInstruction
  };
}

/**
 * Generate a new template JSON from the user goal and save to Firestore.
 * @param {string} userGoal
 * @param {() => string} getTextModelId
 * @param {object[]} [availableModels] - active models from the app (ids + types must match this list)
 * @param {string} [userId] - Firebase uid; template is stored under users/{userId}/templates
 */
export async function generateAndSaveTemplate(userGoal, getTextModelId, availableModels = [], userId = null) {
  const modelId = getTextModelId();
  const catalog = formatModelCatalogForPrompt(availableModels);

  const systemPrompt = [
    'You are an expert workflow designer for Draftai (a card-based AI canvas). Each card is one step.',
    '',
    'CRITICAL — prompts and data flow:',
    '- Every card MUST have a rich "prompt" string (multiple sentences when useful) describing exactly what that card should do for THIS user goal.',
    '- Wire steps together using Draftai merge syntax: {{A1}}, {{B1}}, {{C1}} for prior card outputs. Downstream cards MUST reference upstream cellIds they depend on.',
    '- First card (usually A1) often gathers input or plans; later cards transform, summarize, format, or generate media using prior outputs.',
    '- "name" is a short human label for each card.',
    '',
    'Models (must match your deployment):',
    '- Use ONLY these model ids for "preferredModel" — pick by "type" for each card:',
    catalog,
    '- "modelType" must be one of: text | image | video | audio (match the model you choose).',
    '',
    'Automation & tools:',
    '- "autoRun": false for the first input/planning step; true for cards that should run automatically after their dependencies complete (typical for cards that only consume {{refs}}).',
    '- "interval": seconds between auto-runs when using interval-based autorun (e.g. 300). Usually 0 unless the user asked for polling.',
    '- "enableTools" / "enabledTools": set tavily for web research, email/telegram/twilioSms when the goal implies outreach or notifications.',
    '- For scheduled runs use "schedule": { "cronExpression": "0 8 * * *", "timeZone": "UTC" } (5-field cron) and set "autoRun": true on that card.',
    '',
    'Optional explicit edges (in addition to {{refs}} which also draw dependency lines):',
    '- "connections": [ { "source": "A1", "target": "B1" }, ... ] — use when the flow is clearer as explicit edges.',
    '',
    'Design 2–8 cards. Return ONLY valid JSON (no markdown outside the JSON):',
    '{',
    '  "name": "...",',
    '  "description": "one paragraph",',
    '  "category": "content|marketing|business|productivity|education|creative|personal",',
    '  "icon": "emoji",',
    '  "connections": [],',
    '  "cells": [',
    '    {',
    '      "cellId": "A1",',
    '      "name": "...",',
    '      "prompt": "detailed instructions...",',
    '      "modelType": "text",',
    '      "preferredModel": "<id from catalog>",',
    '      "temperature": 0.7,',
    '      "characterLimit": 0,',
    '      "outputFormat": "markdown" | "",',
    '      "autoRun": false,',
    '      "interval": 0,',
    '      "enableTools": false,',
    '      "enabledTools": { "tavily": false, "email": false, "telegram": false, "twilioSms": false },',
    '      "schedule": null,',
    '      "x": 100,',
    '      "y": 100',
    '    }',
    '  ]',
    '}'
  ].join('\n');

  const fullPrompt = `${systemPrompt}\n\nUser goal / task to automate:\n${String(userGoal).trim()}`;

  const result = await generateAI(fullPrompt, modelId, 0.35, 8192);
  if (!result.success) {
    return { success: false, error: result.error || 'Generation failed' };
  }

  let rawText = (result.output || '').trim();
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { success: false, error: 'AI did not return valid JSON' };
  }

  const normalized = normalizeTemplateFromAI(parsed, getTextModelId, availableModels, userGoal);
  if (!normalized) {
    return { success: false, error: 'Generated template missing name or cells' };
  }

  if (!userId) {
    return { success: false, error: 'Sign in required to save orchestrator templates to your account.' };
  }

  const saveResult = await createUserTemplate(userId, normalized);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error || 'Failed to save template' };
  }

  const saved = { ...normalized, id: saveResult.id || normalized.id, ownerId: userId };
  return { success: true, template: saved };
}

/**
 * Resolve a template for the goal: reuse existing or create new.
 * @param {object} [options]
 * @param {string[]} [options.excludeTemplateIds] - ids to exclude from matching (hand-off)
 */
export async function resolveTemplateForGoal(userGoal, availableModels, options = {}) {
  const { excludeTemplateIds = [], userId = null } = options;
  const getTextModelId = () => pickTextModelId(availableModels);
  const templates = await loadAllTemplatesMerged(userId);

  const match = await findMatchingTemplateId(userGoal, templates, getTextModelId, excludeTemplateIds);
  if (match.templateId) {
    const t = templates.find((x) => x.id === match.templateId);
    if (t && Array.isArray(t.cells) && t.cells.length > 0) {
      return {
        success: true,
        source: 'existing',
        template: t,
        matchReason: match.reason
      };
    }
  }

  const created = await generateAndSaveTemplate(userGoal, getTextModelId, availableModels, userId);
  if (!created.success) {
    return { success: false, error: created.error };
  }
  return {
    success: true,
    source: 'generated',
    template: created.template
  };
}

/**
 * Multi-phase orchestration: plan → template → repeat until goal met or limits.
 * Caller applies each phase template to the sheet (clearing between phases as needed).
 *
 * @param {object} [options]
 * @param {number} [options.maxPhases] - max templates to apply (default 5)
 * @param {(ev: object) => void} [options.onProgress]
 */
export async function runOrchestratorHandoffPipeline(mainGoal, availableModels, options = {}) {
  const maxPhases = Math.min(Math.max(Number(options.maxPhases) || 5, 1), 10);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const userId = options.userId || null;
  const getTextModelId = () => pickTextModelId(availableModels);

  const phases = [];
  const phaseHistory = [];

  for (let round = 1; round <= maxPhases; round++) {
    if (onProgress) {
      onProgress({ type: 'plan_start', round, maxPhases });
    }

    const plan = await planNextHandoff(
      mainGoal,
      phaseHistory,
      round,
      maxPhases,
      getTextModelId
    );

    if (plan.error && !plan.done) {
      return { success: false, error: plan.error, phases };
    }

    if (plan.done) {
      if (onProgress) {
        onProgress({ type: 'done', round, reason: plan.reason });
      }
      return {
        success: true,
        finished: true,
        stopReason: 'goal_met',
        phases,
        summary: plan.reason || 'Goal complete.'
      };
    }

    const instruction = plan.nextInstruction;
    if (!instruction) {
      return { success: false, error: 'Orchestrator gave no next instruction.', phases };
    }

    if (onProgress) {
      onProgress({ type: 'resolve', round, instruction });
    }

    const usedIds = phases.map((p) => p.template.id).filter(Boolean);
    const excludeTemplateIds = [...new Set(usedIds)];

    const resolved = await resolveTemplateForGoal(instruction, availableModels, {
      excludeTemplateIds,
      userId
    });
    if (!resolved.success) {
      return { success: false, error: resolved.error, phases };
    }

    if (usedIds.includes(resolved.template.id)) {
      return {
        success: false,
        error:
          'Hand-off stopped: a template would repeat. Try a more specific goal or run follow-up phases manually.',
        phases
      };
    }

    const lastInstr = phases.length > 0 ? phases[phases.length - 1].instruction : null;
    if (lastInstr && instruction.trim().toLowerCase() === lastInstr.trim().toLowerCase()) {
      return {
        success: false,
        error: 'Hand-off stopped: repeated instruction would loop. Refine your goal.',
        phases
      };
    }

    phases.push({
      phase: phases.length + 1,
      instruction,
      template: resolved.template,
      source: resolved.source,
      matchReason: resolved.matchReason,
      plannerReason: plan.reason
    });

    phaseHistory.push({
      phase: phases.length,
      templateId: resolved.template.id,
      templateName: resolved.template.name,
      instruction,
      source: resolved.source
    });

    if (onProgress) {
      onProgress({
        type: 'phase_ready',
        round,
        templateName: resolved.template.name,
        templateId: resolved.template.id
      });
    }
  }

  return {
    success: true,
    finished: false,
    stopReason: 'max_phases',
    phases,
    summary: `Stopped after ${maxPhases} phase(s). The goal may need another run or a narrower scope.`
  };
}

/**
 * Workspace-level agent loop: pick the next card to run from existing sheet cells using each card's
 * `agentOrchestratorReport` (and short excerpts) until the main goal is done or rounds are exhausted.
 *
 * @param {string} mainGoal
 * @param {Record<string, object>} cellsRecord - cellId -> cell data
 * @param {unknown[]} decisionHistory - prior planner outputs / rounds (opaque JSON-serializable)
 * @param {number} round - current orchestrator round (1-based)
 * @param {number} maxRounds - max orchestrator rounds allowed
 * @param {() => string} getTextModelId
 * @returns {Promise<{
 *   success: boolean,
 *   done?: boolean,
 *   error?: string,
 *   reason?: string,
 *   summary?: string,
 *   next_cell_id?: string | null,
 *   next_instruction?: string
 * }>}
 */
export async function planAgentGoalStep(
  mainGoal,
  cellsRecord,
  decisionHistory,
  round,
  maxRounds,
  getTextModelId
) {
  const keys = Object.keys(cellsRecord || {});
  if (keys.length === 0) {
    return {
      success: false,
      error: 'Add at least one card to the sheet before running the agent goal loop.'
    };
  }

  const upperToActual = {};
  keys.forEach((k) => {
    upperToActual[String(k).trim().toUpperCase()] = k;
  });

  const cellIds = keys.slice().sort((a, b) => {
    const col = (id) => String(id).match(/^([A-Za-z]+)(\d+)$/);
    const ma = col(a);
    const mb = col(b);
    if (!ma || !mb) return String(a).localeCompare(String(b));
    if (ma[1].toUpperCase() !== mb[1].toUpperCase()) {
      return ma[1].toUpperCase().localeCompare(mb[1].toUpperCase());
    }
    return parseInt(ma[2], 10) - parseInt(mb[2], 10);
  });

  const cardSummaries = cellIds.map((id) => {
    const c = cellsRecord[id] || {};
    const report = c.agentOrchestratorReport || null;
    return {
      cell_id: id,
      name: c.name || id,
      prompt_excerpt: c.prompt ? String(c.prompt).slice(0, 280) : '',
      output_excerpt: c.output ? String(c.output).slice(0, 400) : '',
      agent_report: report
    };
  });

  const modelId = getTextModelId();
  const validList = cellIds.join(', ');

  const system = [
    'You are the workspace orchestrator for Draftai (a card-based AI sheet).',
    'The user has ONE main goal for the whole workspace.',
    'Each card may include an agent_report JSON from its last run describing research, planning, review, and report_to_orchestrator.',
    'Your job: decide whether the MAIN GOAL is already satisfied, or which SINGLE card to run next.',
    `You MUST choose next_cell_id from this exact list (use the cell_id string exactly as given): ${validList}`,
    'If the goal is fully met by current outputs/reports, set done: true and next_cell_id: null.',
    'If more work is needed, set done: false and pick exactly one next_cell_id plus next_instruction (what that card should focus on this run).',
    'Prefer cards that unblock others or close the goal; if nothing has run yet, pick the best starting card from prompts.',
    `Round ${round} of at most ${maxRounds}. If the goal cannot proceed without user input, you may set done: true with reason explaining what is missing.`,
    'Reply with ONLY valid JSON:',
    '{"done": true|false, "reason": "short", "next_cell_id": "A1" | null, "next_instruction": "only when done is false", "summary": "one line"}'
  ].join('\n');

  const userPayload = {
    main_goal: String(mainGoal || '').trim(),
    round,
    max_rounds: maxRounds,
    previous_decisions: decisionHistory || [],
    cards: cardSummaries
  };

  const result = await generateAI(`${system}\n\n${JSON.stringify(userPayload)}`, modelId, 0.2, 1800);
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Planner request failed',
      next_cell_id: null,
      next_instruction: ''
    };
  }

  const parsed = parseJsonFromModel(result.output || '');
  if (!parsed || typeof parsed.done !== 'boolean') {
    return {
      success: false,
      error: 'Invalid planner JSON',
      next_cell_id: null,
      next_instruction: ''
    };
  }

  if (parsed.done === true) {
    return {
      success: true,
      done: true,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Goal complete.',
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      next_cell_id: null,
      next_instruction: ''
    };
  }

  const rawNext = parsed.next_cell_id != null && parsed.next_cell_id !== '' ? String(parsed.next_cell_id).trim() : '';
  const actualId = rawNext ? upperToActual[rawNext.toUpperCase()] : null;

  if (!actualId) {
    return {
      success: false,
      error: 'Orchestrator did not return a valid next_cell_id from this sheet.',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      summary: typeof parsed.summary === 'string' ? parsed.summary : ''
    };
  }

  return {
    success: true,
    done: false,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    next_cell_id: actualId,
    next_instruction:
      typeof parsed.next_instruction === 'string' ? parsed.next_instruction.trim() : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : ''
  };
}
