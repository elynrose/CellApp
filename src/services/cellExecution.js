/**
 * Cell Execution Service
 * Handles running cells with AI generation, dependency resolution, and history tracking
 */

import { generateAI, getModelType, checkJobStatus } from '../api';
import { resolveDependencies, parseDependencies, topologicalSort, findDependentCells } from '../utils/dependencies';
import { shouldCellExecute } from '../utils/conditions';
import { saveCell, saveGeneration, deductCredits, getUserSubscription, resetMonthlyCredits } from '../firebase/firestore';
import { optimizePrompt, shouldOptimizePrompt } from '../utils/promptOptimizer';
import { uploadImageFromUrl, uploadVideoFromUrl, uploadAudioFromUrl } from '../firebase/storage';
import { getCreditCost, hasEnoughCredits, getPlanById } from '../services/subscriptions';

/**
 * Get format instructions based on output format setting
 */
function getFormatInstructions(outputFormat) {
    const formatMap = {
        'markdown': 'Format your response as Markdown with proper headings, lists, and formatting.',
        'json': 'Format your response as valid JSON.',
        'html': 'Format your response as HTML.',
        'plain': 'Format your response as plain text without any special formatting.',
        'bullet-list': 'Format your response as a bulleted list.',
        'numbered-list': 'Format your response as a numbered list.',
        'code': 'Format your response as code with proper syntax highlighting.'
    };
    return formatMap[outputFormat] || null;
}

/**
 * Execute a single cell with AI generation
 * 
 * @param {Object} params - Execution parameters
 * @param {string} params.cellId - Cell ID to execute
 * @param {Object} params.cell - Cell data object
 * @param {string} params.userId - Current user ID
 * @param {string} params.projectId - Current project ID
 * @param {string} params.sheetId - Current sheet ID
 * @param {Array} params.sheets - All sheets array
 * @param {Object} params.currentSheet - Current sheet object
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<Object>} Execution result
 */
/**
 * Check if all parent dependencies of a cell have completed
 * A dependency is considered complete if the cell has output
 */
/**
 * Check if a string is a valid cell reference format (e.g., A1, B1, C2, etc.)
 * Valid formats: letter(s) followed by number(s)
 */
function isValidCellReference(ref) {
  if (!ref || typeof ref !== 'string') return false;
  // Remove any generation specs or type prefixes for validation
  let cleanRef = ref;
  if (cleanRef.includes('-')) {
    cleanRef = cleanRef.split('-')[0];
  }
  if (cleanRef.includes(':')) {
    cleanRef = cleanRef.split(':')[cleanRef.split(':').length - 1];
  }
  // Check if it matches pattern: one or more letters followed by one or more digits
  // Examples: A1, B1, C2, AA1, Z99
  return /^[A-Za-z]+\d+$/.test(cleanRef);
}

