/**
 * Prompt Optimizer
 * Makes prompts more concise and to the point before sending to AI
 */

/**
 * Optimize a prompt by making it more concise while preserving essential meaning
 * @param {string} prompt - Original prompt
 * @returns {string} Optimized, concise prompt
 */
export function optimizePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  let optimized = prompt.trim();

  // Remove excessive whitespace (multiple spaces, tabs, newlines)
  optimized = optimized.replace(/\s+/g, ' ');

  // Remove redundant phrases and filler words
  const redundantPhrases = [
    /\b(please\s+)?(kindly\s+)?(can\s+you\s+)?(could\s+you\s+)?(would\s+you\s+)?(i\s+would\s+like\s+you\s+to\s+)?(i\s+want\s+you\s+to\s+)?(i\s+need\s+you\s+to\s+)?/gi,
    /\b(please\s+)?(make\s+sure\s+to\s+)?(be\s+sure\s+to\s+)?(ensure\s+that\s+)?/gi,
    /\b(very\s+)?(really\s+)?(quite\s+)?(extremely\s+)?(incredibly\s+)?/gi,
    /\b(i\s+think\s+)?(i\s+believe\s+)?(i\s+feel\s+)?(in\s+my\s+opinion\s+)?/gi,
    /\b(that\s+is\s+)?(which\s+is\s+)?(that\s+are\s+)?/gi,
    /\b(and\s+also\s+)/gi,
    /\b(but\s+however\s+)/gi,
    /\b(in\s+order\s+to\s+)/gi,
    /\b(so\s+that\s+)/gi,
    /\b(as\s+well\s+as\s+)/gi,
  ];

  redundantPhrases.forEach(regex => {
    optimized = optimized.replace(regex, ' ');
  });

  // Simplify common verbose patterns
  const simplifications = [
    { pattern: /\bcreate\s+a\s+/gi, replacement: 'create ' },
    { pattern: /\bwrite\s+a\s+/gi, replacement: 'write ' },
    { pattern: /\bgenerate\s+a\s+/gi, replacement: 'generate ' },
    { pattern: /\bmake\s+a\s+/gi, replacement: 'make ' },
    { pattern: /\bprovide\s+me\s+with\s+/gi, replacement: 'provide ' },
    { pattern: /\bgive\s+me\s+a\s+/gi, replacement: 'give ' },
    { pattern: /\bshow\s+me\s+a\s+/gi, replacement: 'show ' },
    { pattern: /\btell\s+me\s+about\s+/gi, replacement: 'describe ' },
    { pattern: /\bexplain\s+to\s+me\s+/gi, replacement: 'explain ' },
    { pattern: /\bhelp\s+me\s+(to\s+)?/gi, replacement: '' },
    { pattern: /\bi\s+am\s+looking\s+for\s+/gi, replacement: 'find ' },
    { pattern: /\bi\s+want\s+to\s+/gi, replacement: '' },
    { pattern: /\bi\s+need\s+to\s+/gi, replacement: '' },
    { pattern: /\bwith\s+the\s+following\s+requirements?\s*:/gi, replacement: ': ' },
    { pattern: /\bthe\s+following\s+are\s+the\s+requirements?\s*:/gi, replacement: 'requirements: ' },
    { pattern: /\bhere\s+are\s+the\s+details?\s*:/gi, replacement: '' },
    { pattern: /\bdetails?\s+are\s+as\s+follows?\s*:/gi, replacement: ': ' },
  ];

  simplifications.forEach(({ pattern, replacement }) => {
    optimized = optimized.replace(pattern, replacement);
  });

  // Remove redundant punctuation
  optimized = optimized.replace(/\.{2,}/g, '.');
  optimized = optimized.replace(/!{2,}/g, '!');
  optimized = optimized.replace(/\?{2,}/g, '?');
  optimized = optimized.replace(/,{2,}/g, ',');

  // Remove leading/trailing punctuation that doesn't make sense
  optimized = optimized.replace(/^[,\s.]+/, '');
  optimized = optimized.replace(/[,\s.]+$/, '');

  // Remove empty parentheses and brackets
  optimized = optimized.replace(/\(\s*\)/g, '');
  optimized = optimized.replace(/\[\s*\]/g, '');
  optimized = optimized.replace(/\{\s*\}/g, '');

  // Clean up multiple spaces again after all replacements
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // Remove redundant sentence starters
  optimized = optimized.replace(/^(so\s+|and\s+|but\s+|then\s+|now\s+)/i, '');

  // Capitalize first letter if needed
  if (optimized.length > 0 && optimized[0] !== optimized[0].toUpperCase()) {
    optimized = optimized[0].toUpperCase() + optimized.slice(1);
  }

  // Ensure it ends with proper punctuation if it's a complete sentence
  if (optimized.length > 10 && !/[.!?]$/.test(optimized)) {
    // Only add period if it looks like a complete sentence
    if (!optimized.includes('{{') && !optimized.match(/^[A-Z]/)) {
      optimized += '.';
    }
  }

  return optimized.trim();
}

/**
 * Check if a prompt should be optimized
 * Only optimize if prompt is longer than a threshold
 * @param {string} prompt - Prompt to check
 * @param {number} threshold - Minimum length to trigger optimization (default: 100)
 * @returns {boolean} Whether to optimize
 */
export function shouldOptimizePrompt(prompt, threshold = 100) {
  if (!prompt || typeof prompt !== 'string') {
    return false;
  }
  return prompt.trim().length > threshold;
}


