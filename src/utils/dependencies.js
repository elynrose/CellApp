/**
 * Dependency Parsing and Resolution Utilities
 * Handles cell references like {{A1}}, {{prompt:A1}}, {{Sheet2!A1}}, etc.
 * Also supports conditional logic: {{if:condition}}then:value{{else:value}}
 * 
 * Note: Only valid cell references (like A1, B1, C2) are resolved.
 * Placeholders like {{genre}}, {{topic}} are left as-is.
 */

import { resolveConditionalBlocks, extractConditionDependencies } from './conditions';

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
    // Handle prompt: or output: prefixes
    if (cleanRef.startsWith('prompt:') || cleanRef.startsWith('output:')) {
      cleanRef = cleanRef.split(':')[1];
    } else {
      cleanRef = cleanRef.split(':')[cleanRef.split(':').length - 1];
    }
  }
  if (cleanRef.includes('!')) {
    cleanRef = cleanRef.split('!')[cleanRef.split('!').length - 1];
  }
  // Check if it matches pattern: one or more letters followed by one or more digits
  // Examples: A1, B1, C2, AA1, Z99
  return /^[A-Za-z]+\d+$/.test(cleanRef);
}

/**
 * Parse dependencies from a prompt string
 * Extracts all {{...}} references (excluding conditional syntax)
 * 
 * @param {string} prompt - Prompt string containing cell references
 * @returns {string[]} Array of dependency references
 * 
 * @example
 * parseDependencies('Write a poem about {{A1}}') // Returns ['A1']
 * parseDependencies('{{A1}} and {{B2}}') // Returns ['A1', 'B2']
 * parseDependencies('{{prompt:Sheet2!A1}}') // Returns ['prompt:Sheet2!A1']
 * parseDependencies('{{if:A1=="success"}}then:{{B1}}{{else:{{C1}}}}') // Returns ['A1', 'B1', 'C1']
 */
export function parseDependencies(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return [];
  }

  // Support multiple reference formats:
  // {{A1}} - just the cell output
  // {{prompt:A1}} - the cell's prompt
  // {{output:A1}} - the cell's output (explicit)
  // {{A1-1}} - first generation of cell A1
  // {{A1-2}} - second generation of cell A1
  // {{A1:1-3}} - generations 1 to 3 of cell A1
  // {{A1:2}} - just generation 2 of cell A1
  // {{Sheet2!A1}} - cross-sheet reference
  // {{prompt:Sheet2!A1}} - cross-sheet prompt
  // {{if:condition}}then:value{{else:value}} - conditional blocks (extract cell refs from condition and values)
  
  const deps = [];
  
  // First, extract dependencies from conditional blocks
  const conditionalRegex = /\{\{if:([^}]+)\}\}then:([^{]+?)(?:\{\{else:([^}]+)\}\})?/g;
  let condMatch;
  while ((condMatch = conditionalRegex.exec(prompt)) !== null) {
    const condition = condMatch[1];
    const thenValue = condMatch[2];
    const elseValue = condMatch[3];
    
    // Extract dependencies from condition
    const condDeps = extractConditionDependencies(condition);
    deps.push(...condDeps);
    
    // Extract dependencies from then and else values
    const thenDeps = extractDependenciesFromValue(thenValue);
    const elseDeps = elseValue ? extractDependenciesFromValue(elseValue) : [];
    deps.push(...thenDeps, ...elseDeps);
  }
  
  // Then extract regular dependencies (excluding conditional syntax)
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    const ref = match[1];
    // Skip conditional syntax
    if (!ref.startsWith('if:') && !ref.startsWith('then:') && !ref.startsWith('else:')) {
      deps.push(ref);
    }
  }
  
  // Remove duplicates
  return [...new Set(deps)];
}

/**
 * Extract cell references from a value string
 * @param {string} value - Value string that may contain {{...}} references
 * @returns {string[]} Array of cell references
 */
function extractDependenciesFromValue(value) {
  if (!value || typeof value !== 'string') {
    return [];
  }
  
  const deps = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(value)) !== null) {
    deps.push(match[1]);
  }
  return deps;
}