export async function areAllDependenciesComplete(cell, sheets, currentSheet, getLatestCells = null, runningCellsSet = null, userId = null, projectId = null) {
  if (!cell.prompt) return true; // No prompt means no dependencies
  
  const dependencies = parseDependencies(cell.prompt);
  if (dependencies.length === 0) return true; // No dependencies
  
  for (const dep of dependencies) {
    // Extract cell ID from dependency (handle formats like "prompt:A1", "Sheet2!A1", etc.)
    let ref = dep;
    if (ref.includes(':')) {
      ref = ref.split(':')[1];
    }
    if (ref.includes('!')) {
      const parts = ref.split('!');
      ref = parts[parts.length - 1]; // Get the cell ID after the sheet name
    }
    // Handle generation specs
    if (ref.includes('-')) {
      ref = ref.split('-')[0];
    }
    if (ref.includes(':')) {
      ref = ref.split(':')[0];
    }
    
    // Validate that this is actually a cell reference (e.g., A1, B1) and not just a word
    // If it's not a valid cell reference format, skip it (it's likely a literal word in the prompt)
    if (!isValidCellReference(ref)) {
      // Not a valid cell reference, skip this dependency check
      // This handles cases where {{genre}} or other words are in the prompt
      continue;
    }
    
    // Find the dependency cell
    let depCell = null;
    let depSheet = currentSheet;
    
    // Check if it's a cross-sheet reference
    if (dep.includes('!')) {
      const parts = dep.split('!');
      // Handle type prefix (prompt:, output:) before sheet name
      let sheetName = parts[0];
      if (sheetName.includes(':')) {
        // Format: prompt:Sheet2!A1 or output:Sheet2!A1
        const colonIndex = sheetName.indexOf(':');
        sheetName = sheetName.substring(colonIndex + 1);
      }
      // Now sheetName should be just the sheet name
      depSheet = sheets.find(s => s.name === sheetName);
      if (!depSheet) {
        console.warn(`❌ Dependency sheet "${sheetName}" not found. Available sheets:`, sheets.map(s => s.name));
        return false;
      }
      ref = parts[parts.length - 1];
      // Handle generation specs in cross-sheet refs
      if (ref.includes('-')) ref = ref.split('-')[0];
      if (ref.includes(':')) ref = ref.split(':')[0];
      
      // Ensure cells are loaded for cross-sheet references
      if (!depSheet.cells || Object.keys(depSheet.cells).length === 0) {
        console.log(`📥 Loading cells for cross-sheet reference: "${sheetName}" (ID: ${depSheet.id})...`);
        // Try to load cells - this will be handled by the loadSheetCells function in the context
        // For now, we'll need to load them here if possible
        if (userId && projectId) {
          try {
            const { getSheetCells } = await import('../firebase/firestore');
            const cellsResult = await getSheetCells(userId, projectId, depSheet.id);
            if (cellsResult.success && cellsResult.cells) {
              const cellsObj = {};
              cellsResult.cells.forEach(cell => {
                cellsObj[cell.cell_id] = {
                  ...cell,
                  x: cell.x || 0,
                  y: cell.y || 0,
                  width: cell.width || 350,
                  height: cell.height || null,
                  model: cell.model || 'gpt-3.5-turbo',
                  temperature: cell.temperature ?? 0.7,
                  generations: cell.generations || [],
                  output: cell.output || '', // CRITICAL: Ensure output is included
                  status: cell.status || null,
                  jobId: cell.jobId || null,
                  prompt: cell.prompt || '' // Also include prompt for cross-sheet references
                };
              });
              depSheet.cells = cellsObj;
              console.log(`✅ Loaded ${Object.keys(cellsObj).length} cells for sheet "${sheetName}"`);
              // Debug: Log cell data to verify output is loaded
              const firstCellId = Object.keys(cellsObj)[0];
              if (firstCellId) {
                const firstCell = cellsObj[firstCellId];
                console.log(`🔍 Sample cell "${firstCellId}": hasOutput=${!!firstCell.output}, outputLength=${firstCell.output?.length || 0}, generations=${firstCell.generations?.length || 0}`);
              }
              // Refresh depSheet reference to get updated cells
              const refreshedSheet = sheets.find(s => s.id === depSheet.id);
              if (refreshedSheet) {
                depSheet = refreshedSheet;
              }
            }
          } catch (error) {
            console.error(`❌ Error loading cells for sheet "${sheetName}":`, error);
          }
        }
      } else {
        // Refresh depSheet reference even if cells are already loaded (to get latest state)
        const refreshedSheet = sheets.find(s => s.id === depSheet.id);
        if (refreshedSheet) {
          depSheet = refreshedSheet;
        }
      }
    }
    
    // ALWAYS prioritize getLatestCells if available (most up-to-date state)
    // This ensures we see the latest state even if the cell was just updated
    // Note: getLatestCells only works for current sheet, so for cross-sheet we use depSheet.cells
    if (getLatestCells && depSheet.id === currentSheet.id) {
      const latestCells = getLatestCells();
      if (latestCells && latestCells[ref]) {
        depCell = latestCells[ref];
      }
    }
    
    // Fallback to sheet.cells if getLatestCells didn't find it
    if (!depCell && depSheet && depSheet.cells) {
      depCell = depSheet.cells[ref];
    }
    
    // Check if dependency cell exists
    if (!depCell) {
      // Only warn if it's a valid cell reference format but not found
      // This helps debug actual missing cells vs. literal words
      if (isValidCellReference(ref)) {
        console.warn(`Dependency cell "${ref}" not found`);
      }
      return false;
    }
    
    // Check if dependency cell is currently running - must wait if it is
    if (runningCellsSet && runningCellsSet.has(ref)) {
      return false; // Dependency is still running, must wait
    }
    
    // Check if dependency has completed generation
    // A dependency is complete if its most recent generation has status 'completed'
    const generations = depCell.generations || [];
    const latestGeneration = generations.length > 0 ? generations[generations.length - 1] : null;
    const hasCompletedGeneration = latestGeneration && latestGeneration.status === 'completed';
    
    // Check if cell has error status - if so, consider it "complete" (even if failed) to avoid infinite waiting
    const hasErrorStatus = depCell.status === 'error' || latestGeneration?.status === 'error';
    
    // Also check if cell has output (for backward compatibility)
    // If cell has output, consider it complete even if no generation record exists yet
    // IMPORTANT: For cross-sheet references, we're looking for the prompt (textarea value), not output
    // But for dependency completion check, we still need to check if the cell has been generated
    const outputText = depCell.output || '';
    const hasOutput = outputText.trim() !== '' && 
                     !outputText.includes('No generations yet') &&
                     !outputText.includes('ERROR') &&
                     !outputText.includes('[ERROR') &&
                     !outputText.includes('[Sheet') &&
                     !outputText.includes('[Cell');
    
    // Additional check: if cell has generations array with items, consider it complete
    // (even if latest generation status isn't 'completed', having generations means it ran)
    // This is CRITICAL for cross-sheet references where generation status might not be properly set
    const hasGenerations = Array.isArray(generations) && generations.length > 0;
    
    // Dependency is complete if:
    // 1. It has a completed generation, OR
    // 2. It has valid output (even without generation record), OR
    // 3. It has error status (to avoid infinite waiting on failed cells), OR
    // 4. It has generations (meaning it has run at least once) - CRITICAL for cross-sheet refs
    const isComplete = hasCompletedGeneration || hasOutput || hasErrorStatus || hasGenerations;
    
    // Debug: Log why dependency is/isn't complete (only for cross-sheet refs, and only occasionally)
    if (dep.includes('!') && !isComplete) {
      // Log every 50th check to avoid spam but still get useful info
      const logChance = Math.random();
      if (logChance < 0.02) { // 2% chance = roughly every 50th check
        console.log(`🔍 Cross-sheet dependency "${dep}" (${ref}) not complete:`, {
          hasOutput,
          hasCompletedGen: hasCompletedGeneration,
          hasError: hasErrorStatus,
          hasGenerations,
          generationsCount: generations.length,
          outputLength: outputText.length,
          outputPreview: outputText.substring(0, 100),
          cellStatus: depCell.status,
          latestGenStatus: latestGeneration?.status
        });
      }
    }
    
    if (!isComplete) {
      return false; // Dependency not complete - must wait
    }
  }
  
  return true; // All dependencies are complete
}

/**
 * Wait for all parent dependencies to complete
 * Polls until all dependencies have output
 */
