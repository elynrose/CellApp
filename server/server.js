/**
 * Draftai Application Server
 * A Node.js server providing AI-powered brainstorming functionality
 * with support for text, image, video, and audio generation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');
const sqlite3 = require('sqlite3').verbose();
const OpenAI = require('openai');

// Load environment variables from .env file
// Look for .env in the parent directory (root) since that's where it's typically located
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Initialize Stripe
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('✅ Stripe initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Stripe:', error.message);
  }
} else {
  console.log('⚠️ Stripe secret key not found, subscription features disabled');
}

// Firebase server integration for cloud deployment
const { initializeFirebase, getOpenAIApiKey, getGeminiApiKey, getActiveModelsFromFirebase, diagnoseFirebaseModels } = require('./firebase-server-config');
const admin = require('firebase-admin');

/**
 * Get user's API key and check subscription
 */
async function getUserApiKeyAndSubscription(userId) {
  try {
    const firestoreInstance = await initializeFirebase();
    
    if (!firestoreInstance || !userId) {
      return { hasUserApiKey: false, apiKey: null, isPro: false };
    }
    
    const userDoc = await firestoreInstance.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { hasUserApiKey: false, apiKey: null, isPro: false };
    }
    
    const userData = userDoc.data();
    const userApiKey = userData.openaiApiKey;
    const subscription = userData.subscription || 'free';
    const isPro = subscription === 'pro' || subscription === 'enterprise';
    
    return {
      hasUserApiKey: !!userApiKey && userApiKey.trim() !== '',
      apiKey: userApiKey || null,
      isPro: isPro
    };
  } catch (error) {
    console.error('Error getting user API key:', error);
    return { hasUserApiKey: false, apiKey: null, isPro: false };
  }
}

// Local development configuration
const { initializeLocalDev, getActiveModelsLocal } = require('./local-dev-config');

// Configuration
const publicDir = path.join(__dirname, 'public');
const port = process.env.PORT || 3000;


// Rate limiting configuration
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW) || 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100; // Max requests per window
const rateLimitMap = new Map();

// Cache for available models
let availableModels = [];
let modelsCacheTime = 0;
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION) || 5 * 60 * 1000; // 5 minutes

// Circuit breaker for API requests
let apiRequestInProgress = false;

// Database setup
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'spreadsheet.db');
let db;

/**
 * Rate limiting middleware
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const requests = rateLimitMap.get(ip);
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  rateLimitMap.set(ip, validRequests);

  if (validRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  validRequests.push(now);
  return true;
}

/**
 * Enhanced error handling
 */
function handleError(res, statusCode, message, error = null) {
  // Log error for monitoring (production logging)
  if (error) {
    // In production, you might want to send this to a logging service
    // For now, we'll just ensure the error is handled gracefully
  }

  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Return the actual error message so the frontend can surface useful details
  // (If you ever expose this publicly, you may want to sanitize for 5xx codes.)
  const sanitizedMessage = message || 'Internal server error';
  res.end(JSON.stringify({
    error: sanitizedMessage,
    timestamp: new Date().toISOString(),
    status: statusCode
  }));
}

/**
 * Initialize SQLite database
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Create tables
      db.serialize(() => {
        // Sheets table
        db.run(`
          CREATE TABLE IF NOT EXISTS sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            num_rows INTEGER DEFAULT 10,
            num_cols INTEGER DEFAULT 10,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Cells table
        db.run(`
          CREATE TABLE IF NOT EXISTS cells (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL,
            cell_id TEXT NOT NULL,
            prompt TEXT,
            output TEXT,
            model TEXT DEFAULT 'gpt-3.5-turbo',
            temperature REAL DEFAULT 0.7,
            x INTEGER DEFAULT 0,
            y INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sheet_id) REFERENCES sheets (id),
            UNIQUE(sheet_id, cell_id)
          )
        `);

        // Connections table
        db.run(`
          CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL,
            source_cell_id TEXT NOT NULL,
            target_cell_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sheet_id) REFERENCES sheets (id),
            UNIQUE(sheet_id, source_cell_id, target_cell_id)
          )
        `);

        // Cell history table
        db.run(`
          CREATE TABLE IF NOT EXISTS cell_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL,
            cell_id TEXT NOT NULL,
            prompt TEXT,
            output TEXT,
            model TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sheet_id) REFERENCES sheets (id)
          )
        `);

        // Check and add missing columns to existing tables
        db.get("PRAGMA table_info(cells)", (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          // Check if model column exists
          db.all("PRAGMA table_info(cells)", (err, columns) => {
            if (err) {
              reject(err);
              return;
            }

            const hasModel = columns.some(col => col.name === 'model');
            const hasTemperature = columns.some(col => col.name === 'temperature');

            if (!hasModel) {
              db.run("ALTER TABLE cells ADD COLUMN model TEXT DEFAULT 'gpt-3.5-turbo'", (err) => {
                if (err) { }
              });
            }


            if (!hasTemperature) {
              db.run("ALTER TABLE cells ADD COLUMN temperature REAL DEFAULT 0.7", (err) => {
                if (err) { }
              });
            }

            const hasX = columns.some(col => col.name === 'x');
            const hasY = columns.some(col => col.name === 'y');

            if (!hasX) {
              db.run("ALTER TABLE cells ADD COLUMN x INTEGER DEFAULT 0", (err) => {
                if (err) { }
              });
            }

            if (!hasY) {
              db.run("ALTER TABLE cells ADD COLUMN y INTEGER DEFAULT 0", (err) => {
                if (err) { }
              });
            }

            // Check if sheets table has num_rows and num_cols
            db.all("PRAGMA table_info(sheets)", (err, sheetColumns) => {
              if (err) {
                reject(err);
                return;
              }

              const hasNumRows = sheetColumns.some(col => col.name === 'num_rows');
              const hasNumCols = sheetColumns.some(col => col.name === 'num_cols');

              if (!hasNumRows) {
                db.run("ALTER TABLE sheets ADD COLUMN num_rows INTEGER DEFAULT 10", (err) => {
                  if (err) { }
                });
              }

              if (!hasNumCols) {
                db.run("ALTER TABLE sheets ADD COLUMN num_cols INTEGER DEFAULT 10", (err) => {
                  if (err) { }
                });
              }

              // Create default sheet if none exists
              db.get("SELECT COUNT(*) as count FROM sheets", (err, row) => {
                if (err) {
                  reject(err);
                  return;
                }

                if (row.count === 0) {
                  db.run("INSERT INTO sheets (name) VALUES ('Sheet1')", (err) => {
                    if (err) {
                      reject(err);
                      return;
                    }
                    resolve();
                  });
                } else {
                  resolve();
                }
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Database functions
 */



/**
 * Save a connection
 */
function saveConnection(sheetId, sourceId, targetId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO connections (sheet_id, source_cell_id, target_cell_id)
      VALUES (?, ?, ?)
    `);
    stmt.run([sheetId, sourceId, targetId], function (err) {
      if (err) { reject(err); return; }
      resolve(this.changes);
    });
    stmt.finalize();
  });
}

/**
 * Delete a connection
 */
function deleteConnection(sheetId, sourceId, targetId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      DELETE FROM connections 
      WHERE sheet_id = ? AND source_cell_id = ? AND target_cell_id = ?
    `);
    stmt.run([sheetId, sourceId, targetId], function (err) {
      if (err) { reject(err); return; }
      resolve(this.changes);
    });
    stmt.finalize();
  });
}

/**
 * Get connections for a sheet
 */
function getConnections(sheetId) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM connections WHERE sheet_id = ?", [sheetId], (err, rows) => {
      if (err) { reject(err); return; }
      resolve(rows);
    });
  });
}

/**
 * Get all sheets from database
 */
function getSheets() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM sheets ORDER BY created_at", (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * Get cells for a specific sheet
 */
function getSheetCells(sheetId) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM cells WHERE sheet_id = ?", [sheetId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * Save or update a cell
 */
function saveCell(sheetId, cellId, prompt, output, model = 'gpt-3.5-turbo', temperature = 0.7, x = 0, y = 0) {
  return new Promise((resolve, reject) => {
    // First get existing coordinates if not provided
    if (x === undefined || y === undefined) {
      db.get("SELECT x, y FROM cells WHERE sheet_id = ? AND cell_id = ?", [sheetId, cellId], (err, row) => {
        const currentX = row ? row.x : 0;
        const currentY = row ? row.y : 0;
        const newX = x !== undefined ? x : currentX;
        const newY = y !== undefined ? y : currentY;

        performSave(sheetId, cellId, prompt, output, model, temperature, newX, newY, resolve, reject);
      });
    } else {
      performSave(sheetId, cellId, prompt, output, model, temperature, x, y, resolve, reject);
    }
  });
}

function performSave(sheetId, cellId, prompt, output, model, temperature, x, y, resolve, reject) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cells (sheet_id, cell_id, prompt, output, model, temperature, x, y, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  stmt.run([sheetId, cellId, prompt || '', output || '', model, temperature, x, y], function (err) {
    if (err) {
      reject(err);
      return;
    }

    // Check if output changed, if so save history
    if (output) {
      db.get("SELECT output FROM cell_history WHERE sheet_id = ? AND cell_id = ? ORDER BY timestamp DESC LIMIT 1", [sheetId, cellId], (err, row) => {
        if (!row || row.output !== output) {
          const historyStmt = db.prepare("INSERT INTO cell_history (sheet_id, cell_id, prompt, output, model) VALUES (?, ?, ?, ?, ?)");
          historyStmt.run([sheetId, cellId, prompt, output, model]);
          historyStmt.finalize();
        }
      });
    }

    resolve(this.changes);
  });
  stmt.finalize();
}

/**
 * Create a new sheet
 */
function createSheet(name) {
  return new Promise((resolve, reject) => {
    db.run("INSERT INTO sheets (name) VALUES (?)", [name], function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.lastID);
    });
  });
}

/**
 * Delete a sheet
 */
function deleteSheet(sheetId) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Delete all cells for this sheet
      db.run("DELETE FROM cells WHERE sheet_id = ?", [sheetId], (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Delete the sheet
        db.run("DELETE FROM sheets WHERE id = ?", [sheetId], (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  });
}

/**
 * Rename a sheet
 */
function renameSheet(sheetId, newName) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE sheets SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newName, sheetId], function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

/**
 * Update sheet dimensions
 */
function updateSheetDimensions(sheetId, numRows, numCols) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE sheets SET num_rows = ?, num_cols = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [numRows, numCols, sheetId], function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this.changes);
    });
  });
}

/**
 * Model providers configuration - OpenAI and Gemini only
 */