/**
 * Resolve a cell reference to get its value
 * Supports cross-sheet references, generation-specific references, and type prefixes
 * 
 * @param {string} reference - Cell reference string in various formats
 * @param {Object} context - Context object containing sheets, currentSheet, getCell function
 * @returns {Promise<string>} The resolved cell value
 * 
 * @example
 * await resolveCellReference('A1', context) // Returns cell A1's output
 * await resolveCellReference('prompt:A1', context) // Returns cell A1's prompt
 * await resolveCellReference('A1-1', context) // Returns first generation of A1
 * await resolveCellReference('Sheet2!A1', context) // Returns A1 from Sheet2
 */
export async function resolveCellReference(reference, context) {
  const { sheets, currentSheet, getCell, loadSheetCells, userId, projectId, runningCellsSet, getLatestCells } = context;
  
  // Debug: Log the reference being resolved
  if (reference.includes('!')) {
  }

  try {
    // First, check if this is a valid cell reference format
    // If not, return the original reference (it's likely a placeholder like {{genre}})
    let cellPart = reference;
    let hasTypePrefix = false;
    
    // Check if it has a type prefix (prompt:, output:)
    if (reference.includes(':') && (reference.startsWith('prompt:') || reference.startsWith('output:'))) {
      cellPart = reference.split(':')[1];
      hasTypePrefix = true;
    }
    
    // Extract cell ID from cross-sheet references
    if (cellPart.includes('!')) {
      cellPart = cellPart.split('!')[cellPart.split('!').length - 1];
    }
    
    // Remove generation specs
    if (cellPart.includes('-')) {
      cellPart = cellPart.split('-')[0];
    }
    if (cellPart.includes(':')) {
      cellPart = cellPart.split(':')[0];
    }
    
    // If it's not a valid cell reference, return original (it's a placeholder)
    if (!isValidCellReference(cellPart)) {
      return reference; // Return as-is, it's not a cell reference
    }

    // Parse the reference to determine what to return
    // Order matters: 1) Extract type prefix, 2) Extract sheet name, 3) Extract cell ID, 4) Extract generation spec
    let targetSheet = currentSheet;
    let cellId = reference;
    let returnType = 'output'; // default to output (for same-sheet references)
    let generationSpec = null; // for generation-specific references
    let isCrossSheetRef = false; // Track if this is a cross-sheet reference

    // Step 1: Check for explicit type specification (prompt: or output:)
    let remainingRef = reference;
    if (reference.includes(':') && (reference.startsWith('prompt:') || reference.startsWith('output:'))) {
      const colonIndex = reference.indexOf(':');
      returnType = reference.substring(0, colonIndex);
      remainingRef = reference.substring(colonIndex + 1);
    }

    // Step 2: Check if it's a cross-sheet reference (SheetName!CellId)
    if (remainingRef.includes('!')) {
      isCrossSheetRef = true;
      // For cross-sheet references, default to prompt (textarea value) unless explicitly specified
      // Check if user explicitly specified output: or prompt: prefix
      const hasExplicitType = reference.startsWith('prompt:') || reference.startsWith('output:');
      if (!hasExplicitType) {
        // No explicit type specified - default to prompt for cross-sheet references
        returnType = 'prompt';
      }
      const exclamationIndex = remainingRef.indexOf('!');
      const sheetName = remainingRef.substring(0, exclamationIndex);
      const cellRef = remainingRef.substring(exclamationIndex + 1);

      // Find the sheet by name (case-insensitive match)
      targetSheet = sheets.find(sheet => sheet.name === sheetName || sheet.name?.toLowerCase() === sheetName?.toLowerCase());
      if (!targetSheet) {
        console.warn(`❌ Cross-sheet reference failed: Sheet "${sheetName}" not found. Available sheets:`, sheets.map(s => s.name));
        return `[Sheet "${sheetName}" not found]`;
      }
      console.log(`✅ Found target sheet "${sheetName}" (ID: ${targetSheet.id}) for cross-sheet reference`);

      // Ensure cells are loaded for the target sheet (for cross-sheet references)
      if (!targetSheet.cells || Object.keys(targetSheet.cells).length === 0) {
        console.log(`📥 Loading cells for cross-sheet reference: sheet "${sheetName}" (ID: ${targetSheet.id})`);
        if (loadSheetCells) {
          await loadSheetCells(targetSheet.id);
          // Refresh targetSheet reference after loading to get updated cells
          targetSheet = sheets.find(sheet => sheet.id === targetSheet.id);
          if (targetSheet && targetSheet.cells) {
            console.log(`✅ Loaded ${Object.keys(targetSheet.cells).length} cells for sheet "${sheetName}"`);
          } else {
            console.warn(`⚠️ Cells not loaded for sheet "${sheetName}" after loadSheetCells call`);
          }
        } else {
          console.warn(`⚠️ loadSheetCells function not provided in context`);
        }
      } else {
        console.log(`✅ Cells already loaded for sheet "${sheetName}" (${Object.keys(targetSheet.cells).length} cells)`);
      }

      cellId = cellRef;
    } else {
      cellId = remainingRef;
    }

    // Step 3: Check for generation-specific references (A1-1, A1:1-3, A1:2)
    if (cellId.includes('-') || cellId.includes(':')) {
      // Handle generation references like A1-1, A1:1-3, A1:2
      if (cellId.includes('-') && !cellId.includes(':')) {
        // Format: A1-1 (single generation)
        const parts = cellId.split('-');
        if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
          cellId = parts[0];
          generationSpec = { type: 'single', index: parseInt(parts[1]) - 1 }; // Convert to 0-based index
        }
      } else if (cellId.includes(':')) {
        // Format: A1:1-3 or A1:2
        const parts = cellId.split(':');
        if (parts.length === 2) {
          const genPart = parts[1];
          if (genPart.includes('-')) {
            // Format: A1:1-3 (range)
            const [start, end] = genPart.split('-').map(n => parseInt(n) - 1); // Convert to 0-based
            if (!isNaN(start) && !isNaN(end)) {
              cellId = parts[0];
              generationSpec = { type: 'range', start, end };
            }
          } else {
            // Format: A1:2 (single generation)
            const genIndex = parseInt(genPart);
            if (!isNaN(genIndex)) {
              cellId = parts[0];
              generationSpec = { type: 'single', index: genIndex - 1 }; // Convert to 0-based
            }
          }
        }
      }
    }

    // Get the cell from the target sheet
    // For cross-sheet references, refresh the sheet reference to ensure we have the latest cells
    if (targetSheet.id !== currentSheet.id) {
      const refreshedSheet = sheets.find(s => s.id === targetSheet.id);
      if (refreshedSheet) {
        targetSheet = refreshedSheet;
      }
    }
    
    let cell;
    if (getCell) {
      cell = await getCell(targetSheet.id, cellId);
      // If getCell returns null but cells exist in targetSheet, try direct access
      if (!cell && targetSheet.cells && targetSheet.cells[cellId]) {
        cell = targetSheet.cells[cellId];
      }
    } else {
      // Fallback: get from sheet.cells object
      cell = targetSheet.cells?.[cellId];
    }

    if (!cell) {
      // Only log error if it's a valid cell reference format
      if (isValidCellReference(cellId)) {
        const sheetInfo = targetSheet.id !== currentSheet.id ? ` in sheet "${targetSheet.name}"` : '';
        const message = `Cell "${cellId}"${sheetInfo} not found`;
        console.warn(`❌ ${message}`);
        alert(message);
        return '';
      } else {
        // Not a valid cell reference, return original (it's a placeholder)
        return reference;
      }
    }

    // NOTE: We do not wait for running cells here — we use whatever value is available
    // (even if empty) to avoid blocking and to keep execution responsive.
    
    // Also verify cell has output after waiting
    // If it still doesn't have output after the dependency finished, wait a bit more for state to propagate
    const hasOutput = cell.output && 
                     cell.output.trim() !== '' && 
                     !cell.output.includes('No generations yet') &&
                     !cell.output.includes('ERROR') &&
                     !cell.output.includes('[ERROR');
    
    let generations = cell.generations || [];
    const latestGeneration = generations.length > 0 ? generations[generations.length - 1] : null;
    const hasCompletedGeneration = latestGeneration && latestGeneration.status === 'completed';
    
    // NOTE: Removed waiting logic - cells just use whatever value is available

    // Load generations from Firestore if needed (for generation-specific references)
    if (generationSpec && (!generations || generations.length === 0)) {
      // Try to load generations from Firestore
      try {
        const { getGenerations } = await import('../firebase/firestore');
        // We need userId, projectId, sheetId from context - try to get them
        if (userId && projectId) {
          const genResult = await getGenerations(userId, projectId, targetSheet.id, cellId);
          if (genResult.success && genResult.generations) {
            // Sort by timestamp descending (newest first) to match expected indexing
            generations = genResult.generations.sort((a, b) => {
              const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || a.createdAt || 0);
              const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || b.createdAt || 0);
              return timeB - timeA; // Newest first
            });
            // Update cell object with loaded generations for future use
            cell.generations = generations;
          }
        }
      } catch (error) {
      }
    }

    // Return the requested value
    let result;

    // Handle generation-specific references
    if (generationSpec) {
      if (!generations || generations.length === 0) {
        result = `[ERROR: Cell ${cellId} has no generations]`;
      } else {
        // Generations are sorted newest first (from Firestore orderBy timestamp desc)
        // User references use 1-based indexing where 1 = oldest generation
        // So A1-1 = first/oldest, A1-2 = second, etc.
        // We need to reverse the index: oldest is at the end of the array
        
        if (generationSpec.type === 'single') {
          // Single generation reference (A1-1, A1:2)
          // userIndex is 0-based from parsing (A1-1 -> index 0, meaning first generation = oldest)
          // Array is newest first, so oldest is at index (length - 1)
          const userIndex = generationSpec.index; // 0-based, where 0 = first generation (oldest)
          const arrayIndex = generations.length - 1 - userIndex; // Reverse: oldest is at end
          
          if (arrayIndex >= 0 && arrayIndex < generations.length) {
            result = generations[arrayIndex].output || '';
          } else {
            result = `[ERROR: Cell ${cellId} generation ${userIndex + 1} not found (has ${generations.length} generations)]`;
          }
        } else if (generationSpec.type === 'range') {
          // Range generation reference (A1:1-3)
          // start and end are 0-based from parsing (1-3 -> start=0, end=2)
          // These represent the oldest generations, so we need to reverse
          const { start, end } = generationSpec;
          const arrayStart = generations.length - 1 - end; // End becomes start (oldest)
          const arrayEnd = generations.length - 1 - start; // Start becomes end
          
          if (arrayStart >= 0 && arrayEnd < generations.length && arrayStart <= arrayEnd) {
            // Slice and reverse to get chronological order (oldest to newest)
            const generationsSlice = generations.slice(arrayStart, arrayEnd + 1).reverse();
            result = generationsSlice.map(gen => gen.output || '').join('\n\n---\n\n');
          } else {
            result = `[ERROR: Cell ${cellId} generation range ${start + 1}-${end + 1} not found (has ${generations.length} generations)]`;
          }
        }
      }
    } else if (returnType === 'prompt') {
      result = cell.prompt || '';
      // Check if prompt is empty and show alert
      if (!result || result.trim() === '') {
        const sheetInfo = targetSheet.id !== currentSheet.id ? ` in sheet "${targetSheet.name}"` : '';
        const message = `Cell ${cellId}${sheetInfo} has no prompt text available`;
        console.warn(`⚠️ ${message}`);
        alert(message);
        result = '';
      }
    } else {
      // For output, if there's no output but there's a prompt, return the prompt content
      const outputText = cell.output || '';
      const isPlaceholderText = !outputText ||
        outputText.trim() === '' ||
        outputText === 'No generations yet' ||
        outputText.includes('📝 No generations yet') ||
        (outputText.includes('No generations yet') && outputText.includes('Run'));

      if (isPlaceholderText) {
        if (cell.prompt && cell.prompt.trim() !== '') {
          result = cell.prompt;
        } else {
          // Cell is completely empty - show alert
          const sheetInfo = targetSheet.id !== currentSheet.id ? ` in sheet "${targetSheet.name}"` : '';
          const message = `Cell ${cellId}${sheetInfo} has no output or prompt available`;
          console.warn(`⚠️ ${message}`);
          alert(message);
          result = '';
        }
      } else {
        // Check if output contains an image (either as HTML img tag or direct URL)
        // Extract image URL if present, otherwise strip HTML and return text
        const imgUrlMatch = outputText.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        if (imgUrlMatch && imgUrlMatch[1]) {
          // Return the image URL directly so dependent cells can use it
          result = imgUrlMatch[1];
        } else if (outputText.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)/i)) {
          // Direct image URL (not wrapped in HTML)
          result = outputText.trim();
        } else {
          // Strip any HTML tags if present and return text content
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = outputText;
          result = tempDiv.textContent || tempDiv.innerText || outputText;
        }
      }
    }

    return result || '';
  } catch (error) {
    return `[ERROR: ${error.message}]`;
  }
}

