/**
 * Orchestrator: matches user goals to existing templates or generates + saves new ones.
 */

import { getAllTemplates as fetchFirestoreTemplates, createTemplate } from '../firebase/firestore';
import { getAllTemplates as getLocalTemplatesList, TEMPLATE_CATEGORIES } from '../data/templates';
import { generateAI, getModelType } from '../api';

function pickTextModelId(availableModels) {
  const textModels = (availableModels || []).filter((m) => {
    const id = m.id || m.originalId || '';
    return getModelType(id) === 'text' && (m.isActive !== false && m.status !== 'inactive');
  });
  if (textModels.length > 0) {
    const m = textModels[0];
    return m.originalId || m.id;
  }
  return 'gpt-4o-mini';
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

export async function loadAllTemplatesMerged() {
  const map = getMergedTemplateCatalog();
  const remote = await fetchFirestoreTemplates();
  if (remote.success && Array.isArray(remote.data)) {
    for (const t of remote.data) {
      if (t?.id) map.set(t.id, t);
    }
  }
  return [...map.values()];
}

function normalizeCell(cell, index, getTextModelId) {
  const baseId = cell.cellId || cell.cellReference || `A${index + 1}`;
  const cellId = String(baseId).toUpperCase();
  const et = cell.enabledTools || {};
  return {
    cellId,
    cellReference: cell.cellReference || cellId,
    name: cell.name || `Step ${index + 1}`,
    prompt: cell.prompt || '',
    modelType: cell.modelType || 'text',
    preferredModel: cell.preferredModel || getTextModelId(),
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

export function normalizeTemplateFromAI(raw, getTextModelId) {
  if (!raw || typeof raw !== 'object') return null;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const icon = typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : '✨';
  const category = TEMPLATE_CATEGORIES[raw.category] ? raw.category : 'content';
  const cells = Array.isArray(raw.cells) ? raw.cells : [];

  if (!name || cells.length === 0) return null;

  const normalizedCells = cells.map((c, i) => normalizeCell(c, i, getTextModelId));

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = raw.id || `orch-${slug || 'template'}-${Date.now()}`;

  return {
    id,
    name,
    description: description || 'Orchestrator-generated workflow',
    category,
    icon,
    cells: normalizedCells,
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
 */
export async function generateAndSaveTemplate(userGoal, getTextModelId) {
  const modelId = getTextModelId();

  const systemPrompt = [
    'You are an expert workflow designer for Draftai (card-based AI canvas).',
    'Cards can use tools when enabled: Tavily (research), SendGrid/SMTP email, Telegram, Twilio SMS.',
    'Set "enableTools": true and "enabledTools": { "tavily", "email", "telegram", "twilioSms" } booleans on TEXT cards that need them.',
    'For recurring server schedules use "schedule": { "cronExpression": "0 8 * * *", "timeZone": "UTC" } (5-field cron) and "autoRun": true on that card.',
    'Use {{A1}}, {{B1}} references in prompts; set autoRun true on downstream cards.',
    'Design 2–8 cards. Return ONLY valid JSON:',
    '{',
    '  "name": "...",',
    '  "description": "...",',
    '  "category": "content|marketing|business|productivity|education|creative|personal",',
    '  "icon": "emoji",',
    '  "cells": [',
    '    {',
    '      "cellId": "A1",',
    '      "name": "...",',
    '      "prompt": "...",',
    '      "modelType": "text"|"image"|"video"|"audio",',
    '      "preferredModel": "gpt-4o-mini",',
    '      "temperature": 0.7,',
    '      "characterLimit": 0,',
    '      "outputFormat": "markdown"|"",',
    '      "autoRun": false,',
    '      "interval": 0,',
    '      "enableTools": false,',
    '      "enabledTools": { "tavily": false, "email": false, "telegram": false, "twilioSms": false },',
    '      "schedule": null',
    '    }',
    '  ]',
    '}'
  ].join('\n');

  const fullPrompt = `${systemPrompt}\n\nUser goal / task to automate:\n${String(userGoal).trim()}`;

  const result = await generateAI(fullPrompt, modelId, 0.35, 4096);
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

  const normalized = normalizeTemplateFromAI(parsed, getTextModelId);
  if (!normalized) {
    return { success: false, error: 'Generated template missing name or cells' };
  }

  const saveResult = await createTemplate(normalized);
  if (!saveResult.success) {
    return { success: false, error: saveResult.error || 'Failed to save template' };
  }

  const saved = { ...normalized, id: saveResult.id || normalized.id };
  return { success: true, template: saved };
}

/**
 * Resolve a template for the goal: reuse existing or create new.
 * @param {object} [options]
 * @param {string[]} [options.excludeTemplateIds] - ids to exclude from matching (hand-off)
 */
export async function resolveTemplateForGoal(userGoal, availableModels, options = {}) {
  const { excludeTemplateIds = [] } = options;
  const getTextModelId = () => pickTextModelId(availableModels);
  const templates = await loadAllTemplatesMerged();

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

  const created = await generateAndSaveTemplate(userGoal, getTextModelId);
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

    const resolved = await resolveTemplateForGoal(instruction, availableModels, { excludeTemplateIds });
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
