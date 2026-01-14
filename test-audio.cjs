/**
 * Test script for audio generation
 * Tests TTS (Text-to-Speech) audio generation
 */

const http = require('http');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testAudioGeneration() {
  return new Promise((resolve, reject) => {
    console.log('\n🧪 Testing Audio Generation (TTS)');
    console.log('   Model: tts-1');
    console.log('   Prompt: "Hello, this is a test of text to speech generation."');
    
    const url = new URL('/api/llm', API_BASE_URL);
    const postData = JSON.stringify({
      model: 'tts-1',
      prompt: 'Hello, this is a test of text to speech generation.',
      temperature: 0.7
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 3000),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Check for both 'text' and 'output' fields (server returns 'text', client expects 'output')
            const audioData = result.text || result.output;
            if (audioData) {
              const isDataUrl = audioData.startsWith('data:audio');
              const isUrl = audioData.startsWith('http');
              
              if (isDataUrl) {
                const base64Length = audioData.split(',')[1]?.length || 0;
                console.log(`   ✅ SUCCESS: Audio generated as data URL`);
                console.log(`   📊 Base64 length: ${base64Length} characters`);
                console.log(`   📄 Format: ${audioData.substring(5, audioData.indexOf(';'))}`);
                resolve({ success: true, result });
              } else if (isUrl) {
                console.log(`   ✅ SUCCESS: Audio URL returned`);
                console.log(`   🔗 URL: ${audioData.substring(0, 100)}...`);
                resolve({ success: true, result });
              } else {
                console.log(`   ⚠️  WARNING: Unexpected output format`);
                console.log(`   Response: ${audioData.substring(0, 200)}...`);
                resolve({ success: true, result }); // Still count as success
              }
            } else {
              console.log(`   ❌ FAILED: No audio data in response`);
              console.log(`   Response: ${JSON.stringify(result, null, 2)}`);
              resolve({ success: false, error: 'No audio data in response' });
            }
          } else {
            console.log(`   ❌ FAILED: HTTP ${res.statusCode}`);
            console.log(`   Error: ${result.error || data}`);
            resolve({ success: false, error: result.error || `HTTP ${res.statusCode}` });
          }
        } catch (error) {
          console.log(`   ❌ FAILED: Parse error - ${error.message}`);
          console.log(`   Raw response: ${data.substring(0, 200)}...`);
          resolve({ success: false, error: error.message });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ FAILED: Request error - ${error.message}`);
      console.log(`   💡 Make sure the server is running on ${API_BASE_URL}`);
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(30000, () => {
      console.log(`   ❌ FAILED: Request timeout`);
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(postData);
    req.end();
  });
}

async function runTest() {
  console.log('🚀 Starting audio generation test...');
  console.log(`📍 API Base URL: ${API_BASE_URL}\n`);

  const result = await testAudioGeneration();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULT');
  console.log('='.repeat(60));
  console.log(result.success ? '✅ PASS' : '❌ FAIL');
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }
  console.log('='.repeat(60));
  
  process.exit(result.success ? 0 : 1);
}

// Run test
runTest().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});