/**
 * Resolve all dependencies in a prompt string
 * Replaces all {{...}} references with their actual values
 * Also handles conditional blocks: {{if:condition}}then:value{{else:value}}
 * 
 * @param {string} prompt - Prompt string with cell references and conditionals
 * @param {Object} context - Context object for resolving references
 * @returns {Promise<string>} Prompt with all references and conditionals resolved
 */
export async function resolveDependencies(prompt, context) {
  if (!prompt || typeof prompt !== 'string') {
    return prompt;
  }

  // First, resolve conditional blocks (they may contain cell references)
  // Create a resolveValue function for condition evaluation
  const resolveValue = async (ref) => {
    // If it's a cell reference, resolve it
    if (isValidCellReference(ref)) {
      return await resolveCellReference(ref, context);
    }
    // Otherwise return as-is (it's a literal value)
    return ref;
  };

  // Resolve conditionals first
  let resolvedPrompt = await resolveConditionalBlocks(prompt, resolveValue);

  // Then resolve remaining dependencies
  const dependencies = parseDependencies(resolvedPrompt);
  if (dependencies.length === 0) {
    return resolvedPrompt;
  }

  // Resolve each dependency
  for (const dep of dependencies) {
    const resolved = await resolveCellReference(dep, context);
    // Escape special regex characters in the dependency string
    const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Create regex that matches the full {{...}} tag
    const regex = new RegExp(`\\{\\{${escapedDep}\\}\\}`, 'g');
    // Replace ALL occurrences of the tag with the resolved value
    resolvedPrompt = resolvedPrompt.replace(regex, resolved);
  }

  // Final check: ensure no unresolved tags remain (they should all be replaced)
  // If any {{...}} tags remain, they weren't valid cell references and should be removed
  // But preserve conditional syntax that might not have been fully processed
  const remainingTags = resolvedPrompt.match(/\{\{[^}]+(?<!if:)(?<!then:)(?<!else:)\}\}/g);
  if (remainingTags && remainingTags.length > 0) {
    // Filter out conditional syntax
    const nonConditionalTags = remainingTags.filter(tag => 
      !tag.includes('if:') && !tag.includes('then:') && !tag.includes('else:')
    );
    if (nonConditionalTags.length > 0) {
      // Remove only non-conditional unresolved tags
      nonConditionalTags.forEach(tag => {
        resolvedPrompt = resolvedPrompt.replace(tag, '');
      });
    }
  }

  return resolvedPrompt;
}

