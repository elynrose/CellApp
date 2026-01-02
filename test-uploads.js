/**
 * Test script for image and video uploads to Firebase Storage
 * Tests both direct URLs and OpenAI content endpoints
 */

const http = require('http');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Test cases
const testCases = [
  {
    name: 'Test Image Upload (Direct URL)',
    type: 'image',
    url: 'https://picsum.photos/800/600',
    endpoint: '/api/proxy-image'
  },
  {
    name: 'Test Video Upload (Direct URL)',
    type: 'video',
    url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
    endpoint: '/api/upload-video',
    requiresAuth: false,
    testData: {
      videoUrl: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
      userId: 'test-user-123',
      projectId: 'test-project-123',
      sheetId: 'test-sheet-123',
      cellId: 'A1'
    }
  }
];

async function testEndpoint(testCase) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 ${testCase.name}`);
    console.log(`   URL: ${testCase.url}`);
    
    const url = new URL(testCase.endpoint, API_BASE_URL);
    const postData = testCase.testData 
      ? JSON.stringify(testCase.testData)
      : JSON.stringify({ url: testCase.url });

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
            if (testCase.type === 'image') {
              if (result.success && result.dataUrl) {
                console.log(`   ✅ SUCCESS: Image proxied successfully`);
                console.log(`   📊 Size: ${result.dataUrl.length} characters (base64)`);
                console.log(`   📄 Content-Type: ${result.contentType}`);
                resolve({ success: true, result });
              } else {
                console.log(`   ❌ FAILED: Invalid response format`);
                console.log(`   Response: ${JSON.stringify(result, null, 2)}`);
                resolve({ success: false, error: 'Invalid response format' });
              }
            } else if (testCase.type === 'video') {
              if (result.success && result.url) {
                console.log(`   ✅ SUCCESS: Video uploaded to Firebase Storage`);
                console.log(`   🔗 Firebase URL: ${result.url.substring(0, 100)}...`);
                resolve({ success: true, result });
              } else {
                console.log(`   ❌ FAILED: Invalid response format`);
                console.log(`   Response: ${JSON.stringify(result, null, 2)}`);
                resolve({ success: false, error: 'Invalid response format' });
              }
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
      resolve({ success: false, error: error.message });
    });

    req.setTimeout(60000, () => {
      console.log(`   ❌ FAILED: Request timeout`);
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting upload tests...');
  console.log(`📍 API Base URL: ${API_BASE_URL}\n`);

  const results = [];
  
  for (const testCase of testCases) {
    const result = await testEndpoint(testCase);
    results.push({ testCase: testCase.name, ...result });
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  results.forEach((result, index) => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${result.testCase}`);
    if (result.success) passed++;
    else failed++;
  });
  
  console.log('='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});