async function waitForDependencies(cell, sheets, currentSheet, getLatestCells = null, runningCellsSet = null, userId = null, projectId = null, cellId = null, maxWaitTime = 300000) {
  const startTime = Date.now();
  const checkInterval = 100; // Check every 100ms
  let lastCheckTime = startTime;
  let checkCount = 0;
  
  while (!(await areAllDependenciesComplete(cell, sheets, currentSheet, getLatestCells, runningCellsSet, userId, projectId))) {
    // Check if this cell is still supposed to be running
    // If it was stopped, exit the wait loop
    const currentCellId = cellId || cell.cell_id || cell.cellId;
    if (runningCellsSet && currentCellId && !runningCellsSet.has(currentCellId)) {
      console.log(`🛑 Cell ${currentCellId} was stopped, exiting dependency wait`);
      throw new Error('Cell execution was stopped');
    }
    
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitTime) {
      // Log which dependencies are blocking - check both same-sheet and cross-sheet
      const dependencies = parseDependencies(cell.prompt || '');
      const blockingDeps = [];
      for (const dep of dependencies) {
        let ref = dep;
        let depSheet = currentSheet;
        
        // Handle cross-sheet references
        if (dep.includes('!')) {
          const parts = dep.split('!');
          let sheetName = parts[0];
          if (sheetName.includes(':')) {
            const colonIndex = sheetName.indexOf(':');
            sheetName = sheetName.substring(colonIndex + 1);
          }
          depSheet = sheets.find(s => s.name === sheetName || s.name?.toLowerCase() === sheetName?.toLowerCase());
          ref = parts[parts.length - 1];
        } else if (ref.includes(':')) {
          ref = ref.split(':')[1];
        }
        
        if (ref.includes('-')) ref = ref.split('-')[0];
        if (ref.includes(':')) ref = ref.split(':')[0];
        
        if (isValidCellReference(ref)) {
          let depCell = null;
          
          // Check cross-sheet cells
          if (depSheet && depSheet.id !== currentSheet.id) {
            depCell = depSheet.cells?.[ref];
          } else if (getLatestCells && currentSheet) {
            const latestCells = getLatestCells();
            depCell = latestCells?.[ref];
          } else if (currentSheet?.cells) {
            depCell = currentSheet.cells[ref];
          }
          
          if (!depCell) {
            const sheetInfo = depSheet && depSheet.id !== currentSheet.id ? ` in ${depSheet.name}` : '';
            blockingDeps.push(`${ref}${sheetInfo} (not found)`);
          } else {
            const generations = depCell.generations || [];
            const latestGen = generations.length > 0 ? generations[generations.length - 1] : null;
            const hasOutput = depCell.output && depCell.output.trim() !== '' && 
                             !depCell.output.includes('No generations yet') &&
                             !depCell.output.includes('ERROR') &&
                             !depCell.output.includes('[ERROR') &&
                             !depCell.output.includes('[Sheet') &&
                             !depCell.output.includes('[Cell');
            const hasCompletedGen = latestGen && latestGen.status === 'completed';
            const hasError = depCell.status === 'error' || latestGen?.status === 'error';
            const isComplete = hasCompletedGen || hasOutput || hasError;
            
            if (!isComplete) {
              const sheetInfo = depSheet && depSheet.id !== currentSheet.id ? ` in ${depSheet.name}` : '';
              blockingDeps.push(`${ref}${sheetInfo} (status: ${depCell.status || 'unknown'}, hasOutput: ${hasOutput}, hasCompletedGen: ${hasCompletedGen}, hasError: ${hasError})`);
            }
          }
        }
      }
      console.error(`Timeout waiting for dependencies. Blocking: ${blockingDeps.join(', ')}`);
      throw new Error(`Timeout waiting for dependencies to complete for cell`);
    }
    
    // Log progress every 10 seconds (less verbose for slow models)
    if (Date.now() - lastCheckTime > 10000) {
      checkCount++;
      console.log(`[${cell.cell_id || 'unknown'}] Waiting for dependencies (${Math.round(elapsed/1000)}s elapsed, timeout: ${Math.round(maxWaitTime/1000)}s)...`);
      lastCheckTime = Date.now();
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}

export async function runCell({
  cellId,
  cell,
  userId,
  projectId,
  sheetId,
  sheets,
  currentSheet,
  onProgress,
  getLatestCells = null, // Optional function to get latest cell state
  runningCellsSet = null // Optional Set of currently running cell IDs
}) {
  try {
    if (onProgress) onProgress({ status: 'resolving', cellId });

    // Create a pending generation record to track this run
    const pendingGeneration = {
      prompt: cell.prompt || '',
      resolvedPrompt: '',
      output: '',
      model: cell.model || 'gpt-3.5-turbo',
      temperature: cell.temperature ?? 0.7,
      type: getModelType(cell.model || 'gpt-3.5-turbo'),
      status: 'pending', // Will be updated to 'running' then 'completed' or 'error'
      timestamp: new Date()
    };

    // NOTE: We no longer wait for dependencies to complete
    // Cells will reference whatever value is available (even if empty) and proceed immediately
    // This allows cells to run without waiting for their dependencies
    
    // Check if cell should execute based on conditions
    const resolveValue = async (ref) => {
      // If it's a cell reference, resolve it
      if (ref && /^[A-Za-z]+\d+$/.test(ref)) {
        const targetSheet = sheets.find(s => s.id === currentSheet.id) || currentSheet;
        const targetCell = getLatestCells ? getLatestCells()?.[ref] : targetSheet.cells?.[ref];
        if (targetCell) {
          return targetCell.output || '';
        }
      }
      return ref || '';
    };
    
    const shouldExecute = await shouldCellExecute(cell, resolveValue);
    if (!shouldExecute) {
      console.log(`⏭️  Cell ${cellId} skipped due to condition`);
      if (onProgress) onProgress({ status: 'skipped', cellId, message: 'Cell execution skipped due to condition' });
      
      // Create a skipped generation record
      const skippedGeneration = {
        ...pendingGeneration,
        status: 'skipped',
        output: '[Cell execution skipped due to condition]',
        timestamp: new Date()
      };
      
      const updatedCell = {
        ...cell,
        generations: [...(cell.generations || []), skippedGeneration],
        updatedAt: new Date()
      };
      
      // Save to Firestore
      if (userId && projectId && sheetId) {
        await saveCell(userId, projectId, sheetId, cellId, updatedCell);
        await saveGeneration(userId, projectId, sheetId, cellId, skippedGeneration);
      }
      
      return {
        success: true,
        cellId,
        skipped: true,
        output: '[Cell execution skipped due to condition]'
      };
    }
    
    // Update generation status to 'running'
    pendingGeneration.status = 'running';
    if (onProgress) onProgress({ status: 'generating', cellId });

    // Combine cell prompt template with user prompt
    const userPrompt = cell.prompt || '';
    const templatePrompt = cell.cellPrompt || '';
    const fullPrompt = templatePrompt ? `${templatePrompt}\n\n${userPrompt}` : userPrompt;

    // Resolve dependencies in the prompt
    // IMPORTANT: Even though waitForDependencies already checked, we pass runningCellsSet
    // to resolveCellReference so it can double-check and wait if needed
    // This prevents race conditions where a dependency just finished but output isn't visible yet
    let resolvedPrompt = await resolveDependencies(fullPrompt, {
      sheets,
      currentSheet,
      userId, // Pass userId for loading generations
      projectId, // Pass projectId for loading generations
      runningCellsSet, // Pass running cells set so resolveCellReference can wait if needed
      getLatestCells, // Pass function to get latest cells for up-to-date state
      getCell: async (targetSheetId, targetCellId) => {
        // Find the sheet
        const targetSheet = sheets.find(s => s.id === targetSheetId);
        if (!targetSheet || !targetSheet.cells) {
          return null;
        }
        // Use getLatestCells if available for most up-to-date state
        if (getLatestCells && targetSheetId === currentSheet.id) {
          const latestCells = getLatestCells();
          return latestCells?.[targetCellId] || null;
        }
        return targetSheet.cells[targetCellId] || null;
      },
      loadSheetCells: async (targetSheetId) => {
        // Load cells from Firestore for the target sheet
        console.log(`📥 Loading cells for sheet ${targetSheetId}...`);
        try {
          const { getSheetCells } = await import('../firebase/firestore');
          const result = await getSheetCells(userId, projectId, targetSheetId);
          if (result.success && result.cells) {
            // Convert array to object and add to the sheet
            const targetSheet = sheets.find(s => s.id === targetSheetId);
            if (targetSheet) {
              const cellsObj = {};
              result.cells.forEach(cell => {
                cellsObj[cell.cell_id] = {
                  ...cell,
                  x: cell.x || 0,
                  y: cell.y || 0,
                  width: cell.width || 350,
                  height: cell.height || null,
                  model: cell.model || 'gpt-3.5-turbo',
                  temperature: cell.temperature ?? 0.7,
                  generations: cell.generations || [],
                  output: cell.output || '', // CRITICAL: Ensure output is included
                  prompt: cell.prompt || '', // CRITICAL: Ensure prompt is included
                  status: cell.status || null,
                  jobId: cell.jobId || null
                };
              });
              targetSheet.cells = cellsObj;
              console.log(`✅ Loaded ${Object.keys(cellsObj).length} cells for sheet ${targetSheetId}`);
            }
          }
        } catch (error) {
          console.error(`❌ Error loading cells for sheet ${targetSheetId}:`, error);
        }
      }
    });

    if (onProgress) onProgress({ status: 'generating', cellId });

    // Debug: Log the resolved prompt to verify dependencies were resolved
    if (fullPrompt !== resolvedPrompt) {
      console.log(`✅ Dependencies resolved for cell ${cellId}:`, {
        original: fullPrompt.substring(0, 100),
        resolved: resolvedPrompt.substring(0, 200)
      });
    }
    
    // Final verification: ensure no {{tags}} remain in the resolved prompt
    if (resolvedPrompt.includes('{{')) {
      console.warn(`⚠️ Unresolved dependency tags found in resolved prompt for cell ${cellId}. Removing them.`);
      // Remove any remaining {{...}} tags that weren't resolved
      resolvedPrompt = resolvedPrompt.replace(/\{\{[^}]+\}\}/g, '');
      // Clean up any double spaces or awkward spacing left by removal
      resolvedPrompt = resolvedPrompt.replace(/\s+/g, ' ').trim();
    }

    // Call AI generation API
    const model = cell.model || 'gpt-3.5-turbo';
    const temperature = cell.temperature ?? 0.7;
    const characterLimit = cell.characterLimit || 0;
    const outputFormat = cell.outputFormat || '';

    // Apply output format instructions to prompt if specified
    let finalPrompt = resolvedPrompt;
    if (outputFormat && getModelType(model) === 'text') {
        const formatInstructions = getFormatInstructions(outputFormat);
        if (formatInstructions) {
            finalPrompt = `${resolvedPrompt}\n\n${formatInstructions}`;
        }
    }

    // Optimize prompt to make it more concise before sending
    // This should process the resolved content (including any image URLs from dependencies)
    if (shouldOptimizePrompt(finalPrompt)) {
        finalPrompt = optimizePrompt(finalPrompt);
    }

    // For image generation models, sanitize the prompt by removing image URLs and processing text content
    // Image URLs and long text content in prompts can trigger OpenAI's safety system
    // Note: modelType is declared later, so we check here with getModelType directly
    if (getModelType(model) === 'image') {
        // Remove image URLs (both direct URLs and URLs in text)
        // Pattern matches: http/https URLs ending in image extensions
        const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?[^\s]*)?/gi;
        finalPrompt = finalPrompt.replace(imageUrlPattern, (match) => {
            return 'the referenced image';
        });
        
        // Also remove any remaining long URLs that might be image URLs
        // This catches Firebase Storage URLs and other image hosting URLs
        const longUrlPattern = /https?:\/\/[^\s]{100,}/g;
        finalPrompt = finalPrompt.replace(longUrlPattern, (url) => {
            // Check if URL looks like an image URL
            if (url.includes('firebasestorage') || url.includes('image') || url.includes('img') || url.includes('photo') || url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)/i)) {
                return 'the referenced image';
            }
            return url; // Keep other long URLs as-is
        });
        
        // For image generation, condense long text content from dependencies
        // Long narrative text can trigger safety systems - extract key visual elements instead
        // The prompt optimizer should have already processed it, but we need to be more aggressive for image prompts
        
        // If the prompt is very long (likely contains long narrative text from dependencies), condense it
        if (finalPrompt.length > 200) {
            // Split into parts - usually the first part is the actual image generation instruction
            // and the rest is content from dependencies
            const parts = finalPrompt.split(/\n\n|\.\s+(?=[A-Z])/);
            if (parts.length > 2) {
                // Keep the first part (the actual prompt instruction)
                const instructionPart = parts[0].trim();
                // Combine the rest and extract key visual nouns/adjectives
                const contentPart = parts.slice(1).join(' ');
                
                // Extract key visual elements: nouns and descriptive adjectives
                // Look for patterns like "young shepherd", "giant warrior", etc.
                const visualKeywords = [];
                const words = contentPart.toLowerCase().split(/\s+/);
                
                // Extract adjective + noun pairs
                for (let i = 0; i < words.length - 1; i++) {
                    const word1 = words[i];
                    const word2 = words[i + 1];
                    // Common visual adjectives
                    if (word1.match(/^(young|old|giant|small|tall|short|brave|fierce|ancient|modern|colorful|dark|bright|large|tiny|huge|massive|powerful|mighty)$/)) {
                        visualKeywords.push(`${words[i]} ${word2}`);
                    }
                }
                
                // Also extract standalone important nouns
                const importantNouns = ['david', 'goliath', 'warrior', 'shepherd', 'boy', 'giant', 'battle', 'sword', 'shield'];
                importantNouns.forEach(noun => {
                    if (contentPart.toLowerCase().includes(noun) && !visualKeywords.some(k => k.includes(noun))) {
                        visualKeywords.push(noun);
                    }
                });
                
                // Build condensed prompt
                if (visualKeywords.length > 0) {
                    finalPrompt = `${instructionPart}, featuring ${visualKeywords.slice(0, 6).join(', ')}`;
                } else {
                    // Fallback: just use the instruction part
                    finalPrompt = instructionPart;
                }
            }
        }
        
        // Clean up any awkward phrasing that might result from replacements
        finalPrompt = finalPrompt.replace(/\s+for\s+the\s+referenced\s+image/gi, ' for the referenced image');
        finalPrompt = finalPrompt.replace(/\s+the\s+referenced\s+image\s+the\s+referenced\s+image/gi, ' the referenced image');
        finalPrompt = finalPrompt.replace(/\s+/g, ' ').trim(); // Clean up extra spaces
    }

    // Add character limit instruction to prompt if specified (for text generation only)
    // Added after optimization to ensure the instruction is clear and not affected by optimization
    if (characterLimit > 0 && getModelType(model) === 'text') {
        finalPrompt = `${finalPrompt}\n\nIMPORTANT: Your response must be exactly ${characterLimit} characters or less. Generate your complete response within this character limit. Do not exceed it.`;
    }

    // Check user credits before generating
    const subscriptionInfo = await getUserSubscription(userId);
    if (!subscriptionInfo.success) {
      throw new Error('Failed to check subscription status');
    }

    const subscriptionData = subscriptionInfo.data;
    const userCredits = subscriptionData?.credits?.current || 0;
    const nextReset = subscriptionData?.credits?.nextReset;
    
    // Check if credits need to be reset (monthly reset)
    if (nextReset) {
      let nextResetDate;
      if (nextReset.toDate) {
        nextResetDate = nextReset.toDate();
      } else if (nextReset.seconds) {
        nextResetDate = new Date(nextReset.seconds * 1000);
      } else if (nextReset instanceof Date) {
        nextResetDate = nextReset;
      } else {
        nextResetDate = new Date(nextReset);
      }
      
      const now = new Date();
      
      if (now >= nextResetDate) {
        // Reset credits for the month
        const planId = subscriptionData.subscription || 'free';
        const plan = await getPlanById(planId);
        await resetMonthlyCredits(userId, planId, plan.monthlyCredits);
        
        // Reload subscription info after reset
        const updatedInfo = await getUserSubscription(userId);
        if (updatedInfo.success) {
          subscriptionData.credits = updatedInfo.data.credits;
        }
      }
    }

    const modelType = getModelType(model);
    const creditCost = getCreditCost(modelType, model);
    const currentCredits = subscriptionData?.credits?.current || 0;

    if (!hasEnoughCredits(currentCredits, creditCost)) {
      throw new Error(`Insufficient credits. You need ${creditCost} credits but only have ${currentCredits}. Please upgrade your subscription.`);
    }

    // Calculate max_tokens from character limit (rough estimate: 1 token ≈ 4 characters)
    const maxTokens = characterLimit > 0 ? Math.ceil(characterLimit / 4) : undefined;

    // Prepare video settings if this is a video model
    // CRITICAL: seconds must be a string ('4', '8', or '12'), not a number
    let videoSettings = undefined;
    if (modelType === 'video') {
      // Convert to string and validate
      const secondsValue = cell.videoSeconds;
      const secondsStr = String(secondsValue || '8');
      const validSeconds = ['4', '8', '12'];
      const finalSeconds = validSeconds.includes(secondsStr) ? secondsStr : '8';
      
      console.log(`🎬 cellExecution: videoSeconds value="${secondsValue}" (type: ${typeof secondsValue}) -> final="${finalSeconds}" (type: ${typeof finalSeconds})`);
      
      videoSettings = {
        seconds: finalSeconds, // Already a string
        resolution: cell.videoResolution || '720p',
        aspectRatio: cell.videoAspectRatio || '9:16'
      };
      
      // Final verification before sending
      console.log(`🎬 cellExecution: Final videoSettings.seconds type: ${typeof videoSettings.seconds}, value: "${videoSettings.seconds}"`);
    }

    // Prepare audio settings if this is an audio model
    let audioSettings = undefined;
    if (modelType === 'audio') {
      audioSettings = {
        voice: cell.audioVoice || 'alloy',
        speed: cell.audioSpeed ?? 1.0,
        format: cell.audioFormat || 'mp3'
      };
      
      console.log(`🎵 cellExecution: Audio settings:`, audioSettings);
    }

    // Add a final check right before the API call
    if (videoSettings && videoSettings.seconds) {
      console.log(`🎬 cellExecution: Before generateAI call - seconds type: ${typeof videoSettings.seconds}, value: "${videoSettings.seconds}"`);
    }

    const result = await generateAI(finalPrompt, model, temperature, maxTokens, videoSettings, audioSettings, userId);
    
    // Deduct credits after successful generation
    if (result.success) {
      const deductResult = await deductCredits(userId, creditCost);
      if (!deductResult.success) {
        console.warn('Failed to deduct credits:', deductResult.error);
        // Don't fail the generation, just log the warning
      } else {
        // Update credits in subscription data for immediate UI update
        if (subscriptionData?.credits) {
          subscriptionData.credits.current = deductResult.remainingCredits;
        }
      }
    }

    if (!result.success) {
      throw new Error(result.error || 'AI generation failed');
    }

    // Check if this is an async job (video/image generation)
    if (result.jobId && result.status) {
      // Save job info to cell with status='pending'
      const jobGeneration = {
        ...pendingGeneration,
        prompt: userPrompt,
        resolvedPrompt,
        output: '',
        model,
        temperature,
        type: getModelType(model),
        status: 'pending',
        jobId: result.jobId,
        timestamp: pendingGeneration.timestamp
      };

      const updatedCell = {
        ...cell,
        status: 'pending',
        jobId: result.jobId,
        model,
        temperature,
        generations: [...(cell.generations || []), jobGeneration],
        updatedAt: new Date()
      };

      // Save to Firestore
      await saveCell(userId, projectId, sheetId, cellId, updatedCell);
      await saveGeneration(userId, projectId, sheetId, cellId, jobGeneration);

      // Notify UI that job was created and polling is needed
      if (onProgress) {
        onProgress({ 
          status: 'polling', 
          cellId, 
          updatedCell,
          message: 'Job created, polling status...'
        });
      }

      console.log(`✅ Job created for cell ${cellId}: ${result.jobId}, status: pending`);

      // Start polling for job status (will be handled by App.jsx on sheet load or immediately)
      // Return early - polling will complete the generation
      return {
        success: true,
        cellId,
        jobId: result.jobId,
        status: 'pending',
        output: null,
        needsPolling: true
      };
    }

    let output = result.output;

    // Note: Character limit is enforced via max_tokens and prompt instructions
    // No post-generation truncation - the AI should generate within the limit

    // CRITICAL: Auto-upload media to Firebase Storage BEFORE saving to Firestore
    // This ensures all media is permanently stored before being displayed
    // The save icon in the UI is a backup for cases where auto-upload fails
    // If output is an image/video/audio URL, upload it to Firebase Storage
    const originalOutput = output; // Keep original for fallback
    
    if (modelType === 'image' && output && typeof output === 'string' && (output.startsWith('http') || output.startsWith('data:'))) {
        // Check if it's an image URL (with or without extension - many APIs return URLs without extensions)
        const hasImageExtension = output.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i);
        const isImageGenerationService = output.includes('dalle') || 
                                         output.includes('openai') || 
                                         output.includes('blob.core.windows.net') ||
                                         output.includes('imagen') ||
                                         output.includes('recraft') ||
                                         output.includes('flux');
        const isImageUrl = hasImageExtension || (isImageGenerationService && !output.includes('firebasestorage.googleapis.com'));
        
        // Skip if already a Firebase Storage URL
        if (isImageUrl && !output.includes('firebasestorage.googleapis.com')) {
            if (onProgress) onProgress({ status: 'uploading', cellId });
            console.log(`📸 Auto-uploading image to Firebase Storage before saving: ${output.substring(0, 100)}...`);
            const uploadResult = await uploadImageFromUrl(output, userId, projectId, sheetId, cellId);
            if (uploadResult.success) {
                output = uploadResult.url;
                console.log(`✅ Image auto-uploaded to Firebase Storage: ${output.substring(0, 100)}...`);
                if (onProgress) onProgress({ status: 'uploaded', cellId });
            } else {
                console.error('❌ Failed to auto-upload image to Firebase Storage:', uploadResult.error);
                console.warn('⚠️ Cell will be saved with original URL. Use save icon to retry upload.');
                // Continue with original URL if upload fails - user can use save icon as backup
            }
        }
    } else if (modelType === 'video' && output && typeof output === 'string' && output.startsWith('http')) {
        // Check if it's a video URL (with or without file extension - OpenAI may return URLs without extensions)
        const hasVideoExtension = output.match(/^https?:\/\/.+\.(mp4|webm|mov)/i);
        const isOpenAIVideoUrl = output && (
            (output.includes('openai.com') && (output.includes('video') || output.includes('/videos/'))) ||
            output.includes('cdn.openai.com')
        );
        const isOpenAIContentEndpoint = output && (
            output.includes('api.openai.com') && output.includes('/videos/') && output.includes('/content')
        );
        const isVideoGenerationService = output.includes('sora') || 
                                         output.includes('runway') || 
                                         output.includes('pika') ||
                                         output.includes('stable-video');
        const isVideoUrl = hasVideoExtension || isOpenAIVideoUrl || isOpenAIContentEndpoint || isVideoGenerationService;
        
        // Skip if already a Firebase Storage URL
        if (isVideoUrl && !output.includes('firebasestorage.googleapis.com')) {
            if (onProgress) onProgress({ status: 'uploading', cellId });
            console.log(`📹 Auto-uploading video to Firebase Storage before saving (CRITICAL: OpenAI videos expire after 1 hour): ${output.substring(0, 100)}...`);
            const uploadResult = await uploadVideoFromUrl(output, userId, projectId, sheetId, cellId);
            if (uploadResult.success) {
                output = uploadResult.url;
                console.log(`✅ Video auto-uploaded to Firebase Storage: ${output.substring(0, 100)}...`);
                if (onProgress) onProgress({ status: 'uploaded', cellId });
            } else {
                console.error('❌ Failed to auto-upload video to Firebase Storage:', uploadResult.error);
                console.warn('⚠️ Cell will be saved with original URL. Use save icon to retry upload.');
                // Continue with original URL if upload fails - user can use save icon as backup
            }
        }
    } else if (modelType === 'audio' && output && (output.match(/^https?:\/\/.+\.(mp3|wav|ogg)/i) || output.startsWith('data:audio'))) {
        // Skip if already a Firebase Storage URL
        if (!output.includes('firebasestorage.googleapis.com')) {
            if (onProgress) onProgress({ status: 'uploading', cellId });
            console.log(`🎵 Auto-uploading audio to Firebase Storage before saving: ${output.startsWith('data:') ? 'data URL' : output.substring(0, 100)}...`);
            const uploadResult = await uploadAudioFromUrl(output, userId, projectId, sheetId, cellId);
            if (uploadResult.success) {
                output = uploadResult.url;
                console.log(`✅ Audio auto-uploaded to Firebase Storage: ${output.substring(0, 100)}...`);
                if (onProgress) onProgress({ status: 'uploaded', cellId });
            } else {
                console.error('❌ Failed to auto-upload audio to Firebase Storage:', uploadResult.error);
                console.warn('⚠️ Cell will be saved with original URL. Use save icon to retry upload.');
                // Continue with original URL if upload fails - user can use save icon as backup
            }
        }
    }

    if (onProgress) onProgress({ status: 'saving', cellId });

    // Update pending generation with results and mark as completed
    // IMPORTANT: output now contains Firebase URL if upload was successful
    const generation = {
      ...pendingGeneration,
      prompt: userPrompt,
      resolvedPrompt,
      output, // This is now the Firebase URL if upload succeeded, or original URL if upload failed
      model,
      temperature,
      type: getModelType(model),
      status: 'completed', // Status: 'pending', 'running', 'completed', 'error'
      timestamp: pendingGeneration.timestamp // Keep original timestamp
    };
    
    // Log if we're saving with Firebase URL or original URL
    if (output && output.includes('firebasestorage.googleapis.com')) {
      console.log(`✅ Saving generation with Firebase URL: ${output.substring(0, 100)}...`);
    } else if (output && (output.includes('openai.com') || output.includes('blob.core.windows.net'))) {
      console.warn(`⚠️ Saving generation with original URL (auto-upload may have failed): ${output.substring(0, 100)}...`);
    }

    // Update cell with new output and add to generations array
    const updatedCell = {
      ...cell,
      output,
      model,
      temperature,
      generations: [...(cell.generations || []), generation],
      updatedAt: new Date()
    };

    // Save to Firestore
    await saveCell(userId, projectId, sheetId, cellId, updatedCell);

    // Save generation to history
    await saveGeneration(userId, projectId, sheetId, cellId, generation);

    if (onProgress) onProgress({ status: 'complete', cellId, output, updatedCell });

    return {
      success: true,
      cellId,
      output,
      generation
    };
  } catch (error) {
    console.error(`Error running cell ${cellId}:`, error);
    
    // Create error generation record
    const errorGeneration = {
      prompt: cell.prompt || '',
      resolvedPrompt: '',
      output: '',
      model: cell.model || 'gpt-3.5-turbo',
      temperature: cell.temperature ?? 0.7,
      type: getModelType(cell.model || 'gpt-3.5-turbo'),
      status: 'error',
      error: error.message,
      timestamp: new Date()
    };
    
    // Update cell with error generation
    const updatedCell = {
      ...cell,
      generations: [...(cell.generations || []), errorGeneration],
      updatedAt: new Date()
    };
    
    // Save error generation to Firestore
    if (userId && projectId && sheetId) {
      try {
        await saveCell(userId, projectId, sheetId, cellId, updatedCell);
        await saveGeneration(userId, projectId, sheetId, cellId, errorGeneration);
      } catch (saveError) {
        console.error('Failed to save error generation:', saveError);
      }
    }
    
    if (onProgress) {
      onProgress({ status: 'error', cellId, error: error.message });
    }
    return {
      success: false,
      cellId,
      error: error.message
    };
  }
}