/**
 * Find all cells that depend on a given cell
 * 
 * @param {string} cellId - Cell ID to find dependents for
 * @param {Object} sheets - Array of all sheets
 * @returns {Array<{sheetId: string, cellId: string}>} Array of dependent cells
 */
export function findDependentCells(cellId, sheets) {
  const dependents = [];

  for (const sheet of sheets) {
    if (!sheet.cells) continue;

    for (const [otherCellId, otherCell] of Object.entries(sheet.cells)) {
      if (!otherCell.prompt) continue;

      const deps = parseDependencies(otherCell.prompt);
      
      // Check for direct reference
      if (deps.some(dep => {
        // Extract cell ID from dependency (handle formats like "prompt:A1", "Sheet2!A1", etc.)
        let ref = dep;
        if (ref.includes(':')) {
          ref = ref.split(':')[1];
        }
        if (ref.includes('!')) {
          ref = ref.split('!')[1];
        }
        // Handle generation specs
        if (ref.includes('-')) {
          ref = ref.split('-')[0];
        }
        if (ref.includes(':')) {
          ref = ref.split(':')[0];
        }
        return ref === cellId;
      })) {
        dependents.push({ sheetId: sheet.id, cellId: otherCellId, sheetName: sheet.name });
      }
    }
  }

  return dependents;
}

