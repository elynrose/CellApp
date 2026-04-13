/**
 * Per-card agentic reporting + helpers for the workspace orchestrator loop.
 */

/** Appended to text prompts so each card self-documents research/plan/review and reports upward. */
export function getAgentOrchestrationSuffix() {
  const tail = [
    '',
    '---',
    'Structure your answer with these Markdown sections (be concise but useful):',
    '## Research',
    '## Planning',
    '## Execution',
    '## Iteration',
    '## Review',
    '',
    'Then end with a **single** JSON code block (no other text after it) in this exact shape:',
    '```json',
    '{',
    '  "research": "short",',
    '  "planning": "short",',
    '  "execution_summary": "short",',
    '  "iteration_notes": "short",',
    '  "review": "short",',
    '  "next_steps": ["optional bullet for this card"],',
    '  "goal_alignment": "on_track|blocked|needs_input|done",',
    '  "report_to_orchestrator": "One paragraph: what this card did and how it advances the workspace main goal."',
    '}',
    '```',
    ''
  ].join('\n');
  return `\n${tail}`;
}

export function parseOrchestratorReportFromOutput(output) {
  if (!output || typeof output !== 'string') {
    return { parsed: null, displayOutput: output };
  }
  const re = /\n?```json\s*([\s\S]*?)```\s*$/;
  const m = output.match(re);
  if (!m) {
    return { parsed: null, displayOutput: output };
  }
  try {
    const parsed = JSON.parse(m[1].trim());
    const displayOutput = output.replace(re, '').trim();
    return { parsed, displayOutput };
  } catch {
    return { parsed: null, displayOutput: output };
  }
}

export function defaultMediaAgentReport(modelType) {
  return {
    research: 'N/A (media)',
    planning: 'N/A (media)',
    execution_summary: 'Media generated',
    iteration_notes: '',
    review: 'N/A',
    next_steps: [],
    goal_alignment: 'on_track',
    report_to_orchestrator: `This card produced ${modelType} output. Review the asset above relative to the workspace goal.`
  };
}
