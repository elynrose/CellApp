/**
 * Run a scheduled sheet cell on the server (no browser).
 * Text models only; uses resolveDependencies with disableAlerts.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const admin = require('firebase-admin');
const { initializeFirebase, getGeminiApiKey } = require('./firebase-server-config');
const { executeTool } = require('./tools-executor');
const { getIntegrationSecretsForUser } = require('./integration-secrets');

let resolveDependenciesFn = null;
let cellToolsMod = null;

async function loadResolveDependencies() {
  if (resolveDependenciesFn) return resolveDependenciesFn;
  const url = pathToFileURL(path.join(__dirname, '../src/utils/dependencies.js')).href;
  const mod = await import(url);
  resolveDependenciesFn = mod.resolveDependencies;
  return resolveDependenciesFn;
}

async function loadCellTools() {
  if (cellToolsMod) return cellToolsMod;
  const url = pathToFileURL(path.join(__dirname, '../src/utils/cellTools.js')).href;
  cellToolsMod = await import(url);
  return cellToolsMod;
}

const MAX_TOOL_ROUNDS = 4;

function getModelType(modelId) {
  if (!modelId) return 'text';
  const id = String(modelId).toLowerCase();
  if (id.includes('dall-e') || id.includes('imagen')) return 'image';
  if (id.includes('sora')) return 'video';
  if (id.includes('tts')) return 'audio';
  return 'text';
}

function getCreditCost(modelType, modelId = '') {
  const id = String(modelId).toLowerCase();
  if (modelType === 'text') {
    if (id.includes('gpt-4o') || id.includes('gemini-1.5-pro')) return 2;
    return 1;
  }
  if (modelType === 'image') {
    if (id.includes('dall-e-3') || id.includes('imagen-3')) return 5;
    return 3;
  }
  if (modelType === 'video') return 20;
  if (modelType === 'audio') return id.includes('hd') ? 3 : 2;
  return 1;
}

async function getGeminiKeyForScheduledRun(firestore, userId) {
  const userDoc = await firestore.collection('users').doc(userId).get();
  if (userDoc.exists) {
    const g = userDoc.data()?.geminiApiKey;
    if (g && String(g).trim()) return { key: String(g).trim() };
  }
  await initializeFirebase();
  const k = await getGeminiApiKey();
  if (k && String(k).trim()) {
    const userDoc2 = await firestore.collection('users').doc(userId).get();
    const sub = userDoc2.exists ? userDoc2.data()?.subscription || 'free' : 'free';
    const isPro = sub === 'pro' || sub === 'enterprise';
    if (!isPro) {
      throw new Error('Pro subscription or user Gemini API key required for scheduled Gemini runs');
    }
    return { key: String(k).trim() };
  }
  return { key: null };
}

async function getOpenAiKeyForUser(firestore, userId) {
  const userDoc = await firestore.collection('users').doc(userId).get();
  if (!userDoc.exists) {
    return { key: process.env.OPENAI_API_KEY };
  }
  const d = userDoc.data();
  const userKey = d.openaiApiKey;
  const sub = d.subscription || 'free';
  const isPro = sub === 'pro' || sub === 'enterprise';
  if (userKey && String(userKey).trim()) {
    return { key: String(userKey).trim() };
  }
  if (!isPro) {
    throw new Error('Pro subscription or user OpenAI API key required for scheduled server runs');
  }
  const settingsDoc = await firestore.collection('settings').doc('openai').get();
  const fbKey = settingsDoc.exists ? settingsDoc.data()?.apiKey : null;
  return { key: fbKey || process.env.OPENAI_API_KEY };
}

async function deductCreditsTx(firestore, userId, amount) {
  const userRef = firestore.collection('users').doc(userId);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error('User not found');
    const cur = snap.data()?.credits?.current ?? 0;
    if (cur < amount) {
      throw new Error(`Insufficient credits (need ${amount}, have ${cur})`);
    }
    tx.update(userRef, {
      'credits.current': cur - amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}

async function callGeminiText(apiKey, model, prompt, temperature, maxTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens && maxTokens > 0 ? maxTokens : 2048
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini ${res.status}`);
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAiText(apiKey, model, prompt, temperature, maxTokens) {
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature
  };
  if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI ${res.status}`);
  }
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Text generation with optional tool rounds (parity with client cellExecution when enableTools is on).
 */