/**
 * Check for circular dependencies
 * 
 * @param {string} cellId - Starting cell ID
 * @param {Object} sheets - Array of all sheets
 * @param {Set<string>} visited - Set of visited cells (for recursion)
 * @returns {boolean} True if circular dependency detected
 */
export function hasCircularDependency(cellId, sheets, visited = new Set()) {
  if (visited.has(cellId)) {
    return true; // Circular dependency detected
  }

  visited.add(cellId);

  // Find the cell
  let cell = null;
  let sheet = null;
  for (const s of sheets) {
    if (s.cells?.[cellId]) {
      cell = s.cells[cellId];
      sheet = s;
      break;
    }
  }

  if (!cell || !cell.prompt) {
    visited.delete(cellId);
    return false;
  }

  const deps = parseDependencies(cell.prompt);
  for (const dep of deps) {
    // Extract cell ID from dependency
    let ref = dep;
    if (ref.includes(':')) {
      ref = ref.split(':')[1];
    }
    if (ref.includes('!')) {
      // Cross-sheet reference - skip for now (could be enhanced)
      continue;
    }
    if (ref.includes('-')) {
      ref = ref.split('-')[0];
    }
    if (ref.includes(':')) {
      ref = ref.split(':')[0];
    }

    if (hasCircularDependency(ref, sheets, visited)) {
      return true;
    }
  }

  visited.delete(cellId);
  return false;
}

