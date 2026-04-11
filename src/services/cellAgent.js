/**
 * Per-cell agentic execution: plan → execute steps → critique → optional retry → downstream handoff.
 * Uses the same /api/llm stack as single-shot cells; records a structured agentLog on the generation.
 */

import { generateAI, getModelType } from '../api';
import { parseDependencies, findDependentCells } from '../utils/dependencies';
import { extractCellIdFromReference } from '../utils/connections';
import { deductCredits, getUserSubscription, resetMonthlyCredits } from '../firebase/firestore';
import { getCreditCost, hasEnoughCredits, getPlanById } from './subscriptions';

const MAX_STEPS = 8;
const MAX_STEP_RETRIES = 2;
const TEXT_PREVIEW = 600;

function truncate(s, n = TEXT_PREVIEW) {
  if (s == null) return '';
  const str = String(s);
  if (str.length <= n) return str;
  return `${str.slice(0, n)}…`;
}

/**
 * Summarize neighbor cards (prompt refs, manual edges, dependents).
 */
export function buildNeighborGraph({
  cellId,
  getLatestCells,
  sheets,
  currentSheet,
  manualConnections = [],
  runningCellsSet = null
}) {
  const cells = getLatestCells ? getLatestCells() : currentSheet?.cells || {};
  const cell = cells[cellId];
  const depsFromPrompt =
    cell?.prompt && typeof cell.prompt === 'string'
      ? parseDependencies(cell.prompt)
          .map((d) => extractCellIdFromReference(d))
          .filter(Boolean)
      : [];

  const upstreamFromEdges = [];
  const downstreamFromEdges = [];
  for (const c of manualConnections || []) {
    if (c.target_cell_id === cellId) upstreamFromEdges.push(c.source_cell_id);
    if (c.source_cell_id === cellId) downstreamFromEdges.push(c.target_cell_id);
  }

  const upstreamIds = new Set([...depsFromPrompt, ...upstreamFromEdges]);
  const dependentRefs = findDependentCells(cellId, sheets);
  const downstreamIds = new Set(
    dependentRefs.filter((d) => d.sheetId === currentSheet.id).map((d) => d.cellId)
  );
  for (const id of downstreamFromEdges) downstreamIds.add(id);

  const summarize = (cid) => {
    const oc = cells[cid];
    if (!oc) {
      return { cellId: cid, missing: true };
    }
    const running =
      runningCellsSet?.has(cid) ||
      oc.status === 'running' ||
      oc.status === 'pending' ||
      !!oc.jobId;
    const status = running ? 'running_or_pending' : oc.status || 'idle';
    return {
      cellId: cid,
      model: oc.model || null,
      status,
      running: !!running,
      agentMode: !!oc.agentMode,
      autoRun: !!oc.autoRun,
      promptPreview: truncate(oc.prompt || '', 280),
      outputPreview: truncate((oc.output || '').toString(), 400)
    };
  };

  return {
    cellId,
    upstream: [...upstreamIds].map(summarize),
    downstream: [...downstreamIds].map(summarize)
  };
}

function parseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function ensureCredits(userId, subscriptionDataRef) {
  const subscriptionInfo = await getUserSubscription(userId);
  if (!subscriptionInfo.success) {
    throw new Error('Failed to check subscription status');
  }
  let subscriptionData = subscriptionInfo.data;
  const nextReset = subscriptionData?.credits?.nextReset;
  if (nextReset) {
    let nextResetDate;
    if (nextReset.toDate) nextResetDate = nextReset.toDate();
    else if (nextReset.seconds) nextResetDate = new Date(nextReset.seconds * 1000);
    else if (nextReset instanceof Date) nextResetDate = nextReset;
    else nextResetDate = new Date(nextReset);
    if (new Date() >= nextResetDate) {
      const planId = subscriptionData.subscription || 'free';
      const plan = await getPlanById(planId);
      await resetMonthlyCredits(userId, planId, plan.monthlyCredits);
      const updated = await getUserSubscription(userId);
      if (updated.success) subscriptionData = updated.data;
    }
  }
  subscriptionDataRef.current = subscriptionData;
  return subscriptionData;
}

async function payForGeneration(userId, model, subscriptionDataRef) {
  const modelType = getModelType(model);
  const creditCost = getCreditCost(modelType, model);
  const current = subscriptionDataRef.current?.credits?.current ?? 0;
  if (!hasEnoughCredits(current, creditCost)) {
    throw new Error(
      `Insufficient credits. You need ${creditCost} credits but only have ${current}. Please upgrade your subscription.`
    );
  }
  const deductResult = await deductCredits(userId, creditCost);
  if (!deductResult.success) {
    throw new Error(deductResult.error || 'Failed to deduct credits');
  }
  if (subscriptionDataRef.current?.credits) {
    subscriptionDataRef.current.credits.current = deductResult.remainingCredits;
  }
  return creditCost;
}