async function runTextWithOptionalTools({
  firestore,
  userId,
  cell,
  basePrompt,
  model,
  temperature,
  maxTokens,
  creditCost,
  getGeminiKey,
  getOpenAiKey
}) {
  const { CELL_TOOLS_INSTRUCTION, parseToolCallsFromText, isToolAllowedForCell, cellWantsTools } =
    await loadCellTools();

  if (!cellWantsTools(cell)) {
    const idLower = String(model).toLowerCase();
    const isGeminiText = idLower.includes('gemini') && !idLower.includes('imagen');
    let text;
    if (isGeminiText) {
      const { key: gKey } = await getGeminiKey();
      if (!gKey) throw new Error('No Gemini API key configured for scheduled runs');
      text = await callGeminiText(gKey, model, basePrompt, temperature, maxTokens);
    } else {
      const { key: apiKey } = await getOpenAiKey();
      if (!apiKey) throw new Error('No OpenAI API key available');
      text = await callOpenAiText(apiKey, model, basePrompt, temperature, maxTokens);
    }
    await deductCreditsTx(firestore, userId, creditCost);
    return text;
  }

  const secrets = await getIntegrationSecretsForUser(firestore, userId);
  let conversation = basePrompt + CELL_TOOLS_INSTRUCTION;
  let lastText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    await deductCreditsTx(firestore, userId, creditCost);

    const idLower = String(model).toLowerCase();
    const isGeminiText = idLower.includes('gemini') && !idLower.includes('imagen');
    if (isGeminiText) {
      const { key: gKey } = await getGeminiKey();
      if (!gKey) throw new Error('No Gemini API key configured for scheduled runs');
      lastText = await callGeminiText(gKey, model, conversation, temperature, maxTokens);
    } else {
      const { key: apiKey } = await getOpenAiKey();
      if (!apiKey) throw new Error('No OpenAI API key available');
      lastText = await callOpenAiText(apiKey, model, conversation, temperature, maxTokens);
    }

    const calls = parseToolCallsFromText(lastText).filter((c) => isToolAllowedForCell(cell, c.tool));
    if (!calls.length) {
      return lastText;
    }

    const results = [];
    for (const tc of calls) {
      const r = await executeTool(tc.tool, tc.args || {}, secrets);
      results.push({ tool: tc.tool, ok: r.ok, data: r.data, error: r.error });
    }
    const toolPayload = JSON.stringify(results, null, 2);
    conversation = `${conversation}\n\n[ASSISTANT]\n${lastText}\n\n[TOOL RESULTS]\n${toolPayload}\n\nWrite the final answer for the user (plain text, no tool blocks unless you must call another allowed tool).`;
  }

  return lastText;
}

/**
 * @param {FirebaseFirestore.Firestore} firestore
 */