/**
 * Topological sort for dependency execution order
 * 
 * @param {Array<string>} cellIds - Array of cell IDs to sort
 * @param {Object} sheets - Array of all sheets
 * @returns {Array<string>} Sorted cell IDs in execution order
 */
export function topologicalSort(cellIds, sheets) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(cellId) {
    if (visiting.has(cellId)) {
      return;
    }
    if (visited.has(cellId)) {
      return;
    }

    visiting.add(cellId);

    // Find the cell
    let cell = null;
    for (const sheet of sheets) {
      if (sheet.cells?.[cellId]) {
        cell = sheet.cells[cellId];
        break;
      }
    }

    if (cell && cell.prompt) {
      const deps = parseDependencies(cell.prompt);
      for (const dep of deps) {
        // Extract cell ID from dependency
        let ref = dep;
        if (ref.includes(':')) {
          ref = ref.split(':')[1];
        }
        if (ref.includes('!')) {
          // Cross-sheet reference - skip for now
          continue;
        }
        if (ref.includes('-')) {
          ref = ref.split('-')[0];
        }
        if (ref.includes(':')) {
          ref = ref.split(':')[0];
        }

        if (cellIds.includes(ref)) {
          visit(ref);
        }
      }
    }

    visiting.delete(cellId);
    visited.add(cellId);
    sorted.push(cellId);
  }

  for (const cellId of cellIds) {
    if (!visited.has(cellId)) {
      visit(cellId);
    }
  }

  return sorted;
}