/**
 * Execute multiple cells in dependency order
 * 
 * @param {Object} params - Execution parameters
 * @param {Array<string>} params.cellIds - Array of cell IDs to execute
 * @param {Object} params.sheet - Sheet object containing cells
 * @param {string} params.userId - Current user ID
 * @param {string} params.projectId - Current project ID
 * @param {string} params.sheetId - Current sheet ID
 * @param {Array} params.sheets - All sheets array
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<Array>} Array of execution results
 */
export async function runCells({
  cellIds,
  sheet,
  userId,
  projectId,
  sheetId,
  sheets,
  onProgress
}) {
  // Sort cells by dependency order
  const sortedCellIds = topologicalSort(cellIds, sheets);

  const results = [];

  for (const cellId of sortedCellIds) {
    const cell = sheet.cells?.[cellId];
    if (!cell || !cell.prompt) {
      continue;
    }

    const result = await runCell({
      cellId,
      cell,
      userId,
      projectId,
      sheetId,
      sheets,
      currentSheet: sheet,
      onProgress
    });

    results.push(result);

    // If cell has autoRun enabled, check for dependent cells
    // Note: This is handled in App.jsx after cell completion for better state management
    // Keeping this for backward compatibility but App.jsx version is preferred
    if (cell.autoRun && result.success) {
      const dependents = findDependentCells(cellId, sheets);
      for (const dependent of dependents) {
        if (dependent.sheetId === sheetId) {
          const dependentCell = sheet.cells?.[dependent.cellId];
          if (dependentCell && dependentCell.autoRun) {
            // Check if all dependencies are complete before running
            const allDepsComplete = await areAllDependenciesComplete(
              dependentCell,
              sheets,
              sheet,
              null, // getLatestCells not available in this context
              null, // runningCellsSet not available in this context
              userId, // userId for loading cross-sheet cells
              projectId // projectId for loading cross-sheet cells
            );
            
            if (allDepsComplete) {
              // Recursively run dependent cells
              await runCell({
                cellId: dependent.cellId,
                cell: dependentCell,
                userId,
                projectId,
                sheetId,
                sheets,
                currentSheet: sheet,
                onProgress
              });
            }
          }
        }
      }
    }
  }

  return results;
}


