/**
 * Conditional Logic System
 * Handles if/else/then conditions in cell prompts
 * 
 * Syntax:
 * {{if:condition}}then:value{{else:value}}
 * 
 * Examples:
 * {{if:A1=="success"}}then:{{B1}}{{else:{{C1}}}}
 * {{if:A1>10}}then:{{B1}}{{else:{{C1}}}}
 * {{if:A1 contains "error"}}then:{{B1}}{{else:{{C1}}}}
 */

/**
 * Parse a condition string into components
 * @param {string} condition - Condition string like "A1==10" or "A1 contains 'error'"
 * @returns {Object} Parsed condition { left, operator, right }
 */
export function parseCondition(condition) {
  if (!condition || typeof condition !== 'string') {
    return null;
  }

  // Remove whitespace
  condition = condition.trim();

  // Supported operators (in order of specificity)
  const operators = [
    { op: '!=', name: 'notEquals' },
    { op: '==', name: 'equals' },
    { op: '>=', name: 'greaterThanOrEqual' },
    { op: '<=', name: 'lessThanOrEqual' },
    { op: '>', name: 'greaterThan' },
    { op: '<', name: 'lessThan' },
    { op: ' contains ', name: 'contains' },
    { op: ' startsWith ', name: 'startsWith' },
    { op: ' endsWith ', name: 'endsWith' },
    { op: '=', name: 'equals' } // Fallback for single =
  ];

  for (const { op, name } of operators) {
    const index = condition.indexOf(op);
    if (index !== -1) {
      const left = condition.substring(0, index).trim();
      const right = condition.substring(index + op.length).trim();
      
      // Remove quotes from right side if present
      let rightValue = right;
      if ((right.startsWith('"') && right.endsWith('"')) || 
          (right.startsWith("'") && right.endsWith("'"))) {
        rightValue = right.slice(1, -1);
      }

      return {
        left: left.trim(),
        operator: name,
        right: rightValue,
        original: condition
      };
    }
  }

  // If no operator found, treat as truthy check
  return {
    left: condition,
    operator: 'truthy',
    right: null,
    original: condition
  };
}

/**
 * Evaluate a condition
 * @param {Object} condition - Parsed condition object
 * @param {Function} resolveValue - Function to resolve cell references (e.g., "A1" -> actual value)
 * @returns {Promise<boolean>} True if condition is met
 */
