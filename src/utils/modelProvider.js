/**
 * Infer backend provider from model id for /api/llm routing.
 * Keep in sync with server `inferProviderFromModel` in server/server.js.
 */
export function inferProviderFromModel(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return 'openai';
  if (m.includes('gemini') || m.includes('imagen')) return 'gemini';
  if (m.startsWith('claude') || m.includes('anthropic/')) return 'anthropic';
  if (
    m.startsWith('mistral') ||
    m.startsWith('ministral') ||
    m.startsWith('mixtral') ||
    m.startsWith('codestral')
  ) {
    return 'mistral';
  }
  if (m.startsWith('deepseek')) return 'deepseek';
  if (m.startsWith('openrouter/') || m.includes('openrouter')) return 'openrouter';
  if (m.startsWith('grok-') || m.startsWith('grok/') || m.startsWith('x-ai/') || m.startsWith('xai/')) {
    return 'grok';
  }
  if (m.startsWith('ollama:') || m.startsWith('ollama/')) return 'ollama';
  if (m.startsWith('lmstudio') || m.startsWith('lm-studio') || m.includes('lm_studio')) {
    return 'lmstudio';
  }
  if (m.includes('fal-ai/') || m.startsWith('fal/') || m.startsWith('fal:')) return 'fal';
  return 'openai';
}
