/**
 * Model Configuration for GPT Cells App
 * This file defines the supported models and their capabilities
 */

const MODEL_CONFIG = {
  // Text Generation Models
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    type: 'text',
    provider: 'openai',
    description: 'Fast and efficient text generation',
    maxTokens: 4000,
    costPer1kTokens: 0.002
  },
  'gpt-4o': {
    name: 'GPT-4o',
    type: 'text',
    provider: 'openai',
    description: 'Most capable GPT-4 model',
    maxTokens: 4000,
    costPer1kTokens: 0.03
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    type: 'text',
    provider: 'openai',
    description: 'Faster and cheaper GPT-4 model',
    maxTokens: 4000,
    costPer1kTokens: 0.015
  },

  // Image Generation Models
  'dall-e-2': {
    name: 'DALL-E 2',
    type: 'image',
    provider: 'openai',
    description: 'High-quality image generation',
    maxTokens: null,
    costPer1kTokens: 0.02
  },
  'dall-e-3': {
    name: 'DALL-E 3',
    type: 'image',
    provider: 'openai',
    description: 'Latest DALL-E model with improved quality',
    maxTokens: null,
    costPer1kTokens: 0.04
  },
  'stable-diffusion-xl': {
    name: 'Stable Diffusion XL',
    type: 'image',
    provider: 'stability',
    description: 'Open-source image generation',
    maxTokens: null,
    costPer1kTokens: 0.01
  },
  'midjourney-v6': {
    name: 'Midjourney v6',
    type: 'image',
    provider: 'midjourney',
    description: 'Artistic image generation',
    maxTokens: null,
    costPer1kTokens: 0.05
  },
  'leonardo-ai': {
    name: 'Leonardo AI',
    type: 'image',
    provider: 'leonardo',
    description: 'Creative image generation',
    maxTokens: null,
    costPer1kTokens: 0.03
  },

  // Video Generation Models
  'runway-gen3': {
    name: 'Runway Gen-3',
    type: 'video',
    provider: 'runway',
    description: 'High-quality video generation',
    maxTokens: null,
    costPer1kTokens: 0.1
  },
  'pika-labs': {
    name: 'Pika Labs',
    type: 'video',
    provider: 'pika',
    description: 'AI video generation',
    maxTokens: null,
    costPer1kTokens: 0.08
  },
  'stable-video-diffusion': {
    name: 'Stable Video Diffusion',
    type: 'video',
    provider: 'stability',
    description: 'Open-source video generation',
    maxTokens: null,
    costPer1kTokens: 0.05
  },
  'sora': {
    name: 'Sora',
    type: 'video',
    provider: 'openai',
    description: 'OpenAI video generation (when available)',
    maxTokens: null,
    costPer1kTokens: 0.2
  },
  'sora-2': {
    name: 'Sora 2',
    type: 'video',
    provider: 'openai',
    description: 'OpenAI Sora 2 - Standard quality video generation (720p)',
    maxTokens: null,
    costPer1kTokens: 0.1, // $0.10 per second for 720p resolution
    originalId: 'sora-2' // API model identifier
  },
  'sora-2-pro': {
    name: 'Sora 2 Pro',
    type: 'video',
    provider: 'openai',
    description: 'OpenAI Sora 2 Pro - Cinematic quality video generation (720p or 1024p)',
    maxTokens: null,
    costPer1kTokens: 0.3, // $0.30 per second for 720p, $0.50 per second for 1024p
    originalId: 'sora-2-pro' // API model identifier
  },

  // Audio Generation Models
  'tts-1': {
    name: 'TTS-1',
    type: 'audio',
    provider: 'openai',
    description: 'Text-to-speech generation',
    maxTokens: null,
    costPer1kTokens: 0.015
  },
  'tts-1-hd': {
    name: 'TTS-1 HD',
    type: 'audio',
    provider: 'openai',
    description: 'High-definition text-to-speech',
    maxTokens: null,
    costPer1kTokens: 0.03
  },
  'elevenlabs': {
    name: 'ElevenLabs',
    type: 'audio',
    provider: 'elevenlabs',
    description: 'Natural voice synthesis',
    maxTokens: null,
    costPer1kTokens: 0.02
  },
  'whisper-1': {
    name: 'Whisper-1',
    type: 'audio',
    provider: 'openai',
    description: 'Speech-to-text transcription',
    maxTokens: null,
    costPer1kTokens: 0.006
  }
};

// Model type detection
function getModelType(modelId) {
  const model = MODEL_CONFIG[modelId];
  return model ? model.type : 'text';
}

// Get models by type
function getModelsByType(type) {
  return Object.entries(MODEL_CONFIG)
    .filter(([id, config]) => config.type === type)
    .map(([id, config]) => ({ id, ...config }));
}

// Get all available model types
function getAvailableTypes() {
  return [...new Set(Object.values(MODEL_CONFIG).map(model => model.type))];
}

// Provider-specific configurations
const PROVIDER_CONFIG = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer'
  },
  stability: {
    baseUrl: 'https://api.stability.ai/v1',
    authHeader: 'Authorization',
    authPrefix: 'Bearer'
  },
  replicate: {
    baseUrl: 'https://api.replicate.com/v1',
    authHeader: 'Authorization',
    authPrefix: 'Token'
  },
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io/v1',
    authHeader: 'xi-api-key',
    authPrefix: ''
  }
};

module.exports = {
  MODEL_CONFIG,
  getModelType,
  getModelsByType,
  getAvailableTypes,
  PROVIDER_CONFIG
};

