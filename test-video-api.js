/**
 * Test script to verify OpenAI Sora 2 API video generation
 * This script tests the API directly to ensure the request format is correct
 */

import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file (same as server does)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Get API key from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable is not set');
  console.log('Please set it with: export OPENAI_API_KEY=your_key_here');
  process.exit(1);
}

console.log('🧪 Testing OpenAI Sora 2 API video generation...\n');

// Test 1: With seconds as a string (correct format)
console.log('📝 Test 1: seconds as string "8"');
testVideoGeneration({
  model: 'sora-2',
  prompt: 'A cat playing piano',
  resolution: '720p',
  seconds: '8'  // String, as required by API
});

// Wait a bit before next test
setTimeout(() => {
  console.log('\n📝 Test 2: seconds as number 8 (should fail)');
  testVideoGeneration({
    model: 'sora-2',
    prompt: 'A dog running in a park',
    resolution: '720p',
    seconds: 8  // Number, should cause error
  });
}, 2000);

function testVideoGeneration(requestData) {
  console.log('\n📤 Request Data:');
  console.log(JSON.stringify(requestData, null, 2));
  console.log(`\n🔍 Type check:`);
  console.log(`  - seconds type: ${typeof requestData.seconds}`);
  console.log(`  - seconds value: ${requestData.seconds}`);
  
  // Stringify the request
  const requestBodyString = JSON.stringify(requestData);
  console.log(`\n📦 Stringified body: ${requestBodyString}`);
  
  // Parse it back to verify
  const parsed = JSON.parse(requestBodyString);
  console.log(`\n🔍 After parse:`);
  console.log(`  - seconds type: ${typeof parsed.seconds}`);
  console.log(`  - seconds value: ${parsed.seconds}`);
  
  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/videos/create',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBodyString)
    }
  };

  console.log('\n🚀 Sending request to OpenAI API...\n');

  const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log(`📥 Response Status: ${res.statusCode}`);
      console.log(`📥 Response Headers:`, res.headers);
      
      try {
        const parsed = JSON.parse(responseData);
        console.log('\n✅ Response Body:');
        console.log(JSON.stringify(parsed, null, 2));
        
        if (res.statusCode >= 400) {
          console.log('\n❌ ERROR: Request failed');
          if (parsed.error) {
            console.log(`   Error message: ${parsed.error.message}`);
            console.log(`   Error type: ${parsed.error.type}`);
            console.log(`   Error param: ${parsed.error.param}`);
          }
        } else {
          console.log('\n✅ SUCCESS: Request accepted!');
          if (parsed.id) {
            console.log(`   Job ID: ${parsed.id}`);
            console.log(`   Status: ${parsed.status}`);
          }
        }
      } catch (error) {
        console.log('\n❌ Failed to parse response:');
        console.log(responseData.substring(0, 500));
      }
    });
  });

  req.on('error', (error) => {
    console.error('\n❌ Request error:', error.message);
  });

  req.write(requestBodyString);
  req.end();
}