async function runScheduledCellExecution(firestore, { userId, projectId, sheetId, cellId }) {
  const resolveDependencies = await loadResolveDependencies();

  const cellRef = firestore.doc(
    `users/${userId}/projects/${projectId}/sheets/${sheetId}/cells/${cellId}`
  );

  const cellSnap = await cellRef.get();
  if (!cellSnap.exists) throw new Error('Cell not found');
  const cell = { cell_id: cellId, ...cellSnap.data() };
  if (!cell.prompt || !String(cell.prompt).trim()) {
    throw new Error('Cell has no prompt');
  }
  if (!cell.autoRun) {
    throw new Error('autoRun must be enabled for scheduled runs');
  }

  const sheetsSnap = await firestore
    .collection(`users/${userId}/projects/${projectId}/sheets`)
    .get();
  const sheetDocs = [];
  sheetsSnap.forEach((d) => sheetDocs.push({ id: d.id, ...d.data() }));

  const cellsBySheet = {};
  for (const sh of sheetDocs) {
    const cSnap = await firestore
      .collection(`users/${userId}/projects/${projectId}/sheets/${sh.id}/cells`)
      .get();
    const map = {};
    cSnap.forEach((cd) => {
      map[cd.id] = { cell_id: cd.id, ...cd.data() };
    });
    cellsBySheet[sh.id] = map;
  }

  const currentSheet = sheetDocs.find((s) => s.id === sheetId);
  if (!currentSheet) throw new Error('Sheet not found');

  const sheets = sheetDocs.map((s) => ({
    ...s,
    cells: cellsBySheet[s.id] || {}
  }));

  const getLatestCells = () => cellsBySheet[sheetId] || {};

  const loadSheetCells = async (targetSheetId) => {
    if (cellsBySheet[targetSheetId]) return;
    const cSnap = await firestore
      .collection(`users/${userId}/projects/${projectId}/sheets/${targetSheetId}/cells`)
      .get();
    const map = {};
    cSnap.forEach((cd) => {
      map[cd.id] = { cell_id: cd.id, ...cd.data() };
    });
    cellsBySheet[targetSheetId] = map;
    const idx = sheets.findIndex((s) => s.id === targetSheetId);
    if (idx >= 0) sheets[idx].cells = map;
  };

  const getCell = async (targetSheetId, targetCellId) => {
    await loadSheetCells(targetSheetId);
    return cellsBySheet[targetSheetId]?.[targetCellId] || null;
  };

  const templatePrompt = cell.cellPrompt || '';
  const userPrompt = cell.prompt || '';
  let fullPrompt = templatePrompt ? `${templatePrompt}\n\n${userPrompt}` : userPrompt;
  if (cell.oversightDirective && String(cell.oversightDirective).trim()) {
    fullPrompt = `[Oversight — coordinated direction for this run]\n${String(
      cell.oversightDirective
    ).trim()}\n\n---\n\n${fullPrompt}`;
  }

  const resolvedPrompt = await resolveDependencies(fullPrompt, {
    sheets,
    currentSheet: { ...currentSheet, cells: cellsBySheet[sheetId] || {} },
    userId,
    projectId,
    getLatestCells,
    getCell,
    loadSheetCells,
    disableAlerts: true,
    skipClientGenerationFetch: true
  });

  let finalPrompt = resolvedPrompt;
  const outputFormat = cell.outputFormat || '';
  if (outputFormat && getModelType(cell.model) === 'text') {
    const formatMap = {
      markdown: 'Format your response as Markdown.',
      json: 'Format your response as valid JSON.',
      html: 'Format your response as HTML.',
      plain: 'Plain text only.',
      'bullet-list': 'Use a bulleted list.',
      'numbered-list': 'Use a numbered list.',
      code: 'Format as code.'
    };
    const fi = formatMap[outputFormat];
    if (fi) finalPrompt = `${finalPrompt}\n\n${fi}`;
  }

  const model = cell.model || 'gpt-3.5-turbo';
  const temperature = cell.temperature ?? 0.7;
  const characterLimit = cell.characterLimit || 0;
  const maxTokens = characterLimit > 0 ? Math.ceil(characterLimit / 4) : undefined;
  if (characterLimit > 0 && getModelType(model) === 'text') {
    finalPrompt = `${finalPrompt}\n\nIMPORTANT: Respond with at most ${characterLimit} characters.`;
  }

  const modelType = getModelType(model);
  if (modelType !== 'text') {
    throw new Error(
      `Scheduled server run supports text models only (got ${modelType}). Open the app for image/video/audio.`
    );
  }

  const creditCost = getCreditCost(modelType, model);

  const output = await runTextWithOptionalTools({
    firestore,
    userId,
    cell,
    basePrompt: finalPrompt,
    model,
    temperature,
    maxTokens,
    creditCost,
    getGeminiKey: () => getGeminiKeyForScheduledRun(firestore, userId),
    getOpenAiKey: () => getOpenAiKeyForUser(firestore, userId)
  });

  const generation = {
    prompt: userPrompt,
    resolvedPrompt: finalPrompt,
    output,
    model,
    temperature,
    type: 'text',
    status: 'completed',
    scheduledRun: true,
    timestamp: new Date()
  };

  const generations = [...(cell.generations || []), generation];

  await cellRef.set(
    {
      output,
      model,
      temperature,
      generations,
      lastServerRunAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await firestore
    .collection(
      `users/${userId}/projects/${projectId}/sheets/${sheetId}/cells/${cellId}/generations`
    )
    .add({
      ...generation,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

  return { success: true, output };
}

module.exports = { runScheduledCellExecution };