const MODEL_PROVIDERS = {
  'openai': {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    models: [
      // Text generation models
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most advanced GPT-4 model', type: 'text' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, cheaper GPT-4 model', type: 'text' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation GPT-4', type: 'text' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient model', type: 'text' },
      // Image generation models
      { id: 'dall-e-3', name: 'DALL-E 3', description: 'AI image generation model', type: 'image' },
      { id: 'dall-e-2', name: 'DALL-E 2', description: 'Previous generation image model', type: 'image' },
      // Video generation models
      { id: 'sora-2', name: 'Sora 2', description: 'OpenAI Sora 2 - Standard quality video generation', type: 'video' },
      { id: 'sora-2-pro', name: 'Sora 2 Pro', description: 'OpenAI Sora 2 Pro - Cinematic quality video generation', type: 'video' },
      // Audio generation models
      { id: 'tts-1', name: 'TTS-1', description: 'Text-to-Speech model', type: 'audio' },
      { id: 'tts-1-hd', name: 'TTS-1 HD', description: 'High-definition Text-to-Speech model', type: 'audio' }
    ],
    endpoint: '/chat/completions'
  },
  'gemini': {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: process.env.GEMINI_API_KEY || '',
    models: [
      // Text generation models
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Latest experimental Gemini model', type: 'text' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable Gemini model', type: 'text' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient Gemini model', type: 'text' },
      { id: 'gemini-pro', name: 'Gemini Pro', description: 'Standard Gemini model', type: 'text' },
      // Image generation models (Gemini can generate images via Imagen)
      { id: 'imagen-3', name: 'Imagen 3', description: 'Google Imagen 3 image generation', type: 'image' }
    ],
    endpoint: '/models'
  }
};

/**
 * Make HTTP request to any API provider with dynamic API key
 */
