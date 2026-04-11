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

/**
 * Ask the model which existing template id fits the goal, or null.
 */
export async function findMatchingTemplateId(userGoal, templates, getTextModelId) {
  const modelId = getTextModelId();
  const compact = templates
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
 */
export async function resolveTemplateForGoal(userGoal, availableModels) {
  const getTextModelId = () => pickTextModelId(availableModels);
  const templates = await loadAllTemplatesMerged();

  const match = await findMatchingTemplateId(userGoal, templates, getTextModelId);
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
