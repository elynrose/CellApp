/**
 * API Service - Backend API integration for AI generation
 */

import { auth } from './firebase/config';

async function getAuthHeaders() {
  try {
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Get API base URL based on environment
 */
function getApiBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    // Use relative URL in development to leverage Vite proxy
    return '';
  }
  return 'https://gpt-cells-app-production.up.railway.app';
}

const API_BASE_URL = getApiBaseUrl();

/**
 * AI Generation - Call backend API for text/image/video/audio generation
 */
export async function generateAI(prompt, model, temperature = 0.7, maxTokens = undefined, videoSettings = undefined, audioSettings = undefined, userId = undefined) {
  try {
    const requestBody = {
      prompt,
      model,
      temperature
    };
    
    // Add max_tokens if specified (for text generation)
    if (maxTokens !== undefined && maxTokens > 0) {
      requestBody.max_tokens = maxTokens;
    }

    // Add video settings if specified (for video generation)
    // CRITICAL: seconds must be a string ('4', '8', or '12'), not a number
    if (videoSettings) {
      if (videoSettings.seconds !== undefined && videoSettings.seconds !== null) {
        // Convert to string and ensure it's one of the valid values
        const secondsStr = String(videoSettings.seconds);
        const validSeconds = ['4', '8', '12'];
        requestBody.videoSeconds = validSeconds.includes(secondsStr) ? secondsStr : '8';
        console.log(`🎬 Frontend: Setting videoSeconds to "${requestBody.videoSeconds}" (type: ${typeof requestBody.videoSeconds})`);
      }
      if (videoSettings.resolution) {
        requestBody.videoResolution = videoSettings.resolution;
      }
      if (videoSettings.aspectRatio) {
        requestBody.videoAspectRatio = videoSettings.aspectRatio;
      }
    }

    // Add audio settings if specified (for audio generation)
    if (audioSettings) {
      if (audioSettings.voice) {
        requestBody.audioVoice = audioSettings.voice;
      }
      if (audioSettings.speed !== undefined && audioSettings.speed !== null) {
        requestBody.audioSpeed = audioSettings.speed;
      }
      if (audioSettings.format) {
        requestBody.audioFormat = audioSettings.format;
      }
      console.log(`🎵 Frontend: Audio settings:`, { voice: requestBody.audioVoice, speed: requestBody.audioSpeed, format: requestBody.audioFormat });
    }

    // FINAL CHECK: Log exactly what we're sending
    if (requestBody.videoSeconds !== undefined) {
      console.log(`🚀 FINAL seconds sent to server: "${requestBody.videoSeconds}", TYPE: ${typeof requestBody.videoSeconds}`);
      if (typeof requestBody.videoSeconds !== 'string') {
        console.error(`❌❌❌ BUG: videoSeconds is ${typeof requestBody.videoSeconds} in request body!`);
        console.error(`   Value: ${requestBody.videoSeconds}`);
        // Force it to string as last resort
        requestBody.videoSeconds = String(requestBody.videoSeconds);
        console.error(`   ✅ Fixed to: "${requestBody.videoSeconds}" (type: ${typeof requestBody.videoSeconds})`);
      }
    }
    
    // CRITICAL: Log the actual JSON string being sent
    const jsonBody = JSON.stringify(requestBody);
    console.log(`📤 JSON body being sent: ${jsonBody}`);
    
    // Parse it back to verify
    const verify = JSON.parse(jsonBody);
    if (verify.videoSeconds !== undefined) {
      console.log(`🔍 Verification - videoSeconds in JSON: "${verify.videoSeconds}", TYPE: ${typeof verify.videoSeconds}`);
      if (typeof verify.videoSeconds !== 'string') {
        console.error(`❌❌❌ CRITICAL: JSON.stringify converted it to a number!`);
        console.error(`   This means the JSON will have "videoSeconds":${verify.videoSeconds} instead of "videoSeconds":"${verify.videoSeconds}"`);
        // Fix it by manually constructing the JSON
        const fixedBody = {
          ...requestBody,
          videoSeconds: String(requestBody.videoSeconds)
        };
        const fixedJson = JSON.stringify(fixedBody);
        console.error(`   ✅ Fixed JSON: ${fixedJson}`);
        // Use the fixed JSON
        const response = await fetch(`${API_BASE_URL}/api/llm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: fixedJson,
        });
        // ... rest of the code
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }
        const data = await response.json();
        return { success: true, output: data.text || data.output || '' };
      }
    }
    
    const response = await fetch(`${API_BASE_URL}/api/llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
      body: jsonBody,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Check if response is a job (for async operations like video generation)
    if (data.jobId && data.status) {
      return { 
        success: true, 
        jobId: data.jobId,
        status: data.status,
        type: data.type || 'video',
        output: null // Will be set when job completes
      };
    }
    
    return { success: true, output: data.text || data.output || '' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check job status (for video/image generation)
 */
export async function checkJobStatus(jobId, userId = null) {
  try {
    const API_BASE_URL = getApiBaseUrl();
    // Server derives userId from Firebase ID token (Authorization header).
    const url = `${API_BASE_URL}/api/job-status/${jobId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(await getAuthHeaders()),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      // Ensure error is a string, not an object
      const errorMessage = typeof errorData.error === 'string' 
        ? errorData.error 
        : (errorData.error?.message || JSON.stringify(errorData.error) || `API error: ${response.status}`);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return { 
      success: true, 
      status: data.status,
      videoUrl: data.videoUrl || null,
      jobId: data.jobId
    };
  } catch (error) {
    // Ensure error message is always a string
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    return { success: false, error: errorMessage };
  }
}

/**
 * Get available AI models
 */
export async function getAvailableModels() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/models`, {
      headers: {
        ...(await getAuthHeaders()),
      }
    });
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    return { success: true, models: data.models || [] };
  } catch (error) {
    return { success: false, error: error.message, models: [] };
  }
}

/**
 * Legacy SQLite endpoints (for backward compatibility during migration)
 */
export const fetchSheets = async () => {
    const response = await fetch(`${API_BASE_URL}/api/sheets`, {
      headers: {
        ...(await getAuthHeaders()),
      }
    });
    if (!response.ok) throw new Error('Failed to fetch sheets');
    return response.json();
};

export const fetchCells = async (sheetId) => {
    const response = await fetch(`${API_BASE_URL}/api/sheets/${sheetId}/cells`, {
      headers: {
        ...(await getAuthHeaders()),
      }
    });
    if (!response.ok) throw new Error('Failed to fetch cells');
    return response.json();
};

export const saveCell = async (sheetId, cellId, data) => {
    const response = await fetch(`${API_BASE_URL}/api/save-cell`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ sheetId, cellId, ...data }),
    });
    if (!response.ok) throw new Error('Failed to save cell');
    return response.json();
};

export const createSheet = async (name) => {
    const response = await fetch(`${API_BASE_URL}/api/sheets`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ name })
    });
    return response.json();
};