async function makeAPIRequest(provider, endpoint, data = null, apiKey = null) {
  return new Promise(async (resolve, reject) => {
    const config = MODEL_PROVIDERS[provider];
    if (!config) {
      reject(new Error(`Unknown provider: ${provider}`));
      return;
    }

    // Get API key dynamically if not provided
    let finalApiKey = apiKey;
    if (!finalApiKey) {
      if (provider === 'gemini') {
        finalApiKey = process.env.GEMINI_API_KEY;
      } else {
        finalApiKey = config.apiKey;
      }
    }

    if (!finalApiKey) {
      reject(new Error(`API key required for ${provider}`));
      return;
    }

    const url = new URL(config.baseUrl + endpoint);
    console.log(`🌐 Making API request to: ${url.toString()}`);
    console.log(`🔑 Using API key: ${finalApiKey ? finalApiKey.substring(0, 10) + '...' : 'NOT SET'}`);

    // Check if this is a TTS request (audio endpoint)
    const isAudioRequest = endpoint === '/audio/speech';

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: data ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${finalApiKey}`,
        'Content-Type': 'application/json',
      }
    };

    // Add provider-specific headers
    if (provider === 'gemini') {
      // Gemini uses API key as query parameter, not header
      url.searchParams.set('key', finalApiKey);
      delete options.headers['Authorization'];
    } else {
      // OpenAI uses Bearer token
      options.headers['Authorization'] = `Bearer ${finalApiKey}`;
    }

    // Add timeout to prevent hanging requests
    const req = https.request(options, (res) => {
      console.log(`📡 API Response Status: ${res.statusCode}`);
      console.log(`📡 API Response Headers:`, res.headers);

      if (isAudioRequest) {
        // Handle binary audio data
        const chunks = [];
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            const errorData = Buffer.concat(chunks).toString();
            console.log(`❌ API Error ${res.statusCode}: ${errorData}`);
            reject(new Error(`API Error ${res.statusCode}: ${errorData.substring(0, 200)}`));
            return;
          }

          // Return the audio data as base64
          const audioBuffer = Buffer.concat(chunks);
          const base64Audio = audioBuffer.toString('base64');
          resolve(base64Audio);
        });
      } else {
        // Handle JSON responses
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          console.log(`📡 API Response Data: ${responseData.substring(0, 500)}...`);

          if (res.statusCode >= 400) {
            console.log(`❌ API Error ${res.statusCode}: ${responseData}`);
            reject(new Error(`API Error ${res.statusCode}: ${responseData.substring(0, 200)}`));
            return;
          }

          try {
            const parsed = JSON.parse(responseData);
            console.log(`✅ API Success:`, parsed);
            resolve(parsed);
          } catch (error) {
            console.log(`❌ JSON Parse Error:`, error.message);
            reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`));
          }
        });
      }
    });

    // Set timeout to prevent hanging requests
    req.setTimeout(30000, () => {
      console.log(`⏰ Request timeout after 30 seconds`);
      req.destroy();
      reject(new Error('Request timeout - API did not respond within 30 seconds'));
    });

    req.on('error', (error) => {
      console.log(`❌ Request error:`, error.message);
      reject(error);
    });

    if (data) {
      console.log(`📤 Sending request data:`, JSON.stringify(data).substring(0, 200) + '...');
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Fetch available models from all providers
 */
async function fetchAvailableModels() {
  const allModels = [];

  try {
    // Try to load models from Firestore (production deployment)
    const models = await getActiveModelsFromFirebase();

    if (models.length > 0) {
      allModels.push(...models);
      console.log(`✅ Loaded ${models.length} models from Firebase`);
    } else {
      // Fallback to local models if Firebase returns empty
      console.log('⚠️ No models found in Firebase, using local fallback');
      const localModels = await getActiveModelsLocal();
      allModels.push(...localModels);
      console.log(`✅ Loaded ${localModels.length} models from local fallback`);
    }
  } catch (error) {
    // Fallback to local models if Firebase fails
    console.log('⚠️ Error loading models from Firebase, using local fallback:', error.message);
    try {
      const localModels = await getActiveModelsLocal();
      allModels.push(...localModels);
      console.log(`✅ Loaded ${localModels.length} models from local fallback`);
    } catch (localError) {
      console.error('❌ Error loading local models:', localError.message);
    }
  }

  return allModels;
}

/**
 * Get available models (with caching)
 */
async function getAvailableModels() {
  const now = Date.now();
  if (availableModels.length === 0 || (now - modelsCacheTime) > CACHE_DURATION) {
    availableModels = await fetchAvailableModels();
    modelsCacheTime = now;
  }
  return availableModels;
}

/**
 * Get original model ID from sanitized ID
 */
// Model ID normalization - simplified for OpenAI and Gemini only
async function getOriginalModelId(modelId) {
  // Models are now stored directly as OpenAI or Gemini model IDs
  // No conversion needed - return as-is
  return modelId;
}

// Removed pollFalAIVideoJob - no longer needed (Fal.ai removed, using OpenAI Sora only)

/**
 * Poll Sora 2 video job status until completion
 * 
 * @param {string} jobId - Video job ID from OpenAI
 * @param {string} apiKey - OpenAI API key
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 * @param {number} maxAttempts - Maximum polling attempts (default: 60)
 * @param {number} attempt - Current attempt number
 */
function pollVideoJobStatus(jobId, apiKey, resolve, reject, maxAttempts = 60, attempt = 0) {
  if (attempt >= maxAttempts) {
    reject(new Error('Video generation timed out. Job may still be processing.'));
    return;
  }

  // According to OpenAI docs, the status endpoint is GET /v1/videos/{job_id} (not /status)
  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: `/v1/videos/${jobId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'sora-2' // Beta header for Sora 2
    }
  };
  
  console.log(`🔄 Polling video job status (attempt ${attempt + 1}/${maxAttempts}): GET /v1/videos/${jobId}`);

  const req = https.request(options, (res) => {
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    res.on('end', () => {
      console.log(`📥 Status response (${res.statusCode}): ${responseData.substring(0, 300)}`);
      
      if (res.statusCode >= 400) {
        let errorMessage = `OpenAI API Error ${res.statusCode}: ${responseData.substring(0, 200)}`;
        try {
          const errorData = JSON.parse(responseData);
          if (errorData.error?.message) {
            errorMessage = `OpenAI API Error ${res.statusCode}: ${errorData.error.message}`;
          }
        } catch (e) {
          // Use the default error message
        }
        reject(new Error(errorMessage));
        return;
      }

      try {
        const parsed = JSON.parse(responseData);
        console.log(`📊 Job status response:`, JSON.stringify(parsed, null, 2));
        
        // Check various possible status field names
        const status = parsed.status || parsed.state || parsed.job_status;
        
        if (!status) {
          console.warn(`⚠️ No status field found in response. Response keys:`, Object.keys(parsed));
        }

        if (status === 'completed' || status === 'succeeded' || parsed.video_url) {
          // Get the video content URL from the job response
          // According to OpenAI docs, the video_url is in the job object when completed
          const videoUrl = parsed.video_url || parsed.video?.url || parsed.url || parsed.download_url;
          if (videoUrl) {
            console.log(`✅ Video completed! URL: ${videoUrl}`);
            resolve(videoUrl);
          } else {
            console.warn(`⚠️ Video marked as completed but no URL found. Trying download endpoint...`);
            // Try to get video content directly via content endpoint
            getVideoContent(jobId, apiKey, resolve, reject);
          }
        } else if (status === 'failed' || status === 'error') {
          reject(new Error(`Video generation failed: ${parsed.error?.message || parsed.message || 'Unknown error'}`));
        } else {
          // Still processing (pending, processing, in_progress, etc.)
          console.log(`⏳ Video still processing (status: ${status}). Polling again in 2 seconds...`);
          setTimeout(() => {
            pollVideoJobStatus(jobId, apiKey, resolve, reject, maxAttempts, attempt + 1);
          }, 2000);
        }
      } catch (error) {
        console.error(`❌ Failed to parse status response:`, error);
        reject(new Error(`Invalid JSON response: ${responseData.substring(0, 200)}`));
      }
    });
  });

  req.on('error', (error) => {
    reject(error);
  });

  req.end();
}

/**
 * Get video content URL from completed job
 * 
 * @param {string} jobId - Video job ID
 * @param {string} apiKey - OpenAI API key
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function getVideoContent(jobId, apiKey, resolve, reject) {
  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: `/v1/videos/${jobId}/download`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      // Redirect to video URL
      const location = res.headers.location;
      if (location) {
        resolve(location);
      } else {
        reject(new Error('Video URL not found in redirect'));
      }
    } else if (res.statusCode >= 400) {
      let errorData = '';
      res.on('data', (chunk) => {
        errorData += chunk;
      });
      res.on('end', () => {
        reject(new Error(`Failed to get video content: ${errorData.substring(0, 200)}`));
      });
    } else {
      // Video content as binary - return redirect URL if available, otherwise handle binary
      const location = res.headers.location;
      if (location) {
        resolve(location);
      } else {
        // If no redirect, check if there's a video_url in the response
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.video_url || parsed.url) {
              resolve(parsed.video_url || parsed.url);
            } else {
              // Return the job status with instructions
              resolve(`Video generation in progress. Job ID: ${jobId}. Please check the job status.`);
            }
          } catch (error) {
            // Binary video data - would need storage solution
            reject(new Error('Video content received as binary. Please check job status endpoint for video URL.'));
          }
        });
      }
    }
  });

  req.on('error', (error) => {
    reject(error);
  });

  req.end();
}

/**
 * Call AI API using OpenAI and Gemini only
 */
async function callHybridAI(model, prompt, temperature = 0.7, maxTokens = undefined, videoSettings = undefined, audioSettings = undefined, userId = null) {
  try {
    // Initialize skipCreditDeduction to false by default
    const skipCreditDeduction = false;
    
    // Get API keys - prefer user's API key if provided, otherwise use environment variables (Pro only)
    let openaiApiKey = process.env.OPENAI_API_KEY;
    let geminiApiKey = process.env.GEMINI_API_KEY;
    let isPro = false;
    
    // Try to get user's API key and subscription status if userId is provided
    if (userId) {
      try {
        const userApiKeyData = await getUserApiKeyAndSubscription(userId);
        isPro = userApiKeyData.isPro;
        
        if (userApiKeyData.hasUserApiKey && userApiKeyData.apiKey) {
          // User has their own API key - use it regardless of subscription
          openaiApiKey = userApiKeyData.apiKey;
          console.log(`✅ Using user's OpenAI API key for generation`);
        } else if (!isPro) {
          // User doesn't have their own API key and is not Pro - cannot use environment key
          throw new Error('Pro subscription required to use shared API key. Please upgrade to Pro or add your own OpenAI API key in your profile settings.');
        } else {
          // User is Pro but doesn't have their own API key - can use environment key
          console.log(`✅ Using environment OpenAI API key (Pro subscription)`);
        }
      } catch (userKeyError) {
        // If error is about Pro requirement, re-throw it
        if (userKeyError.message && userKeyError.message.includes('Pro subscription required')) {
          throw userKeyError;
        }
        // Otherwise, log warning and continue with environment key (for backward compatibility)
        console.warn(`⚠️ Could not get user API key, using environment key:`, userKeyError.message);
      }
    } else {
      // No userId provided - allow using environment key (for admin/system use)
      console.log(`ℹ️ No userId provided, using environment API key`);
    }
    
    // Normalize model name - fix common typos
    if (model) {
      // Fix common model name typos
      model = model.replace(/gpt-3-5-turbo/g, 'gpt-3.5-turbo'); // Fix hyphen instead of dot
      model = model.replace(/gpt-4-turbo/g, 'gpt-4-turbo'); // Keep as is
      model = model.trim();
    }

    // Determine model type and provider
    const isImageModel = model.includes('dall-e') || model.includes('imagen');
    const isVideoModel = model.includes('sora');
    const isAudioModel = model.includes('tts');
    const isTextModel = !isImageModel && !isVideoModel && !isAudioModel; // Text model if not image/video/audio
    const isGeminiModel = model.includes('gemini') || model.includes('imagen');
    const isOpenAIModel = !isGeminiModel; // Default to OpenAI if not Gemini

    if (isVideoModel && isOpenAIModel && (model.includes('sora-2') || model.includes('sora-2-pro'))) {
      // Video generation via OpenAI Sora 2 API
      // Supports both sora-2 (standard) and sora-2-pro (cinematic quality)
      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required for Sora 2 video generation. Please add your API key in profile settings or upgrade to Pro to use the shared API key.');
      }
      
      // Log API key info (masked for security)
      const maskedKey = openaiApiKey ? openaiApiKey.substring(0, 7) + '...' + openaiApiKey.substring(openaiApiKey.length - 4) : 'NOT SET';
      console.log(`🔑 Using OpenAI API key: ${maskedKey} (${userId ? 'user' : 'environment'} key)`);
      
      // Determine model variant (sora-2 or sora-2-pro)
      const modelVariant = model.includes('sora-2-pro') ? 'sora-2-pro' : 'sora-2';
      console.log(`📋 Model variant: ${modelVariant}`);
      console.log(`🌐 Endpoint: https://api.openai.com/v1/videos`);
      
      // Sora 2 uses the /v1/videos endpoint (NOT /v1/videos/create)
      // API Reference: https://platform.openai.com/docs/api-reference/videos/create
      // Note: seconds must be a string ('4', '8', or '12'), not an integer
      // Use video settings from cell if provided, otherwise use defaults
      // CRITICAL: Ensure seconds is always a string (convert from number if needed)
      console.log(`🎬 callHybridAI received videoSettings:`, JSON.stringify(videoSettings));
      console.log(`🎬 videoSettings.seconds value: ${videoSettings?.seconds}, type: ${typeof videoSettings?.seconds}`);
      
      let videoSeconds = videoSettings?.seconds ? String(videoSettings.seconds) : '8';
      const videoResolution = videoSettings?.resolution || '720p';
      const videoAspectRatio = videoSettings?.aspectRatio || '9:16';
      
      // Validate seconds is one of the allowed values (must be string)
      // Convert to string and ensure it's one of the valid values
      const validSeconds = ['4', '8', '12'];
      videoSeconds = String(videoSeconds); // Force to string
      const finalSeconds = validSeconds.includes(videoSeconds) ? videoSeconds : '8';
      
      console.log(`🎬 After conversion - finalSeconds: "${finalSeconds}", type: ${typeof finalSeconds}`);
      
      // Convert resolution and aspect ratio to size format
      // According to OpenAI docs: size should be "720x1280" (9:16) or "1280x720" (16:9)
      let finalSize = '720x1280'; // Default (9:16 portrait)
      
      if (videoAspectRatio === '16:9') {
        // Landscape: 1280x720 for 720p, or 1280x720 for 1024p (if supported)
        if (videoResolution === '1024p' && modelVariant === 'sora-2-pro') {
          finalSize = '1280x720'; // 16:9 landscape for pro
        } else {
          finalSize = '1280x720'; // 16:9 landscape
        }
      } else if (videoAspectRatio === '9:16') {
        // Portrait: 720x1280
        finalSize = '720x1280'; // 9:16 portrait
      } else {
        // Fallback to old resolution-based logic for backwards compatibility
        if (videoResolution === '720p') {
          finalSize = '720x1280'; // Portrait
        } else if (videoResolution === '1024p') {
          if (modelVariant === 'sora-2-pro') {
            finalSize = '1280x720'; // Landscape for pro
          } else {
            finalSize = '720x1280'; // sora-2 only supports 720p, fallback to default
          }
        }
      }
      
      console.log(`🎬 Using aspect ratio: ${videoAspectRatio}, resolution: ${videoResolution}, final size: ${finalSize}`);
      
      // Debug: Log the values being sent
      console.log(`🎬 Video generation settings: seconds="${finalSeconds}" (type: ${typeof finalSeconds}), size="${finalSize}"`);
      console.log(`🎬 Request data before stringify:`, JSON.stringify({
        model: modelVariant,
        prompt: prompt.substring(0, 50) + '...',
        size: finalSize,
        seconds: finalSeconds
      }, null, 2));
      
      // CRITICAL: Ensure seconds is explicitly a string, not a number
      // According to OpenAI docs: https://platform.openai.com/docs/guides/video-generation
      // Endpoint: POST /v1/videos (not /v1/videos/create)
      // Parameters: model, prompt, seconds (string), size (format: "720x1280")
      const requestData = {
        model: modelVariant,
        prompt: prompt,
        size: finalSize,
        seconds: String(finalSeconds) // Force to string - API requires string, not integer
      };
      
      // Verify the type one more time
      if (typeof requestData.seconds !== 'string') {
        console.error(`❌ ERROR: seconds is not a string! Type: ${typeof requestData.seconds}, Value: ${requestData.seconds}`);
        requestData.seconds = String(requestData.seconds);
      }
      
      console.log(`🎬 Final request data seconds type: ${typeof requestData.seconds}, value: ${requestData.seconds}`);

      // Use OpenAI SDK's videos.create method
      // The SDK should handle the correct endpoint automatically
      const openai = new OpenAI({
        apiKey: openaiApiKey
      });

      console.log(`🚀 Using OpenAI SDK videos.create with:`);
      console.log(`   Model: ${requestData.model}`);
      console.log(`   Prompt: ${requestData.prompt.substring(0, 50)}...`);
      console.log(`   Size: ${requestData.size}`);
      console.log(`   Seconds: "${requestData.seconds}" (type: ${typeof requestData.seconds})`);

      // Create video using SDK - return job info immediately for frontend polling
      return new Promise((resolve, reject) => {
        openai.videos.create({
          model: requestData.model,
          prompt: requestData.prompt,
          size: requestData.size,
          seconds: requestData.seconds // SDK should handle string conversion
        }).then((videoJob) => {
          console.log(`✅ Video job created: ${videoJob.id}, status: ${videoJob.status || 'pending'}`);
          
          if (videoJob.id) {
            // Return job info immediately instead of polling
            // Frontend will poll for status
            resolve({
              jobId: videoJob.id,
              status: videoJob.status || 'pending',
              type: 'video',
              skipCreditDeduction: skipCreditDeduction
            });
          } else {
            reject(new Error('Invalid response from OpenAI: missing job ID'));
          }
        }).catch((error) => {
          console.error(`❌ OpenAI SDK Error:`, error);
          console.error(`   Error status: ${error.status}`);
          console.error(`   Error message: ${error.message}`);
          console.error(`   Error code: ${error.code}`);
          
          // Provide helpful error messages
          if (error.status === 405 || (error.message && error.message.includes('405'))) {
            reject(new Error(`OpenAI API Error 405: Sora 2 API endpoint not accessible.\n` +
              `This usually means:\n` +
              `1. Your OpenAI organization is not verified (required for Sora 2 access)\n` +
              `2. Your API key doesn't have access to Sora 2 API\n` +
              `3. Please verify your organization at https://platform.openai.com/org/verification\n` +
              `4. Regional restrictions (Sora 2 is US/Canada only)\n` +
              `Original error: ${error.message}`));
          } else if (error.message && error.message.includes('seconds')) {
            reject(new Error(`OpenAI API Error: ${error.message}\n` +
              `Make sure seconds is a string ("4", "8", or "12"), not a number.`));
          } else {
            reject(error);
          }
        });
      });

    } else if (isImageModel) {
      // Image generation
      if (isGeminiModel && model.includes('imagen')) {
        // Gemini Imagen image generation
        if (!geminiApiKey) {
          throw new Error('Gemini API key is required for image generation. Please configure GEMINI_API_KEY.');
        }

        // Imagen uses Vertex AI API, but for simplicity we'll use a placeholder
        // Note: Imagen API requires Vertex AI setup which is more complex
        throw new Error('Imagen image generation requires Vertex AI setup. Please use DALL-E models for image generation.');
      } else if (isOpenAIModel && (model.includes('dall-e-2') || model.includes('dall-e-3'))) {
        // OpenAI DALL-E image generation
        if (!openaiApiKey) {
          throw new Error('OpenAI API key is required for image generation. Please add your API key in profile settings or upgrade to Pro to use the shared API key.');
        }

        const requestBody = {
          model: model.includes('dall-e-3') ? 'dall-e-3' : 'dall-e-2',
          prompt: prompt,
          n: 1,
          size: '1024x1024'
        };

        const response = await makeAPIRequest('openai', '/images/generations', requestBody, openaiApiKey);
        const imageUrl = response.data?.[0]?.url || 'No image generated';
        return { text: imageUrl, skipCreditDeduction };
      } else {
        throw new Error(`Unsupported image model: ${model}. Please use DALL-E 2, DALL-E 3, or Imagen 3.`);
      }

    } else if (isAudioModel && isOpenAIModel) {
      // OpenAI TTS audio generation
      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required for audio generation. Please add your API key in profile settings or upgrade to Pro to use the shared API key.');
      }

      const requestBody = {
        model: model.includes('hd') ? 'tts-1-hd' : 'tts-1',
        input: prompt,
        voice: audioSettings?.voice || 'alloy',
        speed: audioSettings?.speed ?? 1.0,
        response_format: audioSettings?.format || 'mp3'
      };

      const audioFormat = audioSettings?.format || 'mp3';
      // Map format to MIME type
      const mimeTypes = {
        'mp3': 'audio/mpeg',
        'opus': 'audio/opus',
        'aac': 'audio/aac',
        'flac': 'audio/flac'
      };
      const mimeType = mimeTypes[audioFormat] || 'audio/mpeg';

      const audioBase64 = await makeAPIRequest('openai', '/audio/speech', requestBody, openaiApiKey);
      // Return base64 audio data URL with correct MIME type
      return `data:${mimeType};base64,${audioBase64}`;

    } else if (isTextModel) {
      // Text generation
      if (isGeminiModel) {
        // Gemini text generation
        if (!geminiApiKey) {
          throw new Error('Gemini API key is required for text generation. Please configure GEMINI_API_KEY.');
        }

        const requestBody = {
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens || 2048
          }
        };

        const response = await makeAPIRequest('gemini', `/models/${model}:generateContent`, requestBody, geminiApiKey);
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
        return { text, skipCreditDeduction };
      } else if (isOpenAIModel) {
        // OpenAI text generation
        if (!openaiApiKey) {
          throw new Error('OpenAI API key is required for text generation. Please add your API key in profile settings or upgrade to Pro to use the shared API key.');
        }

        const requestBody = {
          model: model,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: temperature
        };
        
        if (maxTokens !== undefined && maxTokens > 0) {
          requestBody.max_tokens = maxTokens;
        }
        
        const response = await makeAPIRequest('openai', '/chat/completions', requestBody, openaiApiKey);
        const text = response.choices?.[0]?.message?.content || 'No response generated';
        return { text, skipCreditDeduction };
      } else {
        throw new Error(`Unsupported text model: ${model}. Please use OpenAI or Gemini models.`);
      }
    } else {
      // Default to OpenAI text generation
      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required. Please add your API key in profile settings or upgrade to Pro to use the shared API key.');
      }

      const requestBody = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: temperature
      };
      
      if (maxTokens !== undefined && maxTokens > 0) {
        requestBody.max_tokens = maxTokens;
      }
      
      const response = await makeAPIRequest('openai', '/chat/completions', requestBody, openaiApiKey);
      const text = response.choices?.[0]?.message?.content || 'No response generated';
      return { text, skipCreditDeduction };
    }

  } catch (error) {
    throw error;
  }
}


