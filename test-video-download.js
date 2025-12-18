/**
 * Simple script to test downloading a video from OpenAI API
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const videoId = 'video_693cdfedeb6c8191aae2ded61493999304db60e233a5fe00';
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  console.error('   Please set it in your .env file');
  process.exit(1);
}

console.log(`🔑 Using API key: ${openaiApiKey.substring(0, 7)}...${openaiApiKey.substring(openaiApiKey.length - 4)}`);
console.log(`📹 Fetching video: ${videoId}`);

const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: `/v1/videos/${videoId}/content`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${openaiApiKey}`,
    'OpenAI-Beta': 'sora-2'
  }
};

console.log(`🌐 Request URL: https://api.openai.com${options.path}`);
console.log(`📋 Request headers:`, {
  'Authorization': `Bearer ${openaiApiKey.substring(0, 7)}...${openaiApiKey.substring(openaiApiKey.length - 4)}`,
  'OpenAI-Beta': 'sora-2'
});

const req = https.request(options, (res) => {
  console.log(`\n📥 Response status: ${res.statusCode}`);
  console.log(`📋 Response headers:`, res.headers);

  if (res.statusCode >= 400) {
    console.error(`❌ Error: HTTP ${res.statusCode}`);
    let errorData = '';
    res.on('data', (chunk) => {
      errorData += chunk;
    });
    res.on('end', () => {
      console.error(`❌ Error response:`, errorData);
      try {
        const parsed = JSON.parse(errorData);
        console.error(`❌ Parsed error:`, JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.error(`❌ Raw error data:`, errorData);
      }
      process.exit(1);
    });
    return;
  }

  // Handle redirects
  if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 307 || res.statusCode === 308) {
    const location = res.headers.location;
    console.log(`🔄 Redirect to: ${location}`);
    console.log(`   You can download from this URL directly or follow the redirect`);
    process.exit(0);
  }

  // Determine content type and file extension
  const contentType = res.headers['content-type'] || 'video/mp4';
  const extension = contentType.includes('webm') ? 'webm' : 
                   contentType.includes('mov') ? 'mov' : 'mp4';
  
  console.log(`📦 Content type: ${contentType}`);
  console.log(`💾 Saving as: test-video.${extension}`);

  // Create public folder if it doesn't exist
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const filePath = path.join(publicDir, `test-video.${extension}`);
  const fileStream = fs.createWriteStream(filePath);

  let totalBytes = 0;
  res.on('data', (chunk) => {
    fileStream.write(chunk);
    totalBytes += chunk.length;
    process.stdout.write(`\r📥 Downloaded: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  });

  res.on('end', () => {
    fileStream.end();
    console.log(`\n✅ Video downloaded successfully!`);
    console.log(`📁 Saved to: ${filePath}`);
    console.log(`📊 Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  });
});

req.on('error', (error) => {
  console.error(`❌ Request error:`, error.message);
  process.exit(1);
});

console.log(`\n🚀 Sending request...\n`);
req.end();