/**
 * Run agentic pipeline for one cell; returns data to merge into generation + cell output.
 */
export async function runCellAgentExecution({
  cellId,
  cell,
  userId,
  projectId,
  sheetId,
  sheets,
  currentSheet,
  getLatestCells,
  runningCellsSet,
  manualConnections = [],
  onHandoffDownstream,
  onProgress
}) {
  const defaultModel = cell.model || 'gpt-3.5-turbo';
  const temperature = cell.temperature ?? 0.7;
  const userPrompt = cell.prompt || '';
  const templatePrompt = cell.cellPrompt || '';
  const fullUserGoal = templatePrompt ? `${templatePrompt}\n\n${userPrompt}` : userPrompt;

  const subscriptionDataRef = { current: null };
  await ensureCredits(userId, subscriptionDataRef);

  const graph = buildNeighborGraph({
    cellId,
    getLatestCells,
    sheets,
    currentSheet,
    manualConnections,
    runningCellsSet
  });

  const agentLog = {
    mode: 'agent',
    startedAt: new Date().toISOString(),
    graph,
    events: []
  };

  const pushEvent = (type, payload) => {
    agentLog.events.push({
      t: new Date().toISOString(),
      type,
      ...payload
    });
  };

  pushEvent('context', { message: 'Built neighbor graph for agent' });

  const planPrompt = `You are a planning component for a single "card" on a visual AI canvas.

User goal for THIS card:
"""
${fullUserGoal}
"""

Neighbor cards (upstream = inputs this card depends on; downstream = cards that may consume this card's result):
${JSON.stringify(graph, null, 2)}

Respond with ONLY valid JSON (no markdown) in this shape:
{
  "steps": [
    { "id": "1", "title": "short label", "description": "what to do", "useModel": "${defaultModel}" }
  ],
  "notes": "optional string"
}

Rules:
- Provide 1-${MAX_STEPS} concrete steps to achieve the user goal.
- Later steps may build on earlier steps; keep order logical.
- useModel must be a model id appropriate for the step (text vs image vs video vs audio). If unsure, use "${defaultModel}".
- Be concise.`;

  let creditsUsed = 0;

  const planResult = await generateAI(planPrompt, defaultModel, Math.min(temperature, 0.5), 4096);
  if (!planResult.success) {
    throw new Error(planResult.error || 'Planner failed');
  }
  creditsUsed += await payForGeneration(userId, defaultModel, subscriptionDataRef);

  const planJson = parseJsonFromText(planResult.output || '');
  const steps = Array.isArray(planJson?.steps) ? planJson.steps.slice(0, MAX_STEPS) : [];
  pushEvent('plan', { raw: truncate(planResult.output || '', 2000), parsed: planJson });

  if (steps.length === 0) {
    pushEvent('warning', { message: 'Planner returned no steps; falling back to single-shot synthesis.' });
    const fb = await generateAI(
      `Achieve this goal in one response:\n${fullUserGoal}`,
      defaultModel,
      temperature
    );
    if (!fb.success) throw new Error(fb.error || 'Fallback generation failed');
    creditsUsed += await payForGeneration(userId, defaultModel, subscriptionDataRef);
    const out = fb.output || '';
    agentLog.summary = 'Completed with fallback (no structured plan).';
    agentLog.finishedAt = new Date().toISOString();
    return {
      success: true,
      output: out,
      resolvedPrompt: fullUserGoal,
      agentLog,
      creditsUsed,
      handoffTargets: graph.downstream.map((d) => d.cellId).filter(Boolean)
    };
  }

  const stepOutputs = [];
  let lastGoodOutput = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepModel = step.useModel || defaultModel;
    const stepType = getModelType(stepModel);

    let stepOutput = '';
    let lastError = null;
    let critiqueHint = '';

    for (let attempt = 1; attempt <= MAX_STEP_RETRIES; attempt++) {
      await ensureCredits(userId, subscriptionDataRef);

      const execPrompt = `You are executing one step for a canvas card.

Overall user goal:
${fullUserGoal}

Plan (all steps): ${JSON.stringify(steps.map((s) => ({ id: s.id, title: s.title })))}

Completed prior step outputs (most recent last):
${stepOutputs.length ? stepOutputs.map((o, idx) => `Step ${idx + 1}: ${truncate(o, 1200)}`).join('\n\n') : '(none yet)'}

Current step (${step.id || i + 1}): ${step.title || 'step'}
Details: ${step.description || ''}
${critiqueHint ? `\nImprove this attempt. Previous critique: ${critiqueHint}\n` : ''}
Produce the best output for ONLY this step. If the step needs code, include it. If it needs a short user-facing answer, be direct.`;

      let videoSettings;
      if (stepType === 'video') {
        const secondsStr = String(cell.videoSeconds || '8');
        const validSeconds = ['4', '8', '12'];
        videoSettings = {
          seconds: validSeconds.includes(secondsStr) ? secondsStr : '8',
          resolution: cell.videoResolution || '720p',
          aspectRatio: cell.videoAspectRatio || '9:16'
        };
      }
      let audioSettings;
      if (stepType === 'audio') {
        audioSettings = {
          voice: cell.audioVoice || 'alloy',
          speed: cell.audioSpeed ?? 1.0,
          format: cell.audioFormat || 'mp3'
        };
      }

      const gen = await generateAI(
        execPrompt,
        stepModel,
        temperature,
        undefined,
        videoSettings,
        audioSettings,
        userId
      );

      if (!gen.success) {
        lastError = gen.error || 'step failed';
        pushEvent('step_error', { step: step.id || String(i), attempt, error: lastError });
        if (attempt === MAX_STEP_RETRIES) break;
        continue;
      }

      if (gen.jobId && gen.status) {
        pushEvent('step_async', {
          step: step.id || String(i),
          message:
            'Async job created; this step cannot be critiqued inline. Prefer text models for full agent logging.',
          jobId: gen.jobId
        });
        creditsUsed += await payForGeneration(userId, stepModel, subscriptionDataRef);
        stepOutput = `[Async job ${gen.jobId} — polling required; consider text models for full agent steps.]`;
        break;
      }

      creditsUsed += await payForGeneration(userId, stepModel, subscriptionDataRef);
      stepOutput = gen.output || '';

      const critiquePrompt = `You critique an AI step output.

User goal: ${truncate(fullUserGoal, 800)}
Step: ${step.title || ''} — ${step.description || ''}
Output:
"""
${truncate(stepOutput, 3000)}
"""

Reply with ONLY valid JSON: {"pass": true or false, "reason": "short explanation"}`;

      const crit = await generateAI(critiquePrompt, defaultModel, 0.3, 512);
      if (!crit.success) {
        pushEvent('critique_skipped', { error: crit.error });
        break;
      }
      creditsUsed += await payForGeneration(userId, defaultModel, subscriptionDataRef);
      const critJson = parseJsonFromText(crit.output || '');
      const pass = critJson?.pass === true;
      pushEvent('critique', {
        step: step.id || String(i),
        attempt,
        pass,
        reason: critJson?.reason || truncate(crit.output || '', 200)
      });
      if (pass) break;
      critiqueHint = critJson?.reason || truncate(crit.output || '', 400);
      if (attempt === MAX_STEP_RETRIES) break;
    }

    if (!stepOutput) {
      throw new Error(lastError || `Step ${i + 1} failed`);
    }

    stepOutputs.push(stepOutput);
    lastGoodOutput = stepOutput || lastGoodOutput;
    pushEvent('step_done', {
      step: step.id || String(i + 1),
      title: step.title,
      outputPreview: truncate(stepOutput, 500)
    });
  }

  await ensureCredits(userId, subscriptionDataRef);
  const synthesizePrompt = `You are the final response for one canvas card.

Original user goal:
${fullUserGoal}

The agent executed ${steps.length} step(s). Step outputs:
${stepOutputs.map((o, idx) => `--- Step ${idx + 1} ---\n${o}`).join('\n\n')}

Write the single user-facing result for this card: clear, complete, and aligned with the goal. If the goal asked for a specific format, follow it.`;

  const finalGen = await generateAI(synthesizePrompt, defaultModel, temperature, 4096);
  if (!finalGen.success) {
    pushEvent('synthesize_fallback', { error: finalGen.error });
    agentLog.summary = 'Used last step output (synthesis failed).';
    agentLog.finishedAt = new Date().toISOString();
    return {
      success: true,
      output: lastGoodOutput || stepOutputs[stepOutputs.length - 1] || '',
      resolvedPrompt: fullUserGoal,
      agentLog,
      creditsUsed,
      handoffTargets: graph.downstream.map((d) => d.cellId).filter(Boolean)
    };
  }
  creditsUsed += await payForGeneration(userId, defaultModel, subscriptionDataRef);
  const finalOutput = finalGen.output || lastGoodOutput;

  agentLog.summary = `Completed ${steps.length} step(s); final synthesis with ${defaultModel}.`;
  agentLog.finishedAt = new Date().toISOString();

  const handoffTargets = [...new Set(graph.downstream.map((d) => d.cellId).filter(Boolean))];

  if (onHandoffDownstream && handoffTargets.length) {
    pushEvent('handoff', { targets: handoffTargets });
    try {
      await onHandoffDownstream(handoffTargets, { sourceCellId: cellId, agentLogSummary: agentLog.summary });
    } catch (e) {
      pushEvent('handoff_error', { error: e?.message || String(e) });
    }
  }

  if (onProgress) {
    onProgress({ status: 'agent_complete', cellId, message: agentLog.summary });
  }

  return {
    success: true,
    output: finalOutput,
    resolvedPrompt: fullUserGoal,
    agentLog,
    creditsUsed,
    handoffTargets
  };
}
