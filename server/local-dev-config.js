/**
 * Local Development Configuration
 * Handles local development setup and fallback configurations
 */

/**
 * Initialize local development environment
 */
async function initializeLocalDev() {
  try {
    // Check if we have required environment variables
    const requiredEnvVars = ['OPENAI_API_KEY', 'GEMINI_API_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn(`[local-dev] Missing env vars: ${missingVars.join(', ')}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[local-dev] Failed to initialize local dev config', error);
    return false;
  }
}

/**
 * Get OpenAI API key for local development
 */
function getOpenAIApiKeyLocal() {
  return process.env.OPENAI_API_KEY;
}

/**
 * Get Gemini API key for local development
 */
function getGeminiApiKeyLocal() {
  return process.env.GEMINI_API_KEY;
}

/**
 * Get active models for local development
 */
async function getActiveModelsLocal() {
  // Return a default set of models for local development (OpenAI and Gemini only)
  return [
    // OpenAI models
    {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      type: 'text',
      provider: 'openai',
      active: true
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      type: 'text',
      provider: 'openai',
      active: true
    },
    {
      id: 'dall-e-3',
      name: 'DALL-E 3',
      type: 'image',
      provider: 'openai',
      active: true
    },
    {
      id: 'sora-2',
      name: 'Sora 2',
      type: 'video',
      provider: 'openai',
      description: 'OpenAI Sora 2 - Standard quality video generation',
      active: true
    },
    {
      id: 'sora-2-pro',
      name: 'Sora 2 Pro',
      type: 'video',
      provider: 'openai',
      description: 'OpenAI Sora 2 Pro - Cinematic quality video generation',
      active: true
    },
    // Gemini models
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      type: 'text',
      provider: 'gemini',
      active: true
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      type: 'text',
      provider: 'gemini',
      active: true
    }
  ];
}

module.exports = {
  initializeLocalDev,
  getOpenAIApiKeyLocal,
  getGeminiApiKeyLocal,
  getActiveModelsLocal
};