/**
 * Resolve a request URL to a file path on disk. Defaults to index.html for the root.
 * @param {string} url The URL from the request.
 * @returns {string} Absolute file system path.
 */
function resolveFilePath(url) {
  let filePath = url;
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }
  // Remove query string if present
  filePath = filePath.split('?')[0];
  return path.join(publicDir, filePath);
}

/**
 * Determine the correct Content-Type for a given file extension.
 * @param {string} filePath File path with extension.
 * @returns {string} MIME type string.
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Handle incoming HTTP requests.
 * For GET requests, serves files from the public directory.
 * For API requests, handles OpenAI and Gemini integration.
 */
const server = http.createServer(async (req, res) => {
  try {
    // Parse URL to get pathname (ignores query parameters)
    const parsedUrl = url.parse(req.url || '/');
    const pathname = parsedUrl.pathname || '/';
    
    // Get client IP for rate limiting
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';

    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    // Debug endpoint - list files in public directory
    if (req.url === '/debug-files') {
      try {
        const files = fs.readdirSync(publicDir);
        const fileList = files.map(file => {
          const stats = fs.statSync(path.join(publicDir, file));
          return {
            name: file,
            size: stats.size,
            isDirectory: stats.isDirectory(),
            modified: stats.mtime
          };
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          publicDir,
          files: fileList,
          total: files.length
        }, null, 2));
        return;
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
        return;
      }
    }

    // Health check endpoint
    if (req.url === '/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: port
      }));
      return;
    }

    // Debug endpoint to check environment variables
    if (req.url === '/debug-env') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(JSON.stringify({
        FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ? 'SET' : 'NOT SET',
        FIREBASE_API_KEY_VALUE: process.env.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY.substring(0, 10) + '...' : 'NOT SET',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
        allEnvKeys: Object.keys(process.env).filter(key => key.includes('FIREBASE') || key.includes('OPENAI') || key.includes('GEMINI'))
      }));
      return;
    }

    // Serve static firebase-config.js with all services
    if (req.url === '/firebase-config-static.js') {
      const filePath = path.join(publicDir, 'firebase-config.js');
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Firebase config not available');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(content);
      });
      return;
    }

    // Firebase configuration endpoint - respond with dynamic config from environment, fallback to file
    if (req.url === '/firebase-config.js') {
      const envConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'cellulai.firebaseapp.com',
        projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.appspot.com',
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '857760697765',
        appId: process.env.FIREBASE_APP_ID || '1:857760697765:web:74605f6e0667d0feebec4c',
        measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-NBGFZ6T90R'
      };

      const hasApiKey = typeof envConfig.apiKey === 'string' && envConfig.apiKey.trim().length > 0 && envConfig.apiKey !== 'YOUR_FIREBASE_API_KEY';

      if (hasApiKey) {
        const js = `// Served dynamically by server.js using environment variables
const firebaseConfig = ${JSON.stringify(envConfig)};

// Initialize Firebase with error handling
let app, auth, db, storage;

try {
  // Check if Firebase is loaded
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded yet');
    throw new Error('Firebase SDK not available');
  }
  
  app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage ? firebase.storage() : null;
  
  console.log('✅ Firebase initialized successfully from Railway');
  
  // Set a flag that Firebase is ready - let script.js handle the UI
  window.firebaseReady = true;
  window.firebaseLoadedFromRailway = true;
  
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  // Retry after a short delay
  setTimeout(() => {
    try {
      app = firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
      storage = firebase.storage ? firebase.storage() : null;
      console.log('✅ Firebase initialized on retry from Railway');
      
      // Set a flag that Firebase is ready - let script.js handle the UI
      window.firebaseReady = true;
      window.firebaseLoadedFromRailway = true;
      
    } catch (retryError) {
      console.error('❌ Firebase initialization retry failed:', retryError);
    }
  }, 1000);
}

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Make services globally available
window.auth = auth;
window.db = db;
window.storage = storage;`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(js);
        return;
      }

      // Fallback to static file if env not set
      const filePath = path.join(publicDir, 'firebase-config.js');
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Firebase config not available');
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(content);
      });
      return;
    }

    // Rate limiting for API endpoints
    if (pathname.startsWith('/api/') && !checkRateLimit(clientIP)) {
      handleError(res, 429, 'Rate limit exceeded. Please try again later.');
      return;
    }

    // Diagnostic endpoint for Firebase models
    if (req.url === '/api/models/diagnose') {
      try {
        const diagnosis = await diagnoseFirebaseModels();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(diagnosis));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Handle API endpoints
    if (req.url === '/api/models') {
      try {
        const models = await getAvailableModels();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ models }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Database API endpoints
    if (req.url === '/api/sheets') {
      try {
        const sheets = await getSheets();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ sheets }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.url.startsWith('/api/sheets/') && req.method === 'GET') {
      try {
        if (req.url.includes('/connections')) {
          const sheetId = parseInt(req.url.split('/')[3]);
          const connections = await getConnections(sheetId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ connections }));
          return;
        }

        const sheetId = parseInt(req.url.split('/')[3]);
        const cells = await getSheetCells(sheetId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ cells }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.url === '/api/sheets' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const sheetId = await createSheet(data.name);
          res.statusCode = 201;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ id: sheetId, name: data.name }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    if (req.url.startsWith('/api/sheets/') && req.method === 'DELETE') {
      try {
        const sheetId = parseInt(req.url.split('/')[3]);
        await deleteSheet(sheetId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.url.startsWith('/api/sheets/') && req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const sheetId = parseInt(req.url.split('/')[3]);
          const data = JSON.parse(body);
          await renameSheet(sheetId, data.name);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // Get cell history
    if (req.url.startsWith('/api/history/') && req.method === 'GET') {
      try {
        const cellId = req.url.split('/')[3];
        const sheetId = 1; // Default to first sheet for now

        db.all("SELECT * FROM cell_history WHERE sheet_id = ? AND cell_id = ? ORDER BY timestamp DESC LIMIT 50", [sheetId, cellId], (err, rows) => {
          if (err) {
            handleError(res, 500, 'Error retrieving history', err);
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ history: rows }));
        });
      } catch (error) {
        handleError(res, 500, 'Error processing history request', error);
      }
      return;
    }

    if (req.url === '/api/save-cell' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          await saveCell(
            data.sheetId,
            data.cellId,
            data.prompt,
            data.output,
            data.model || 'gpt-3.5-turbo',
            data.temperature || 0.7,
            data.x,
            data.y
          );
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }



    if (req.url === '/api/connections' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          if (data.action === 'delete') {
            await deleteConnection(data.sheetId, data.sourceId, data.targetId);
          } else {
            await saveConnection(data.sheetId, data.sourceId, data.targetId);
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // Stripe endpoints
    if (req.url === '/api/stripe/create-checkout-session' && req.method === 'POST') {
      if (!stripe) {
        handleError(res, 500, 'Stripe not configured');
        return;
      }
      
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { priceId, userId } = data;
          
          if (!priceId || !userId) {
            handleError(res, 400, 'Missing priceId or userId');
            return;
          }

          // Get success and cancel URLs (point to frontend, not backend)
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const successUrl = `${frontendUrl}/subscription-success?session_id={CHECKOUT_SESSION_ID}`;
          const cancelUrl = `${frontendUrl}/subscription-cancel`;

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
              price: priceId,
              quantity: 1,
            }],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: userId,
            metadata: {
              userId: userId
            }
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            success: true, 
            sessionId: session.id,
            url: session.url 
          }));
        } catch (error) {
          handleError(res, 500, 'Error creating checkout session', error);
        }
      });
      return;
    }

    if (req.url === '/api/stripe/create-portal-session' && req.method === 'POST') {
      if (!stripe) {
        handleError(res, 500, 'Stripe not configured');
        return;
      }
      
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { customerId } = data;
          
          if (!customerId) {
            handleError(res, 400, 'Missing customerId');
            return;
          }

          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${frontendUrl}/`,
          });

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ 
            success: true, 
            url: session.url 
          }));
        } catch (error) {
          handleError(res, 500, 'Error creating portal session', error);
        }
      });
      return;
    }

    if (req.url === '/api/stripe/webhook' && req.method === 'POST') {
      if (!stripe) {
        handleError(res, 500, 'Stripe not configured');
        return;
      }

      // Stripe webhooks require raw body for signature verification
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const sig = req.headers['stripe-signature'];
          const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

          if (!webhookSecret) {
            console.error('⚠️ Stripe webhook secret not configured');
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Webhook secret not configured' }));
            return;
          }

          let event;
          try {
            event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
          } catch (err) {
            console.error('❌ Webhook signature verification failed:', err.message);
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `Webhook Error: ${err.message}` }));
            return;
          }

          // Handle the event
          const { initializeFirebase } = require('./firebase-server-config');
          const firebaseAdmin = await initializeFirebase();
          
          if (!firebaseAdmin) {
            console.error('❌ Firebase not initialized for webhook');
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Firebase not initialized' }));
            return;
          }

          const { firestore } = firebaseAdmin;
          const SUBSCRIPTION_PLANS = {
            starter: { monthlyCredits: 500 },
            pro: { monthlyCredits: 2000 },
            enterprise: { monthlyCredits: 10000 }
          };

          switch (event.type) {
            case 'checkout.session.completed': {
              const session = event.data.object;
              const userId = session.client_reference_id || session.metadata?.userId;
              
              if (userId && session.mode === 'subscription') {
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                const priceId = subscription.items.data[0].price.id;
                
                // Determine plan from price ID (you'll need to map these)
                let planId = 'starter';
                if (priceId.includes('pro')) planId = 'pro';
                else if (priceId.includes('enterprise')) planId = 'enterprise';
                
                const plan = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.starter;
                const now = new Date();
                const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                await firestore.collection('users').doc(userId).update({
                  subscription: planId,
                  subscriptionStatus: 'active',
                  stripeCustomerId: session.customer,
                  stripeSubscriptionId: subscription.id,
                  credits: {
                    current: plan.monthlyCredits,
                    total: plan.monthlyCredits,
                    lastReset: firestore.FieldValue.serverTimestamp(),
                    nextReset: nextReset
                  },
                  updatedAt: firestore.FieldValue.serverTimestamp()
                });

                console.log(`✅ Subscription activated for user ${userId}: ${planId}`);
              }
              break;
            }

            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
              const subscription = event.data.object;
              const customerId = subscription.customer;
              
              // Find user by customer ID
              const usersSnapshot = await firestore.collection('users')
                .where('stripeCustomerId', '==', customerId)
                .get();
              
              if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const userId = userDoc.id;
                
                if (subscription.status === 'active') {
                  // Subscription is active, reset credits if needed
                  const userData = userDoc.data();
                  const nextReset = userData.credits?.nextReset?.toDate();
                  const now = new Date();
                  
                  if (!nextReset || now >= nextReset) {
                    // Determine plan from subscription
                    const priceId = subscription.items.data[0].price.id;
                    let planId = 'starter';
                    if (priceId.includes('pro')) planId = 'pro';
                    else if (priceId.includes('enterprise')) planId = 'enterprise';
                    
                    const plan = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.starter;
                    const newNextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                    await firestore.collection('users').doc(userId).update({
                      'credits.current': plan.monthlyCredits,
                      'credits.total': plan.monthlyCredits,
                      'credits.lastReset': firestore.FieldValue.serverTimestamp(),
                      'credits.nextReset': newNextReset,
                      updatedAt: firestore.FieldValue.serverTimestamp()
                    });

                    console.log(`✅ Credits reset for user ${userId}`);
                  }
                } else {
                  // Subscription cancelled or past due
                  await firestore.collection('users').doc(userId).update({
                    subscriptionStatus: subscription.status,
                    updatedAt: firestore.FieldValue.serverTimestamp()
                  });

                  console.log(`⚠️ Subscription ${subscription.status} for user ${userId}`);
                }
              }
              break;
            }

            case 'invoice.payment_succeeded': {
              const invoice = event.data.object;
              if (invoice.subscription) {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                const customerId = subscription.customer;
                
                const usersSnapshot = await firestore.collection('users')
                  .where('stripeCustomerId', '==', customerId)
                  .get();
                
                if (!usersSnapshot.empty) {
                  const userDoc = usersSnapshot.docs[0];
                  const userId = userDoc.id;
                  const userData = userDoc.data();
                  
                  // Reset credits on successful payment (monthly renewal)
                  const priceId = subscription.items.data[0].price.id;
                  let planId = 'starter';
                  if (priceId.includes('pro')) planId = 'pro';
                  else if (priceId.includes('enterprise')) planId = 'enterprise';
                  
                  const plan = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.starter;
                  const now = new Date();
                  const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                  await firestore.collection('users').doc(userId).update({
                    'credits.current': plan.monthlyCredits,
                    'credits.total': plan.monthlyCredits,
                    'credits.lastReset': firestore.FieldValue.serverTimestamp(),
                    'credits.nextReset': nextReset,
                    subscriptionStatus: 'active',
                    updatedAt: firestore.FieldValue.serverTimestamp()
                  });

                  console.log(`✅ Monthly credits reset for user ${userId}`);
                }
              }
              break;
            }

            case 'invoice.payment_failed': {
              const invoice = event.data.object;
              if (invoice.subscription) {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                const customerId = subscription.customer;
                
                const usersSnapshot = await firestore.collection('users')
                  .where('stripeCustomerId', '==', customerId)
                  .get();
                
                if (!usersSnapshot.empty) {
                  const userDoc = usersSnapshot.docs[0];
                  const userId = userDoc.id;

                  await firestore.collection('users').doc(userId).update({
                    subscriptionStatus: 'past_due',
                    updatedAt: firestore.FieldValue.serverTimestamp()
                  });

                  console.log(`⚠️ Payment failed for user ${userId}`);
                }
              }
              break;
            }
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ received: true }));
        } catch (error) {
          console.error('❌ Webhook error:', error);
          handleError(res, 500, 'Webhook processing error', error);
        }
      });
      return;
    }

    if (req.url === '/api/update-sheet-dimensions' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          await updateSheetDimensions(data.sheetId, data.numRows, data.numCols);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // Debug: Log all API requests
    if (pathname && pathname.startsWith('/api')) {
      console.log(`📡 API Request: ${req.method} ${pathname}`);
    }

    // Endpoint to check video/image job status
    if (req.method === 'GET' && req.url.startsWith('/api/job-status/')) {
      // Extract jobId from URL (remove query params if any)
      const urlParts = req.url.split('/api/job-status/')[1];
      const jobId = urlParts ? urlParts.split('?')[0] : null;
      
      if (!jobId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: 'Job ID is required' }));
        return;
      }

      try {
        // Extract userId from query params if provided
        // Parse the URL to get query parameters
        let userId = null;
        const urlWithQuery = req.url.split('?');
        if (urlWithQuery.length > 1) {
          const queryParams = new URLSearchParams(urlWithQuery[1]);
          userId = queryParams.get('userId');
        }
        
        let openaiApiKey = process.env.OPENAI_API_KEY;
        
        // Try to get user's API key if userId is provided
        if (userId) {
          try {
            const userApiKeyData = await getUserApiKeyAndSubscription(userId);
            if (userApiKeyData.hasUserApiKey && userApiKeyData.apiKey) {
              // User has their own API key - use it regardless of subscription
              openaiApiKey = userApiKeyData.apiKey;
              console.log(`✅ Using user's API key for job status check`);
            } else if (!userApiKeyData.isPro) {
              // User doesn't have their own API key and is not Pro - cannot use environment key
              throw new Error('Pro subscription required to use shared API key. Please upgrade to Pro or add your own OpenAI API key in your profile settings.');
            } else {
              // User is Pro but doesn't have their own API key - can use environment key
              console.log(`✅ Using environment OpenAI API key for job status check (Pro subscription)`);
            }
          } catch (userKeyError) {
            // If error is about Pro requirement, re-throw it
            if (userKeyError.message && userKeyError.message.includes('Pro subscription required')) {
              throw userKeyError;
            }
            console.warn(`⚠️ Could not get user API key, using environment key:`, userKeyError.message);
          }
        }
        
        if (!openaiApiKey || openaiApiKey.trim() === '') {
          console.error(`❌ OpenAI API key is missing or empty`);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.' }));
          return;
        }
        
        // Log API key status (masked for security)
        const maskedKey = openaiApiKey.substring(0, 7) + '...' + openaiApiKey.substring(openaiApiKey.length - 4);
        console.log(`🔑 Using API key: ${maskedKey} (${userId ? 'user' : 'environment'} key)`);

        // Check job status - use /v1/videos/{jobId} (NOT /v1/videos/{jobId}/status)
        const endpointPath = `/v1/videos/${jobId}`;
        console.log(`🔄 Checking job status for: ${jobId}`);
        console.log(`🌐 Using endpoint: https://api.openai.com${endpointPath}`);
        
        const options = {
          hostname: 'api.openai.com',
          port: 443,
          path: endpointPath, // Correct endpoint without /status
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'sora-2'
          }
        };

        const statusReq = https.request(options, (statusRes) => {
          let responseData = '';
          statusRes.on('data', (chunk) => {
            responseData += chunk;
          });
          statusRes.on('end', () => {
            if (statusRes.statusCode >= 400) {
              res.statusCode = statusRes.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(responseData);
              return;
            }

            const handleStatusResponse = async () => {
              try {
                const parsed = JSON.parse(responseData);
                console.log(`📹 OpenAI status response for ${jobId}:`, JSON.stringify(parsed, null, 2));
                
                const status = parsed.status || parsed.state || parsed.job_status || 'pending';
                console.log(`📹 Extracted status: ${status}`);
                
                // Try multiple possible fields for video URL
                let videoUrl = parsed.video_url || 
                             parsed.video?.url || 
                             parsed.url || 
                             parsed.download_url ||
                             parsed.video_urls?.[0] ||
                             parsed.files?.[0]?.url ||
                             parsed.result?.video_url ||
                             parsed.video_file?.url ||
                             parsed.output?.url ||
                             parsed.data?.url ||
                             parsed.response?.url;
                
                console.log(`📹 Extracted videoUrl: ${videoUrl}`);
                console.log(`📹 Checking all possible URL fields:`, {
                  'parsed.video_url': parsed.video_url,
                  'parsed.video?.url': parsed.video?.url,
                  'parsed.url': parsed.url,
                  'parsed.download_url': parsed.download_url,
                  'parsed.video_urls?.[0]': parsed.video_urls?.[0],
                  'parsed.files?.[0]?.url': parsed.files?.[0]?.url,
                  'parsed.result?.video_url': parsed.result?.video_url,
                  'parsed.video_file?.url': parsed.video_file?.url,
                  'parsed.output?.url': parsed.output?.url,
                  'parsed.data?.url': parsed.data?.url,
                  'parsed.response?.url': parsed.response?.url
                });
                
                // If status is completed but no URL, get it from the content endpoint
                // According to OpenAI docs: /v1/videos/{video_id}/content returns the video file
                if ((status === 'completed' || status === 'succeeded') && !videoUrl) {
                  console.log(`⚠️ Status is ${status} but no video URL found. Trying content endpoint...`);
                  
                  // Call content endpoint to get the video URL (may redirect or return URL)
                  // Use the same API key that was used for the status check
                  return new Promise((resolve) => {
                    if (!openaiApiKey || openaiApiKey.trim() === '') {
                      console.error(`❌ API key is missing for content endpoint`);
                      resolve({ status, videoUrl: null, jobId, error: 'API key is missing' });
                      return;
                    }
                    
                    const contentOptions = {
                      hostname: 'api.openai.com',
                      port: 443,
                      path: `/v1/videos/${jobId}/content`,
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${openaiApiKey}`,
                        'OpenAI-Beta': 'sora-2'
                      }
                    };
                    
                    console.log(`🔑 Using API key for content endpoint: ${openaiApiKey.substring(0, 7)}...${openaiApiKey.substring(openaiApiKey.length - 4)}`);
                    
                    const contentReq = https.request(contentOptions, (contentRes) => {
                      console.log(`📥 Content endpoint response status: ${contentRes.statusCode}`);
                      console.log(`📥 Content endpoint response headers:`, JSON.stringify(contentRes.headers, null, 2));
                      
                      if (contentRes.statusCode === 302 || contentRes.statusCode === 301 || contentRes.statusCode === 307 || contentRes.statusCode === 308) {
                        // Redirect to video URL
                        const location = contentRes.headers.location;
                        if (location) {
                          console.log(`✅ Got video URL from content redirect: ${location}`);
                          resolve({ status, videoUrl: location, jobId });
                        } else {
                          console.log(`⚠️ Redirect (${contentRes.statusCode}) but no location header`);
                          // Try to read response body in case URL is in body
                          let contentData = '';
                          contentRes.on('data', (chunk) => { contentData += chunk; });
                          contentRes.on('end', () => {
                            console.log(`📥 Redirect response body: ${contentData.substring(0, 200)}`);
                            resolve({ status, videoUrl: null, jobId });
                          });
                        }
                      } else if (contentRes.statusCode === 200) {
                        // Check if there's a location header
                        const location = contentRes.headers.location;
                        if (location) {
                          console.log(`✅ Got video URL from content location header: ${location}`);
                          resolve({ status, videoUrl: location, jobId });
                        } else {
                          // The content endpoint may return the video file directly or a URL
                          // Try to parse response
                          let contentData = '';
                          contentRes.on('data', (chunk) => { contentData += chunk; });
                          contentRes.on('end', () => {
                            console.log(`📥 Content response body (first 500 chars): ${contentData.substring(0, 500)}`);
                            try {
                              const contentParsed = JSON.parse(contentData);
                              console.log(`📥 Parsed content response:`, JSON.stringify(contentParsed, null, 2));
                              const foundUrl = contentParsed.video_url || 
                                             contentParsed.url || 
                                             contentParsed.download_url ||
                                             contentParsed.content_url ||
                                             contentParsed.video?.url ||
                                             contentParsed.file?.url ||
                                             contentParsed.result?.url;
                              if (foundUrl) {
                                console.log(`✅ Got video URL from content response: ${foundUrl}`);
                                resolve({ status, videoUrl: foundUrl, jobId });
                              } else {
                                console.log(`⚠️ Content response has no video URL. Full response:`, JSON.stringify(contentParsed, null, 2));
                                resolve({ status, videoUrl: null, jobId });
                              }
                            } catch (e) {
                              console.log(`⚠️ Content response is not JSON, might be binary or HTML. Error: ${e.message}`);
                              // If it's not JSON, it might be a direct URL or HTML redirect
                              // Check if the response body itself looks like a URL
                              const trimmedData = contentData.trim();
                              if (trimmedData.match(/^https?:\/\//)) {
                                console.log(`✅ Response body appears to be a URL: ${trimmedData}`);
                                resolve({ status, videoUrl: trimmedData, jobId });
                              } else {
                                // Content endpoint might return the video file directly
                                // In that case, we need to construct a URL or use the jobId to create a direct link
                                // For now, construct a URL that can be used to access the video
                                const constructedUrl = `https://api.openai.com/v1/videos/${jobId}/content`;
                                console.log(`⚠️ Content is binary/video file. Using constructed URL: ${constructedUrl}`);
                                resolve({ status, videoUrl: constructedUrl, jobId });
                              }
                            }
                          });
                        }
                      } else {
                        console.log(`⚠️ Content endpoint returned status ${contentRes.statusCode}`);
                        let errorData = '';
                        contentRes.on('data', (chunk) => { errorData += chunk; });
                        contentRes.on('end', () => {
                          console.log(`📥 Error response body: ${errorData}`);
                          resolve({ status, videoUrl: null, jobId });
                        });
                      }
                    });
                    
                    contentReq.on('error', (error) => {
                      console.error(`❌ Error calling content endpoint:`, error);
                      resolve({ status, videoUrl: null, jobId });
                    });
                    
                    contentReq.end();
                  });
                } else {
                  // Video URL found or status not completed
                  return Promise.resolve({ status, videoUrl: videoUrl || null, jobId });
                }
              } catch (error) {
                console.error(`❌ Error parsing status response:`, error);
                return Promise.resolve({ status: 'error', videoUrl: null, jobId, error: error.message });
              }
            };

            // Handle the response (which may be async if we need to call download endpoint)
            handleStatusResponse().then((result) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify(result));
            }).catch((error) => {
              console.error(`❌ Error in handleStatusResponse:`, error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: error.message || 'Failed to check job status' }));
            });
          });
        });

        statusReq.on('error', (error) => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: error.message }));
        });

        statusReq.end();
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/llm') {
      console.log(`✅ Matched /api/llm endpoint`);
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        // Avoid overly large request bodies
        if (body.length > 1e7) req.connection.destroy();
      });
      req.on('end', async () => {
        try {
          // Circuit breaker - prevent multiple concurrent API requests
          if (apiRequestInProgress) {
            console.log(`🚫 API request already in progress, rejecting new request`);
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'API request already in progress. Please wait.' }));
            return;
          }

          apiRequestInProgress = true;
          console.log(`🔒 Circuit breaker: API request started`);

          // Parse request body
          let data;
          try {
            data = JSON.parse(body || '{}');
          } catch (parseError) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Invalid JSON in request body', details: parseError.message }));
            apiRequestInProgress = false;
            return;
          }

          const prompt = data.prompt || '';
          const model = data.model || 'gpt-3.5-turbo';
          const temperature = data.temperature || 0.7;
          const maxTokens = data.max_tokens || data.maxTokens || undefined;
          const userId = data.userId || null;
          // CRITICAL: Check the raw body string BEFORE parsing to see if seconds is quoted
          console.log(`📥 Raw request body (first 500 chars):`, body.substring(0, 500));
          
          // Debug: Log what we received AFTER parsing
          console.log(`📥 Received video settings from frontend (after JSON.parse):`, {
            videoSeconds: data.videoSeconds,
            videoSecondsType: typeof data.videoSeconds,
            videoResolution: data.videoResolution,
            videoAspectRatio: data.videoAspectRatio
          });
          
          // CRITICAL: Convert to string IMMEDIATELY after parsing JSON
          // JSON.parse can convert string numbers to actual numbers, so we need to force it back to string
          let videoSettings = undefined;
          if (data.videoSeconds || data.videoResolution || data.videoAspectRatio) {
            // Get the raw value and convert to string
            const rawSeconds = data.videoSeconds;
            console.log(`🔍 Raw seconds value: ${rawSeconds}, type: ${typeof rawSeconds}`);
            
            // CRITICAL: If it's a number, this is the bug! Convert it immediately
            if (typeof rawSeconds === 'number') {
              console.error(`❌❌❌ BUG DETECTED: videoSeconds is a NUMBER after JSON.parse!`);
              console.error(`   This means the JSON body had "videoSeconds":4 instead of "videoSeconds":"4"`);
              console.error(`   Raw body snippet: ${body.includes('videoSeconds') ? body.substring(body.indexOf('videoSeconds') - 10, body.indexOf('videoSeconds') + 30) : 'not found'}`);
            }
            
            // Convert to string and validate
            const secondsStr = String(rawSeconds || '8');
            const validSeconds = ['4', '8', '12'];
            const finalSeconds = validSeconds.includes(secondsStr) ? secondsStr : '8';
            
            console.log(`✅ Converted to string: "${finalSeconds}" (type: ${typeof finalSeconds})`);
            
            videoSettings = {
              seconds: finalSeconds, // Already a string
              resolution: data.videoResolution || '720p',
              aspectRatio: data.videoAspectRatio || '9:16'
            };
            
            // Debug: Log what we're passing to callHybridAI
            console.log(`📤 Video settings being passed to callHybridAI:`, {
              seconds: videoSettings.seconds,
              secondsType: typeof videoSettings.seconds,
              resolution: videoSettings.resolution,
              aspectRatio: videoSettings.aspectRatio
            });
          }

          // Extract audio settings if provided
          let audioSettings = undefined;
          if (data.audioVoice || data.audioSpeed !== undefined || data.audioFormat) {
            audioSettings = {
              voice: data.audioVoice || 'alloy',
              speed: data.audioSpeed ?? 1.0,
              format: data.audioFormat || 'mp3'
            };
            console.log(`🎵 Audio settings being passed to callHybridAI:`, audioSettings);
          }

          // Validate required fields
          if (!prompt || prompt.trim() === '') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Prompt is required' }));
            apiRequestInProgress = false;
            return;
          }

          console.log(`🚀 API Request - Model: ${model}, Prompt: ${prompt.substring(0, 50)}..., MaxTokens: ${maxTokens || 'default'}, VideoSettings: ${videoSettings ? JSON.stringify(videoSettings) : 'none'}, AudioSettings: ${audioSettings ? JSON.stringify(audioSettings) : 'none'}, UserId: ${userId || 'none'}`);

          // Call AI API (OpenAI and Gemini) - pass userId to use user's API key if available
          const response = await callHybridAI(model, prompt, temperature, maxTokens, videoSettings, audioSettings, userId);

          // Check if response is a job object (for async operations like video generation)
          if (response && typeof response === 'object' && response.jobId) {
            console.log(`✅ Job created - JobId: ${response.jobId}, Status: ${response.status}`);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ 
              jobId: response.jobId,
              status: response.status,
              type: response.type || 'video'
            }));
          } else {
            // Regular text/image/audio response
            // Extract text from response object if it exists, otherwise use the response directly
            let responseText;
            if (typeof response === 'string') {
              responseText = response;
            } else if (response && typeof response === 'object' && response.text) {
              // Response is an object with a text property
              responseText = response.text;
            } else if (response && typeof response === 'object' && response.output) {
              // Response is an object with an output property
              responseText = response.output;
            } else {
              // Fallback: stringify if it's an object, or use as-is
              responseText = typeof response === 'object' ? JSON.stringify(response) : String(response);
            }
            
            console.log(`✅ AI Generation Success - Response: ${responseText.substring(0, 100)}...`);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ text: responseText }));
          }

          // Reset circuit breaker on success
          apiRequestInProgress = false;
          console.log(`🔓 Circuit breaker: API request completed successfully`);
        } catch (err) {
          console.log(`❌ AI Generation Error:`, err.message);
          console.log(`❌ Error Stack:`, err.stack);

          // Reset circuit breaker on error
          apiRequestInProgress = false;
          console.log(`🔓 Circuit breaker: API request failed, resetting`);

          // Handle different types of errors gracefully
          let errorMessage = err.message || 'An error occurred while processing your request';
          let statusCode = 500;

          // Check for JSON parsing errors first
          if (err instanceof SyntaxError && err.message.includes('JSON')) {
            errorMessage = 'Invalid request format. Please check your request data.';
            statusCode = 400;
          } else if (err.message.includes('Image URL is required') || err.message.includes('image-to-video')) {
            // Image-to-video model requires image URL
            errorMessage = err.message; // Use the detailed error message we created
            statusCode = 400;
          } else if (err.message.includes('API key') || err.message.includes('API configuration')) {
            // Provide more specific error message for API key issues
            if (err.message.includes('OpenAI')) {
              errorMessage = 'OpenAI API key is required. Please configure OPENAI_API_KEY in your .env file or Railway environment variables.';
            } else if (err.message.includes('Gemini')) {
              errorMessage = 'Gemini API key is required. Please configure GEMINI_API_KEY in your .env file or Railway environment variables.';
            } else {
              errorMessage = 'API configuration error. Please check your API keys in .env file or Railway environment variables.';
            }
            statusCode = 400;
          } else if (err.message.includes('rate limit') || err.message.includes('429')) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
            statusCode = 429;
          } else if (err.message.includes('authentication') || err.message.includes('401')) {
            errorMessage = 'Authentication failed. Please check your API keys.';
            statusCode = 401;
          } else if (err.message.includes('not found') || err.message.includes('404')) {
            errorMessage = err.message; // Use the specific error message
            statusCode = 404;
          } else if (err.message.includes('timeout') || err.message.includes('timed out')) {
            errorMessage = err.message;
            statusCode = 408; // Request Timeout
          }

          res.statusCode = statusCode;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: errorMessage, details: process.env.NODE_ENV === 'development' ? err.message : undefined }));
        }
      });
      return;
    }

    // Proxy endpoint for fetching images (bypasses CORS)
    if (req.method === 'POST' && req.url === '/api/proxy-image') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e7) req.connection.destroy();
      });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const imageUrl = data.url;

          if (!imageUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Image URL is required' }));
            return;
          }

          console.log(`🖼️ Proxying image/video fetch: ${imageUrl.substring(0, 100)}...`);

          // Fetch image/video server-side (no CORS restrictions)
          const https = require('https');
          const http = require('http');
          const url = require('url');
          let imageUrlParsed;
          try {
            imageUrlParsed = new URL(imageUrl);
          } catch (urlError) {
            throw new Error(`Invalid URL format: ${imageUrl.substring(0, 100)} - ${urlError.message}`);
          }
          const client = imageUrlParsed.protocol === 'https:' ? https : http;

          // Check if this is an OpenAI content endpoint that requires authentication
          const isOpenAIContentEndpoint = imageUrl.includes('api.openai.com') && 
                                         (imageUrl.includes('/videos/') || imageUrl.includes('/images/')) &&
                                         imageUrl.includes('/content');
          
          const requestOptions = {
            hostname: imageUrlParsed.hostname,
            port: imageUrlParsed.port || (imageUrlParsed.protocol === 'https:' ? 443 : 80),
            path: imageUrlParsed.pathname + imageUrlParsed.search,
            method: 'GET',
            headers: {},
            timeout: 120000 // 2 minute timeout
          };

          // Add authentication for OpenAI content endpoints
          if (isOpenAIContentEndpoint) {
            const openaiApiKey = process.env.OPENAI_API_KEY;
            if (openaiApiKey) {
              requestOptions.headers['Authorization'] = `Bearer ${openaiApiKey}`;
              requestOptions.headers['OpenAI-Beta'] = 'sora-2';
              console.log(`🔑 Adding authentication for OpenAI content endpoint`);
            } else {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: 'OpenAI API key not configured' }));
              return;
            }
          }
          
          console.log(`📡 Making request to: ${imageUrlParsed.hostname}${requestOptions.path}`);

          const imageRequest = client.request(requestOptions, (imageRes) => {
            console.log(`📥 Response received: ${imageRes.statusCode}, content-type: ${imageRes.headers['content-type']}`);
            
            if (imageRes.statusCode >= 400) {
              let errorData = '';
              imageRes.on('data', (chunk) => { errorData += chunk; });
              imageRes.on('end', () => {
                console.error(`❌ Error response: ${errorData}`);
                res.statusCode = imageRes.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: `Failed to fetch: ${imageRes.statusCode}`, details: errorData }));
              });
              return;
            }

            const chunks = [];
            let totalSize = 0;
            const maxSize = 100 * 1024 * 1024; // 100MB limit for base64 encoding
            const startTime = Date.now();
            
            imageRes.on('data', (chunk) => {
              chunks.push(chunk);
              totalSize += chunk.length;
              const elapsed = (Date.now() - startTime) / 1000;
              if (totalSize % (1024 * 1024) === 0 || totalSize === chunk.length) {
                console.log(`📥 Downloading: ${(totalSize / 1024 / 1024).toFixed(2)} MB (${elapsed.toFixed(1)}s)`);
              }
              if (totalSize > maxSize) {
                console.error(`❌ File too large: ${totalSize} bytes`);
                imageRequest.destroy();
                res.statusCode = 413;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: 'File too large for base64 encoding. Please use direct download.' }));
                return;
              }
            });
            imageRes.on('end', () => {
              try {
                const elapsed = (Date.now() - startTime) / 1000;
                console.log(`📥 Download complete: ${(totalSize / 1024 / 1024).toFixed(2)} MB in ${elapsed.toFixed(1)}s, converting to base64...`);
                const imageBuffer = Buffer.concat(chunks);
                const base64Start = Date.now();
                const base64 = imageBuffer.toString('base64');
                const base64Elapsed = (Date.now() - base64Start) / 1000;
                console.log(`✅ Base64 conversion complete in ${base64Elapsed.toFixed(1)}s`);
                const contentType = imageRes.headers['content-type'] || (isOpenAIContentEndpoint ? 'video/mp4' : 'image/png');
                const dataUrl = `data:${contentType};base64,${base64}`;

                console.log(`✅ Proxied file: ${totalSize} bytes, content-type: ${contentType}`);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ success: true, dataUrl, contentType }));
              } catch (error) {
                console.error(`❌ Error processing file:`, error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: `Failed to process file: ${error.message}` }));
              }
            });
          });
          
          // Add timeout handler
          imageRequest.setTimeout(120000, () => {
            console.error('❌ Request timeout after 120 seconds');
            imageRequest.destroy();
            if (!res.headersSent) {
              res.statusCode = 504;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: 'Request timeout' }));
            }
          });

          imageRequest.on('error', (error) => {
            console.error('❌ Error fetching image:', error.message);
            console.error('❌ Error code:', error.code);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              // Check if it's an expired URL (common with Azure blob storage)
              let errorMessage = `Failed to fetch image: ${error.message}`;
              if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                errorMessage = `Failed to connect to image server. The image URL may be expired or invalid.`;
              } else if (imageUrl.includes('blob.core.windows.net')) {
                errorMessage = `Azure blob storage URL may be expired. DALL-E image URLs expire after 1 hour. Please regenerate the image.`;
              }
              res.end(JSON.stringify({ error: errorMessage, code: error.code }));
            } else {
              console.error('❌ Response headers already sent, cannot send error response');
            }
          });
          
          // Actually send the request
          imageRequest.end();
        } catch (error) {
          console.error('❌ Error in proxy-image endpoint:', error);
          console.error('❌ Error stack:', error.stack);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            const errorResponse = JSON.stringify({ 
              error: error.message || 'Unknown error',
              details: error.stack 
            });
            res.end(errorResponse);
          } else {
            console.error('❌ Response headers already sent, cannot send error response');
          }
        }
      });
      return;
    }

    // Video proxy endpoint - serves OpenAI video content with authentication
    if (req.method === 'GET' && req.url.startsWith('/api/proxy-video/')) {
      const videoId = req.url.split('/api/proxy-video/')[1]?.split('?')[0];
      
      if (!videoId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: 'Video ID is required' }));
        return;
      }

      try {
        // Extract userId from query params if provided
        const urlWithQuery = req.url.split('?');
        let userId = null;
        if (urlWithQuery.length > 1) {
          const queryParams = new URLSearchParams(urlWithQuery[1]);
          userId = queryParams.get('userId');
        }
        
        let openaiApiKey = process.env.OPENAI_API_KEY;
        
        // Try to get user's API key if userId is provided
        if (userId) {
          try {
            const userApiKeyData = await getUserApiKeyAndSubscription(userId);
            if (userApiKeyData.hasUserApiKey && userApiKeyData.apiKey) {
              // User has their own API key - use it regardless of subscription
              openaiApiKey = userApiKeyData.apiKey;
              console.log(`✅ Using user's API key for video proxy`);
            } else if (!userApiKeyData.isPro) {
              // User doesn't have their own API key and is not Pro - cannot use environment key
              throw new Error('Pro subscription required to use shared API key. Please upgrade to Pro or add your own OpenAI API key in your profile settings.');
            } else {
              // User is Pro but doesn't have their own API key - can use environment key
              console.log(`✅ Using environment OpenAI API key for video proxy (Pro subscription)`);
            }
          } catch (userKeyError) {
            // If error is about Pro requirement, re-throw it
            if (userKeyError.message && userKeyError.message.includes('Pro subscription required')) {
              throw userKeyError;
            }
            console.warn(`⚠️ Could not get user API key, using environment key:`, userKeyError.message);
          }
        }
        
        if (!openaiApiKey || openaiApiKey.trim() === '') {
          console.error(`❌ OpenAI API key is missing or empty for video proxy`);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable or provide a user API key.' }));
          return;
        }
        
        // Log API key status (masked for security)
        const maskedKey = openaiApiKey.substring(0, 7) + '...' + openaiApiKey.substring(openaiApiKey.length - 4);
        console.log(`🔑 Proxying video ${videoId} with API key: ${maskedKey} (${userId ? 'user' : 'environment'} key)`);

        const contentOptions = {
          hostname: 'api.openai.com',
          port: 443,
          path: `/v1/videos/${videoId}/content`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'sora-2'
          }
        };
        
        console.log(`📹 Requesting video from: https://api.openai.com/v1/videos/${videoId}/content`);

        const videoReq = https.request(contentOptions, (videoRes) => {
          console.log(`📹 Video proxy response status: ${videoRes.statusCode}`);
          
          // If we get an error, log it
          if (videoRes.statusCode >= 400) {
            let errorData = '';
            videoRes.on('data', (chunk) => { errorData += chunk; });
            videoRes.on('end', () => {
              console.error(`❌ OpenAI API error (${videoRes.statusCode}):`, errorData);
              res.statusCode = videoRes.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(errorData || JSON.stringify({ error: `OpenAI API error: ${videoRes.statusCode}` }));
            });
            return;
          }
          // Forward status code
          res.statusCode = videoRes.statusCode;
          
          // Forward headers (except those that shouldn't be forwarded)
          const headersToForward = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
          headersToForward.forEach(header => {
            if (videoRes.headers[header]) {
              res.setHeader(header, videoRes.headers[header]);
            }
          });
          
          // Add CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range');
          
          // Handle redirects
          if (videoRes.statusCode === 302 || videoRes.statusCode === 301 || videoRes.statusCode === 307 || videoRes.statusCode === 308) {
            const location = videoRes.headers.location;
            if (location) {
              res.setHeader('Location', location);
              res.end();
              return;
            }
          }

          // Stream video data
          videoRes.on('data', (chunk) => {
            res.write(chunk);
          });
          
          videoRes.on('end', () => {
            res.end();
          });
        });

        videoReq.on('error', (error) => {
          console.error(`❌ Error proxying video:`, error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: `Failed to proxy video: ${error.message}` }));
          }
        });

        // Forward request headers (like Range for video seeking)
        if (req.headers.range) {
          contentOptions.headers['Range'] = req.headers.range;
          console.log(`📹 Forwarding Range header: ${req.headers.range}`);
        }

        // Make sure to actually send the request
        console.log(`📹 Sending request to OpenAI...`);
        videoReq.end();
      } catch (error) {
        console.error('❌ Error in proxy-video endpoint:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    // Server-side video upload endpoint - streams directly from OpenAI to Firebase Storage
    if (req.method === 'POST' && req.url === '/api/upload-video') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e7) req.connection.destroy();
      });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const { videoUrl, userId, projectId, sheetId, cellId } = data;

          if (!videoUrl || !userId || !projectId || !sheetId || !cellId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'Missing required parameters' }));
            return;
          }

          console.log(`📹 Server-side video upload: ${videoUrl.substring(0, 100)}...`);

          // Check storage permissions based on subscription
          if (userId) {
            try {
              const firestoreInstance = await initializeFirebase();
              if (firestoreInstance) {
                const userDoc = await firestoreInstance.collection('users').doc(userId).get();
                if (userDoc.exists) {
                  const userData = userDoc.data();
                  const subscription = userData.subscription || 'free';
                  
                  // Free and Starter users cannot save to storage
                  if (subscription === 'free' || subscription === 'starter') {
                    res.statusCode = 403;
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(JSON.stringify({ 
                      success: false,
                      error: 'Storage not available on Free/Starter plan. Please download copies of your videos.',
                      blocked: true,
                      subscription
                    }));
                    return;
                  }
                  
                  // Pro users have 5GB limit (check would go here if we track usage)
                  // Enterprise has unlimited
                  console.log(`✅ Storage permission granted for ${subscription} subscription`);
                }
              }
            } catch (storageCheckError) {
              console.warn('⚠️ Could not verify storage permissions, proceeding with upload:', storageCheckError.message);
            }
          }

          // Get OpenAI API key
          let openaiApiKey = process.env.OPENAI_API_KEY;
          if (userId) {
            try {
              const userApiKeyData = await getUserApiKeyAndSubscription(userId);
              if (userApiKeyData.hasUserApiKey && userApiKeyData.apiKey) {
                // User has their own API key - use it regardless of subscription
                openaiApiKey = userApiKeyData.apiKey;
              } else if (!userApiKeyData.isPro) {
                // User doesn't have their own API key and is not Pro - cannot use environment key
                throw new Error('Pro subscription required to use shared API key. Please upgrade to Pro or add your own OpenAI API key in your profile settings.');
              } else {
                // User is Pro but doesn't have their own API key - can use environment key
                console.log(`✅ Using environment OpenAI API key for video upload (Pro subscription)`);
              }
            } catch (e) {
              // If error is about Pro requirement, re-throw it
              if (e.message && e.message.includes('Pro subscription required')) {
                throw e;
              }
              console.warn('Could not get user API key, using environment key');
            }
          }

          if (!openaiApiKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: 'OpenAI API key not configured' }));
            return;
          }

          // Check what type of video URL we have
          const isOpenAIContentEndpoint = videoUrl.includes('api.openai.com') && 
                                         videoUrl.includes('/videos/') && 
                                         videoUrl.includes('/content');
          const isOpenAICDN = videoUrl.includes('cdn.openai.com');
          const isDirectVideoUrl = videoUrl.match(/^https?:\/\/.+\.(mp4|webm|mov)/i);
          const isOpenAIVideoUrl = videoUrl.includes('openai.com') && videoUrl.includes('video');

          // Extract video ID for filename (if it's a content endpoint)
          let videoId = 'video';
          if (isOpenAIContentEndpoint) {
            const videoIdMatch = videoUrl.match(/\/videos\/([^\/]+)\/content/);
            videoId = videoIdMatch ? videoIdMatch[1] : 'video';
          } else if (isOpenAIVideoUrl) {
            // Try to extract ID from other OpenAI video URL formats
            const videoIdMatch = videoUrl.match(/\/videos\/([^\/\?]+)/);
            if (videoIdMatch) videoId = videoIdMatch[1];
          }

          // Download video from the source
          const urlParsed = new URL(videoUrl);
          const contentOptions = {
            hostname: urlParsed.hostname,
            port: urlParsed.port || (urlParsed.protocol === 'https:' ? 443 : 80),
            path: urlParsed.pathname + urlParsed.search,
            method: 'GET',
            headers: {},
            timeout: 120000
          };

          // Add authentication only for OpenAI content endpoints
          if (isOpenAIContentEndpoint) {
            contentOptions.headers['Authorization'] = `Bearer ${openaiApiKey}`;
            contentOptions.headers['OpenAI-Beta'] = 'sora-2';
          }

          console.log(`📥 Downloading video from: ${urlParsed.hostname}${contentOptions.path}`);

          // Use appropriate HTTP client based on protocol
          const client = urlParsed.protocol === 'https:' ? https : http;

          const videoReq = client.request(contentOptions, async (videoRes) => {
            if (videoRes.statusCode >= 400) {
              let errorData = '';
              videoRes.on('data', (chunk) => { errorData += chunk; });
              videoRes.on('end', () => {
                console.error(`❌ Video download error: ${errorData}`);
                res.statusCode = videoRes.statusCode;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: `Failed to download video: ${errorData}` }));
              });
              return;
            }

            try {
              // Initialize Firebase Admin
              const firestoreInstance = await initializeFirebase();
              if (!firestoreInstance || !admin.apps.length) {
                throw new Error('Firebase Admin SDK not initialized');
              }

              // Get storage bucket name from environment or use default
              const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app';
              const bucket = admin.storage().bucket(storageBucket);
              const timestamp = Date.now();
              const extension = 'mp4';
              const filename = `videos/${userId}/${projectId}/${sheetId}/${cellId}/${timestamp}.${extension}`;
              const file = bucket.file(filename);

              console.log(`📤 Uploading to Firebase Storage: ${filename}`);

              // Create a write stream to Firebase Storage
              const writeStream = file.createWriteStream({
                metadata: {
                  contentType: 'video/mp4',
                  cacheControl: 'public, max-age=31536000',
                },
              });

              let totalBytes = 0;
              videoRes.on('data', (chunk) => {
                writeStream.write(chunk);
                totalBytes += chunk.length;
                if (totalBytes % (1024 * 1024) === 0) {
                  console.log(`📥 Streamed: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                }
              });

              videoRes.on('end', () => {
                writeStream.end();
              });

              writeStream.on('finish', async () => {
                try {
                  // Get a signed URL with long expiration (10 years) - this provides access with a token
                  // Format will be: https://storage.googleapis.com/{bucket}/{path}?GoogleAccessId=...&Expires=...&Signature=...
                  const expiresAt = new Date();
                  expiresAt.setFullYear(expiresAt.getFullYear() + 10); // 10 years from now
                  
                  const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: expiresAt
                  });
                  
                  // The signed URL works, but for consistency with client-side getDownloadURL(),
                  // we can also construct the Firebase Storage API format if needed
                  // For now, use the signed URL which will work
                  const finalUrl = signedUrl;
                  
                  console.log(`✅ Video uploaded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
                  console.log(`✅ Download URL: ${finalUrl.substring(0, 100)}...`);
                  
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.end(JSON.stringify({ success: true, url: finalUrl }));
                } catch (error) {
                  console.error(`❌ Error finalizing upload:`, error);
                  console.error(`❌ Error stack:`, error.stack);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.end(JSON.stringify({ error: `Failed to finalize upload: ${error.message}` }));
                }
              });

              writeStream.on('error', (error) => {
                console.error(`❌ Upload stream error:`, error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ error: `Upload failed: ${error.message}` }));
              });

            } catch (error) {
              console.error(`❌ Error setting up upload:`, error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: `Failed to setup upload: ${error.message}` }));
            }
          });

          videoReq.on('error', (error) => {
            console.error(`❌ Request error:`, error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ error: `Request failed: ${error.message}` }));
          });

          videoReq.setTimeout(120000, () => {
            console.error('❌ Request timeout');
            videoReq.destroy();
            if (!res.headersSent) {
              res.statusCode = 504;
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({ error: 'Request timeout' }));
            }
          });

          videoReq.end();
        } catch (error) {
          console.error('❌ Error in upload-video endpoint:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // Serve static files for GET requests
    if (req.method === 'GET' || req.method === 'HEAD') {
      // Resolve file path
      let filePath = resolveFilePath(pathname);
      
      // Check if file exists, if not, serve index.html for SPA routing
      fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
          // File doesn't exist - serve index.html for SPA fallback (React Router)
          const indexPath = path.join(publicDir, 'index.html');
          fs.readFile(indexPath, (err, content) => {
            if (err) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain');
              res.end('Not Found');
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            if (req.method === 'HEAD') {
              res.end();
            } else {
              res.end(content);
            }
          });
        } else {
          // File exists - serve it
          fs.readFile(filePath, (err, content) => {
            if (err) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain');
              res.end('Not Found');
              return;
            }
            const contentType = getContentType(filePath);
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            if (req.method === 'HEAD') {
              res.end();
            } else {
              res.end(content);
            }
          });
        }
      });
      return;
    }

    // For any other methods or routes, return 405 Method Not Allowed
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Method Not Allowed');
  } catch (error) {
    handleError(res, 500, 'Internal server error', error);
  }
});