export async function evaluateCondition(condition, resolveValue) {
  if (!condition) return false;

  try {
    // Resolve left side (could be a cell reference or literal)
    let leftValue = await resolveValue(condition.left);
    
    // For truthy check, just return if left value is truthy
    if (condition.operator === 'truthy') {
      return !!leftValue && leftValue !== '' && leftValue !== 'null' && leftValue !== 'undefined';
    }

    // Resolve right side (could be a cell reference or literal)
    let rightValue = condition.right;
    if (rightValue && isValidCellReference(rightValue)) {
      rightValue = await resolveValue(rightValue);
    }

    // Convert to appropriate types for comparison
    const left = convertToComparable(leftValue);
    const right = convertToComparable(rightValue);

    // Evaluate based on operator
    switch (condition.operator) {
      case 'equals':
        return left == right; // Use == for type coercion
      
      case 'notEquals':
        return left != right;
      
      case 'greaterThan':
        return Number(left) > Number(right);
      
      case 'lessThan':
        return Number(left) < Number(right);
      
      case 'greaterThanOrEqual':
        return Number(left) >= Number(right);
      
      case 'lessThanOrEqual':
        return Number(left) <= Number(right);
      
      case 'contains':
        return String(left).toLowerCase().includes(String(right).toLowerCase());
      
      case 'startsWith':
        return String(left).toLowerCase().startsWith(String(right).toLowerCase());
      
      case 'endsWith':
        return String(left).toLowerCase().endsWith(String(right).toLowerCase());
      
      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Convert a value to a comparable type
 */
function convertToComparable(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  return String(value);
}

/**
 * Check if a string looks like a cell reference
 */
function isValidCellReference(ref) {
  if (!ref || typeof ref !== 'string') return false;
  // Remove any prefixes
  let cleanRef = ref.trim();
  if (cleanRef.includes('!')) {
    cleanRef = cleanRef.split('!')[cleanRef.split('!').length - 1];
  }
  if (cleanRef.includes(':')) {
    cleanRef = cleanRef.split(':')[cleanRef.split(':').length - 1];
  }
  return /^[A-Za-z]+\d+$/.test(cleanRef);
}

/**
 * Parse if/else/then blocks from a string
 * @param {string} text - Text containing conditional blocks
 * @returns {Array} Array of parsed conditional blocks
 */
export function parseConditionalBlocks(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const blocks = [];
  // Pattern: {{if:condition}}then:value{{else:value}}
  // Also supports: {{if:condition}}then:value (without else)
  const regex = /\{\{if:([^}]+)\}\}then:([^{]+?)(?:\{\{else:([^}]+)\}\})?/g;
  
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before this block
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }

    // Add conditional block
    blocks.push({
      type: 'conditional',
      condition: match[1].trim(),
      thenValue: match[2].trim(),
      elseValue: match[3] ? match[3].trim() : null,
      fullMatch: match[0]
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    blocks.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: text }];
}

/**
 * Resolve conditional blocks in a string
 * @param {string} text - Text containing conditional blocks
 * @param {Function} resolveValue - Function to resolve cell references
 * @returns {Promise<string>} Resolved text with conditions evaluated
 */
export async function resolveConditionalBlocks(text, resolveValue) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  const blocks = parseConditionalBlocks(text);
  const resolvedParts = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      resolvedParts.push(block.content);
    } else if (block.type === 'conditional') {
      const condition = parseCondition(block.condition);
      if (condition) {
        const conditionMet = await evaluateCondition(condition, resolveValue);
        const selectedValue = conditionMet ? block.thenValue : (block.elseValue || '');
        
        // Resolve any cell references in the selected value
        if (selectedValue) {
          // Check if it's a cell reference
          if (selectedValue.match(/^\{\{[^}]+\}\}$/)) {
            // It's a cell reference, resolve it
            const ref = selectedValue.slice(2, -2); // Remove {{ and }}
            const resolved = await resolveValue(ref);
            resolvedParts.push(resolved || '');
          } else {
            // It's literal text or contains references
            let resolved = selectedValue;
            // Resolve any {{...}} references in the value
            const refRegex = /\{\{([^}]+)\}\}/g;
            let refMatch;
            while ((refMatch = refRegex.exec(selectedValue)) !== null) {
              const ref = refMatch[1];
              const resolvedRef = await resolveValue(ref);
              resolved = resolved.replace(refMatch[0], resolvedRef || '');
            }
            resolvedParts.push(resolved);
          }
        }
      } else {
        // Condition parsing failed, use else value or empty
        resolvedParts.push(block.elseValue || '');
      }
    }
  }

  return resolvedParts.join('');
}

/**
 * Extract all cell references from a condition
 * @param {string} condition - Condition string
 * @returns {Array} Array of cell references found in the condition
 */
export function extractConditionDependencies(condition) {
  if (!condition || typeof condition !== 'string') {
    return [];
  }

  const deps = [];
  const parsed = parseCondition(condition);
  
  if (parsed) {
    // Check left side
    if (isValidCellReference(parsed.left)) {
      deps.push(parsed.left);
    }
    
    // Check right side
    if (parsed.right && isValidCellReference(parsed.right)) {
      deps.push(parsed.right);
    }
  }

  return deps;
}

/**
 * Check if a cell should execute based on its condition
 * @param {Object} cell - Cell object that may have a condition property
 * @param {Function} resolveValue - Function to resolve cell references
 * @returns {Promise<boolean>} True if cell should execute
 */
export async function shouldCellExecute(cell, resolveValue) {
  if (!cell) return true;
  
  // Check if cell has a condition property
  if (cell.condition && typeof cell.condition === 'string') {
    const condition = parseCondition(cell.condition);
    if (condition) {
      const shouldRun = await evaluateCondition(condition, resolveValue);
      return shouldRun;
    }
  }
  
  // Check if prompt contains conditional execution syntax: {{if:condition}}run{{else:skip}}
  if (cell.prompt && typeof cell.prompt === 'string') {
    const execRegex = /\{\{if:([^}]+)\}\}run(?:\{\{else:skip\}\})?/i;
    const match = cell.prompt.match(execRegex);
    if (match) {
      const condition = parseCondition(match[1]);
      if (condition) {
        const shouldRun = await evaluateCondition(condition, resolveValue);
        return shouldRun;
      }
    }
  }
  
  // Default: execute
  return true;
}