/**
 * Format output content based on type
 * 
 * @param {string} output - Output content
 * @param {string} type - Content type
 * @returns {string} Formatted HTML/content
 */
export function formatOutput(output, type, outputFormat = '') {
  // Ensure output is a string (handle null, undefined, or non-string values)
  if (output == null) return '';
  const outputStr = String(output);
  if (!outputStr) return '';

  switch (type) {
    case 'image':
      // Check if it's a URL
      if (outputStr.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i)) {
        return `<img src="${outputStr}" alt="Generated image" class="max-w-full h-auto rounded" />`;
      }
      return outputStr;

    case 'video':
      // Check if it's a URL
      if (outputStr.match(/^https?:\/\/.+\.(mp4|webm|mov)/i)) {
        return `<video src="${outputStr}" controls class="max-w-full h-auto rounded" />`;
      }
      return outputStr;

    case 'audio':
      // Check if it's a URL or base64
      if (outputStr.match(/^https?:\/\/.+\.(mp3|wav|ogg)/i) || outputStr.startsWith('data:audio')) {
        return `<audio src="${outputStr}" controls class="w-full" />`;
      }
      return outputStr;

    case 'text':
    default:
      // Apply output format if specified
      if (outputFormat && type === 'text') {
        switch (outputFormat) {
          case 'markdown':
            // Use a simple markdown parser (or you can use a library like marked)
            return formatMarkdown(outputStr);
          
          case 'json':
            // Try to parse and format JSON, fallback to plain if invalid
            try {
              const parsed = JSON.parse(outputStr);
              return `<pre class="bg-gray-900 p-3 rounded text-xs overflow-x-auto"><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>`;
            } catch (e) {
              // Not valid JSON, treat as plain text
              const escaped = escapeHtml(outputStr);
              return escaped.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br/>').join('');
            }
          
          case 'html':
            // Render as HTML (already escaped by default, but allow HTML if explicitly requested)
            return outputStr;
          
          case 'plain':
            // Plain text with line breaks
            const escaped = escapeHtml(outputStr);
            return escaped.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br/>').join('');
          
          case 'bullet-list':
            // Format as bullet list
            const bulletLines = outputStr.split('\n').filter(line => line.trim());
            return `<ul class="list-disc list-inside space-y-1">${bulletLines.map(line => `<li>${escapeHtml(line.trim())}</li>`).join('')}</ul>`;
          
          case 'numbered-list':
            // Format as numbered list
            const numberedLines = outputStr.split('\n').filter(line => line.trim());
            return `<ol class="list-decimal list-inside space-y-1">${numberedLines.map(line => `<li>${escapeHtml(line.trim())}</li>`).join('')}</ol>`;
          
          case 'code':
            // Format as code block
            return `<pre class="bg-gray-900 p-3 rounded text-xs overflow-x-auto"><code>${escapeHtml(outputStr)}</code></pre>`;
          
          default:
            // Default formatting (plain text with paragraphs)
            const defaultEscaped = escapeHtml(outputStr);
            return defaultEscaped.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br/>').join('');
        }
      }
      
      // Default formatting (plain text with paragraphs)
      const escaped = escapeHtml(outputStr);
      return escaped.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br/>').join('');
  }
}