export const deleteSheet = async (id) => {
    await fetch(`${API_BASE_URL}/api/sheets/${id}`, { 
      method: 'DELETE',
      headers: {
        ...(await getAuthHeaders()),
      }
    });
};

export const renameSheet = async (id, name) => {
    await fetch(`${API_BASE_URL}/api/sheets/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ name })
    });
};

export const fetchConnections = async (sheetId) => {
    const response = await fetch(`${API_BASE_URL}/api/sheets/${sheetId}/connections`, {
      headers: {
        ...(await getAuthHeaders()),
      }
    });
    if (!response.ok) throw new Error('Failed to fetch connections');
    return response.json();
};

export const saveConnection = async (sheetId, sourceId, targetId) => {
    const response = await fetch(`${API_BASE_URL}/api/connections`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ sheetId, sourceId, targetId, action: 'create' })
    });
    if (!response.ok) throw new Error('Failed to save connection');
    return response.json();
};

export const deleteConnection = async (sheetId, sourceId, targetId) => {
    const response = await fetch(`${API_BASE_URL}/api/connections`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ sheetId, sourceId, targetId, action: 'delete' })
    });
    if (!response.ok) throw new Error('Failed to delete connection');
    return response.json();
};

/**
 * Get model type from model ID
 */
export function getModelType(modelId) {
  if (!modelId) return 'text';
  
  const id = modelId.toLowerCase();
  
  // Image generation models (OpenAI DALL-E, Gemini Imagen)
  if (id.includes('dall-e') || id.includes('imagen')) {
    return 'image';
  }
  
  // Video generation models (OpenAI Sora)
  if (id.includes('sora')) {
    return 'video';
  }
  
  // Audio generation models (OpenAI TTS)
  if (id.includes('tts')) {
    return 'audio';
  }
  
  // Default to text (OpenAI GPT, Gemini)
  return 'text';
}
