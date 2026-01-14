/**
 * OpenAI and Gemini API - Practical Code Examples
 * 
 * This file contains practical examples of how to call OpenAI and Gemini APIs
 * using Node.js native https module (matching the codebase implementation)
 */

const https = require('https');

// ============================================================================
// OPENAI API EXAMPLES
// ============================================================================

/**
 * Example 1: OpenAI Chat Completions (Text Generation)
 */
async function openAIChatCompletion(prompt, model = 'gpt-4o', temperature = 0.7, maxTokens = 1000) {
  const requestBody = {
    model: model,
    messages: [
      { role: 'user', content: prompt }
    ],
    temperature: temperature,
    max_tokens: maxTokens
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`OpenAI API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          resolve(response.choices[0].message.content);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

/**
 * Example 2: OpenAI DALL-E Image Generation
 */
async function openAIImageGeneration(prompt, model = 'dall-e-3', size = '1024x1024') {
  const requestBody = {
    model: model,
    prompt: prompt,
    n: 1,
    size: size
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`OpenAI API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          resolve(response.data[0].url);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

/**
 * Example 3: OpenAI Sora 2 Video Generation (with polling)
 */
async function openAIVideoGeneration(prompt, size = '1280x720', seconds = 8) {
  const requestBody = {
    model: 'sora-2',
    prompt: prompt,
    size: size,
    seconds: seconds
  };

  // Step 1: Create video generation job
  const jobId = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/videos',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`OpenAI API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          resolve(response.id);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });

  // Step 2: Poll for job completion
  return pollVideoJobStatus(jobId);
}

/**
 * Helper: Poll Sora 2 video job status
 */
function pollVideoJobStatus(jobId, maxAttempts = 60, attempt = 0) {
  return new Promise((resolve, reject) => {
    if (attempt >= maxAttempts) {
      reject(new Error('Video generation timed out'));
      return;
    }

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: `/v1/videos/${jobId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`OpenAI API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          if (response.status === 'completed') {
            resolve(response.video_url || response.video?.url || response.url);
          } else if (response.status === 'failed') {
            reject(new Error(`Video generation failed: ${response.error?.message || 'Unknown error'}`));
          } else {
            // Still processing, poll again after 2 seconds
            setTimeout(() => {
              pollVideoJobStatus(jobId, maxAttempts, attempt + 1)
                .then(resolve)
                .catch(reject);
            }, 2000);
          }
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.end();
  });
}

/**
 * Example 4: OpenAI Text-to-Speech (TTS)
 */
async function openAITextToSpeech(text, model = 'tts-1', voice = 'alloy') {
  const requestBody = {
    model: model,
    input: text,
    voice: voice
  };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 400) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          reject(new Error(`OpenAI API Error ${res.statusCode}: ${errorData}`));
        });
        return;
      }

      // Handle binary audio data
      const chunks = [];
      res.on('data', (chunk) => { chunks.push(chunk); });
      res.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        const audioBase64 = audioBuffer.toString('base64');
        // Return as data URL for easy use in HTML
        resolve(`data:audio/mpeg;base64,${audioBase64}`);
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

// ============================================================================
// GEMINI API EXAMPLES
// ============================================================================

/**
 * Example 5: Gemini Text Generation
 */
async function geminiTextGeneration(prompt, model = 'gemini-1.5-pro', temperature = 0.7, maxTokens = 2048) {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: maxTokens
    }
  };

  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const path = `/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Gemini API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            reject(new Error('No text generated in response'));
            return;
          }
          resolve(text);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

/**
 * Example 6: Gemini with System Instructions (using safety settings)
 */
async function geminiWithSafetySettings(prompt, model = 'gemini-1.5-pro') {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ],
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const path = `/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Gemini API Error ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const response = JSON.parse(data);
          resolve(response.candidates[0].content.parts[0].text);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example usage of all functions
 */
async function exampleUsage() {
  try {
    // OpenAI Text Generation
    const text = await openAIChatCompletion('Write a haiku about coding');
    console.log('OpenAI Response:', text);

    // OpenAI Image Generation
    const imageUrl = await openAIChatCompletion('A futuristic city at sunset');
    console.log('Image URL:', imageUrl);

    // OpenAI Video Generation (async, may take time)
    // const videoUrl = await openAIVideoGeneration('A cat walking on the beach');
    // console.log('Video URL:', videoUrl);

    // OpenAI Text-to-Speech
    const audioDataUrl = await openAITextToSpeech('Hello, this is a test');
    console.log('Audio generated (base64 data URL)');

    // Gemini Text Generation
    const geminiText = await geminiTextGeneration('Explain quantum computing in simple terms');
    console.log('Gemini Response:', geminiText);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export functions for use in other files
module.exports = {
  openAIChatCompletion,
  openAIImageGeneration,
  openAIVideoGeneration,
  openAITextToSpeech,
  geminiTextGeneration,
  geminiWithSafetySettings
};

// Uncomment to run examples (make sure API keys are set)
// exampleUsage();



