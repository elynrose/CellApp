# OpenAI and Gemini API Reference Guide

This document provides comprehensive information on how to call OpenAI and Gemini APIs, including both official patterns and the implementation used in this codebase.

## Table of Contents
1. [OpenAI API](#openai-api)
2. [Gemini API](#gemini-api)
3. [Authentication](#authentication)
4. [Current Implementation](#current-implementation)

---

## OpenAI API

### Base URL
```
https://api.openai.com/v1
```

### Authentication
OpenAI uses **Bearer token authentication** in the `Authorization` header:
```
Authorization: Bearer YOUR_API_KEY
```

### Available Endpoints

#### 1. Chat Completions (Text Generation)
**Endpoint:** `POST /chat/completions`

**Request Body:**
```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Your prompt here"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Response:**
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Generated text response"
      }
    }
  ]
}
```

**Available Models:**
- `gpt-4o` - Most advanced GPT-4 model
- `gpt-4o-mini` - Faster, cheaper GPT-4 model
- `gpt-4-turbo` - Previous generation GPT-4
- `gpt-3.5-turbo` - Fast and efficient model

**Example (Node.js with https module):**
```javascript
const https = require('https');

const requestBody = {
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ],
  temperature: 0.7,
  max_tokens: 1000
};

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
    const response = JSON.parse(data);
    console.log(response.choices[0].message.content);
  });
});

req.write(JSON.stringify(requestBody));
req.end();
```

#### 2. Image Generation (DALL-E)
**Endpoint:** `POST /images/generations`

**Request Body:**
```json
{
  "model": "dall-e-3",
  "prompt": "A beautiful sunset over mountains",
  "n": 1,
  "size": "1024x1024"
}
```

**Response:**
```json
{
  "data": [
    {
      "url": "https://..."
    }
  ]
}
```

**Available Models:**
- `dall-e-3` - Latest image generation model
- `dall-e-2` - Previous generation

**Size Options:**
- `1024x1024` (DALL-E 2 & 3)
- `512x512` (DALL-E 2 only)
- `256x256` (DALL-E 2 only)
- `1792x1024`, `1024x1792` (DALL-E 3 only)

#### 3. Video Generation (Sora 2)
**Endpoint:** `POST /videos`

**Request Body:**
```json
{
  "model": "sora-2",
  "prompt": "A cat walking on the beach",
  "size": "1280x720",
  "seconds": 8
}
```

**Response:**
```json
{
  "id": "job_id_here",
  "status": "processing"
}
```

**Note:** Sora 2 uses asynchronous job processing. You need to poll the job status:
- `GET /v1/videos/{job_id}` - Check job status
- `GET /v1/videos/{job_id}/content` - Get video URL when completed

**Status Values:**
- `processing` - Job is being processed
- `completed` - Job is done, video URL available
- `failed` - Job failed

#### 4. Text-to-Speech (TTS)
**Endpoint:** `POST /audio/speech`

**Request Body:**
```json
{
  "model": "tts-1",
  "input": "Hello, this is a test",
  "voice": "alloy"
}
```

**Response:** Binary audio data (MP3 format)

**Available Models:**
- `tts-1` - Standard quality
- `tts-1-hd` - High definition quality

**Available Voices:**
- `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

---

## Gemini API

### Base URL
```
https://generativelanguage.googleapis.com/v1beta
```

### Authentication
Gemini uses **API key as a query parameter** (not in headers):
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=YOUR_API_KEY
```

### Available Endpoints

#### 1. Text Generation
**Endpoint:** `POST /models/{model}:generateContent`

**Request Body:**
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Your prompt here"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.7,
    "maxOutputTokens": 2048
  }
}
```

**Response:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Generated text response"
          }
        ]
      }
    }
  ]
}
```

**Available Models:**
- `gemini-2.0-flash-exp` - Latest experimental model
- `gemini-1.5-pro` - Most capable model
- `gemini-1.5-flash` - Fast and efficient
- `gemini-pro` - Standard model

**Example (Node.js with https module):**
```javascript
const https = require('https');
const querystring = require('querystring');

const requestBody = {
  contents: [
    {
      parts: [
        { text: 'Hello, how are you?' }
      ]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048
  }
};

const apiKey = process.env.GEMINI_API_KEY;
const model = 'gemini-1.5-pro';
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
    const response = JSON.parse(data);
    console.log(response.candidates[0].content.parts[0].text);
  });
});

req.write(JSON.stringify(requestBody));
req.end();
```

#### 2. Image Generation (Imagen)
**Note:** Imagen requires Vertex AI setup, which is more complex. For simplicity, this codebase uses DALL-E for image generation.

---

## Authentication

### Environment Variables
Both APIs require API keys stored as environment variables:

```bash
# .env file
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

### Security Best Practices
1. **Never expose API keys in client-side code**
2. **Use environment variables** for API keys
3. **Store keys securely** in production (e.g., Railway, Vercel environment variables)
4. **Rotate keys** if compromised
5. **Use different keys** for development and production

---

## Current Implementation

### How the Codebase Calls APIs

The codebase uses a unified `makeAPIRequest` function that handles both OpenAI and Gemini APIs with provider-specific logic.

#### Key Functions

1. **`makeAPIRequest(provider, endpoint, data, apiKey)`**
   - Handles HTTP requests to both APIs
   - Automatically sets correct authentication method
   - Handles binary responses (audio)
   - Includes error handling and timeouts

2. **`callHybridAI(model, prompt, temperature, maxTokens)`**
   - Determines which API to use based on model name
   - Routes to appropriate endpoint (text/image/video/audio)
   - Handles special cases (Sora polling, TTS binary data)

#### Provider Detection
```javascript
const isGeminiModel = model.includes('gemini') || model.includes('imagen');
const isOpenAIModel = !isGeminiModel; // Default to OpenAI
```

#### Authentication Differences
```javascript
// OpenAI - Bearer token in header
headers: {
  'Authorization': `Bearer ${apiKey}`
}

// Gemini - API key in query parameter
url.searchParams.set('key', apiKey);
delete options.headers['Authorization'];
```

### Request Flow

1. Frontend calls `/api/llm` endpoint
2. Server receives request with `prompt`, `model`, `temperature`, `maxTokens`
3. `callHybridAI()` determines provider and model type
4. `makeAPIRequest()` makes HTTP request with correct auth
5. Response is parsed and returned to frontend

### Error Handling

The implementation includes:
- API key validation
- Request timeouts (30 seconds)
- Error parsing and user-friendly messages
- Circuit breaker (prevents concurrent requests)

---

## API Rate Limits & Pricing

### OpenAI
- **Rate Limits:** Varies by tier (free tier: 3 requests/minute)
- **Pricing:** Pay-per-use, varies by model
- **Documentation:** https://platform.openai.com/docs/guides/rate-limits

### Gemini
- **Rate Limits:** Varies by tier (free tier: 15 requests/minute)
- **Pricing:** Pay-per-use, varies by model
- **Documentation:** https://ai.google.dev/pricing

---

## Additional Resources

### OpenAI
- **Official Docs:** https://platform.openai.com/docs
- **API Reference:** https://platform.openai.com/docs/api-reference
- **SDKs:** https://platform.openai.com/docs/libraries
- **Cookbook:** https://cookbook.openai.com

### Gemini
- **Official Docs:** https://ai.google.dev/gemini-api/docs
- **API Reference:** https://ai.google.dev/api
- **SDKs:** https://ai.google.dev/gemini-api/docs/libraries

---

## Common Issues & Solutions

### Issue: 401 Unauthorized
**Solution:** Check that API key is correctly set in environment variables

### Issue: 429 Rate Limit Exceeded
**Solution:** Implement request queuing or wait before retrying

### Issue: Timeout Errors
**Solution:** Increase timeout or check network connectivity

### Issue: Invalid Model Name
**Solution:** Verify model name matches available models list

---

## Testing API Calls

You can test API endpoints directly using curl:

### OpenAI Chat Completions
```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Gemini Generate Content
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello!"}]
    }]
  }'
```