/**
 * Simple markdown formatter (basic support)
 */
function formatMarkdown(text) {
  let html = escapeHtml(text);
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-900 p-3 rounded text-xs overflow-x-auto"><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-800 px-1 rounded">$1</code>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>');
  
  // Wrap consecutive list items
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    // Check if it's numbered (contains numbers) or bullet
    const isNumbered = /\d+\./.test(match);
    const tag = isNumbered ? 'ol' : 'ul';
    return `<${tag} class="list-${isNumbered ? 'decimal' : 'disc'} list-inside space-y-1">${match}</${tag}>`;
  });
  
  // Line breaks
  html = html.split('\n').map(line => line.trim() ? line : '<br/>').join('\n');
  
  // Wrap paragraphs (lines that aren't already wrapped in tags)
  html = html.split('\n').map(line => {
    if (line.trim() && !line.match(/^<(h[1-6]|ul|ol|pre|p|li)/)) {
      return `<p>${line}</p>`;
    }
    return line;
  }).join('\n');
  
  return html;
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Poll job status for video/image generation
 * Updates cell status and output when job completes
 */
// Global cancellation map for polling
const pollingCancelled = new Map();

export function cancelPolling(cellId) {
  pollingCancelled.set(cellId, true);
}

export function clearPollingCancellation(cellId) {
  pollingCancelled.delete(cellId);
}