// Note: API endpoints for models are handled in the main server request handler

// Start the server
async function startServer() {
  try {
    // Initialize Firebase for cloud deployment
    const firebaseResult = await initializeFirebase();
    if (firebaseResult === null) {
      console.log('⚠️ Firebase Admin SDK not initialized, but server will continue');
    }

    // Initialize local development mode
    await initializeLocalDev();

    // Initialize database
    await initializeDatabase();

    // Preload models on startup
    console.log('🔍 Loading models on startup...');
    try {
      availableModels = await fetchAvailableModels();
      modelsCacheTime = Date.now();
      console.log(`✅ Preloaded ${availableModels.length} models on startup`);
    } catch (error) {
      console.error('❌ Error preloading models:', error);
      // Continue anyway - models will be loaded on first request
    }

    // Run Firebase diagnostics
    try {
      const diagnostics = await diagnoseFirebaseModels();
      if (diagnostics.initialized) {
        console.log(`📊 Firebase diagnostics: ${diagnostics.modelsCount} models in collection`);
      } else {
        console.log(`⚠️ Firebase diagnostics: ${diagnostics.error || 'Not initialized'}`);
      }
    } catch (error) {
      console.error('❌ Error running Firebase diagnostics:', error.message);
    }

    server.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📊 Health check available at http://localhost:${port}/health`);
      console.log(`🌐 Railway deployment ready - Firebase config available at /firebase-config.js`);
    });

    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();