export async function pollJobStatus({
  cellId,
  cell,
  jobId,
  userId,
  projectId,
  sheetId,
  onProgress,
  maxAttempts = 120, // 2 minutes max (120 * 1 second)
  attempt = 0
}) {
  // Check if polling was cancelled
  if (pollingCancelled.get(cellId)) {
    console.log(`🛑 Polling cancelled for cell ${cellId}`);
    pollingCancelled.delete(cellId);
    return { success: false, error: 'Polling cancelled', cancelled: true };
  }
  
  if (attempt >= maxAttempts) {
    // Timeout - mark as error
    const errorCell = {
      ...cell,
      status: 'error',
      output: 'Generation timed out. The job may still be processing.'
    };
    await saveCell(userId, projectId, sheetId, cellId, errorCell);
    if (onProgress) onProgress({ status: 'error', cellId, error: 'Generation timed out' });
    return { success: false, error: 'Generation timed out' };
  }

  try {
    const statusResult = await checkJobStatus(jobId, userId);
    
    if (!statusResult.success) {
      // Ensure error is a string, not an object
      const errorMessage = typeof statusResult.error === 'string' 
        ? statusResult.error 
        : (statusResult.error?.message || JSON.stringify(statusResult.error) || 'Failed to check job status');
      throw new Error(errorMessage);
    }

    const { status, videoUrl } = statusResult;

    // Update cell status
    const updatedCell = {
      ...cell,
      status: status
    };

    if (status === 'completed' || status === 'succeeded' || videoUrl) {
      // Job completed - get the video URL
      let output = videoUrl || '';
      
      console.log(`🎬 VIDEO URL RECEIVED for cell ${cellId}:`, {
        status,
        videoUrl,
        output,
        outputType: typeof output,
        outputLength: output?.length
      });
      
      // Upload to Firebase Storage if needed
      // Check if it's a video URL (with or without file extension - OpenAI may return URLs without extensions)
      const hasVideoExtension = output && output.match(/^https?:\/\/.+\.(mp4|webm|mov)/i);
      const isOpenAIVideoUrl = output && (
        (output.includes('openai.com') && (output.includes('video') || output.includes('/videos/'))) ||
        output.includes('cdn.openai.com')
      );
      const isOpenAIContentEndpoint = output && (
        output.includes('api.openai.com') && output.includes('/videos/') && output.includes('/content')
      );
      
      const isVideoUrl = hasVideoExtension || isOpenAIVideoUrl || isOpenAIContentEndpoint;
      
      console.log(`🎬 Video URL check:`, {
        output,
        hasVideoExtension: !!hasVideoExtension,
        isOpenAIVideoUrl: !!isOpenAIVideoUrl,
        isOpenAIContentEndpoint: !!isOpenAIContentEndpoint,
        isVideoUrl
      });
      
      // IMPORTANT: OpenAI video downloads expire after 1 hour, so we MUST download and save immediately
      // If it's an OpenAI content endpoint or any OpenAI video URL, upload to Firebase immediately
      if (isVideoUrl && !output.includes('firebasestorage.googleapis.com')) {
        console.log(`📹 Video generation completed, uploading to Firebase Storage immediately (OpenAI videos expire after 1 hour): ${output}`);
        if (onProgress) onProgress({ status: 'uploading', cellId });
        try {
          const uploadResult = await uploadVideoFromUrl(output, userId, projectId, sheetId, cellId);
          if (uploadResult.success) {
            console.log(`✅ Video uploaded to Firebase Storage: ${uploadResult.url}`);
            output = uploadResult.url;
            console.log(`🎬 FINAL VIDEO URL (after upload): ${output}`);
            
            // Update the cell immediately with the Firebase URL so it's permanent
            updatedCell.output = output;
            await saveCell(userId, projectId, sheetId, cellId, updatedCell);
            if (onProgress) onProgress({ status: 'complete', cellId, output, updatedCell });
            console.log(`✅ Cell updated with permanent Firebase URL`);
          } else {
            console.warn('⚠️ Failed to upload video to Firebase Storage, using original URL:', uploadResult.error);
            console.log(`🎬 Using original video URL: ${output}`);
            // Continue with original URL if upload fails
          }
        } catch (uploadError) {
          console.error('❌ Error uploading video:', uploadError);
          console.error('❌ Upload error details:', uploadError.message, uploadError.stack);
          console.log(`🎬 Using original video URL after error: ${output}`);
          // Continue with original URL if upload fails
        }
      } else {
        console.log(`🎬 Video URL already in Firebase or not a video URL. Final output: ${output}`);
      }

      // Update generation record
      // IMPORTANT: output now contains Firebase URL if upload was successful (from line 1218)
      const generations = cell.generations || [];
      const lastGeneration = generations[generations.length - 1];
      if (lastGeneration && lastGeneration.jobId === jobId) {
        lastGeneration.status = 'completed';
        lastGeneration.output = output; // This is now the Firebase URL if upload succeeded
      }

      updatedCell.output = output; // This is now the Firebase URL if upload succeeded
      updatedCell.status = 'completed';
      updatedCell.generations = generations;

      // Log if we're saving with Firebase URL or original URL
      if (output && output.includes('firebasestorage.googleapis.com')) {
        console.log(`✅ Saving async job result with Firebase URL: ${output.substring(0, 100)}...`);
      } else if (output && (output.includes('openai.com') || output.includes('blob.core.windows.net'))) {
        console.warn(`⚠️ Saving async job result with original URL (auto-upload may have failed): ${output.substring(0, 100)}...`);
      }

      await saveCell(userId, projectId, sheetId, cellId, updatedCell);
      
      if (lastGeneration) {
        await saveGeneration(userId, projectId, sheetId, cellId, lastGeneration);
      }

      console.log(`✅ Video generation completed for cell ${cellId}:`, {
        output,
        outputType: typeof output,
        outputLength: output?.length,
        hasVideoUrl: output && (
          output.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) ||
          output.includes('openai.com') ||
          output.includes('cdn.openai.com') ||
          output.includes('firebasestorage.googleapis.com')
        )
      });
      console.log(`🎬 FINAL VIDEO URL BEING SENT TO UI: ${output}`);
      if (onProgress) onProgress({ status: 'complete', cellId, output, updatedCell });
      return { success: true, output, cellId };
    } else if (status === 'failed' || status === 'error') {
      // Job failed
      updatedCell.status = 'error';
      updatedCell.output = 'Generation failed';
      await saveCell(userId, projectId, sheetId, cellId, updatedCell);
      if (onProgress) onProgress({ status: 'error', cellId, error: 'Generation failed' });
      return { success: false, error: 'Generation failed' };
    } else {
      // Still processing (queued, pending, running, processing, in_progress, etc.) - update status and poll again
      await saveCell(userId, projectId, sheetId, cellId, updatedCell);
      if (onProgress) {
        onProgress({ 
          status: 'polling', 
          cellId, 
          updatedCell,
          currentStatus: status // Pass the actual status from API (queued, pending, running, etc.)
        });
      }
      
      console.log(`🔄 Polling: Cell ${cellId} status is "${status}", continuing to poll...`);
      
      // Poll again after 1 second (only if not cancelled)
      const timeoutId = setTimeout(() => {
        // Check again before polling
        if (!pollingCancelled.get(cellId)) {
          pollJobStatus({
            cellId,
            cell: updatedCell,
            jobId,
            userId,
            projectId,
            sheetId,
            onProgress,
            maxAttempts,
            attempt: attempt + 1
          });
        } else {
          console.log(`🛑 Polling cancelled for cell ${cellId}, stopping poll loop`);
          pollingCancelled.delete(cellId);
        }
      }, 1000);
      
      // Store timeout ID for potential cancellation (if needed)
      // Note: This is a recursive function, so we can't easily track all timeouts
      // The cancellation check above should handle it
      
      return { success: true, status, needsPolling: true };
    }
  } catch (error) {
    console.error(`Error polling job status for ${cellId}:`, error);
    // Ensure error message is always a string
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    const errorCell = {
      ...cell,
      status: 'error',
      output: `Error: ${errorMessage}`
    };
    await saveCell(userId, projectId, sheetId, cellId, errorCell);
    if (onProgress) onProgress({ status: 'error', cellId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

