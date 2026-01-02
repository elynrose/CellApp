/**
 * Connection Utilities
 * Generates connection lines based on cell dependencies
 */

import { parseDependencies } from './dependencies';

/**
 * Extract cell ID from a dependency reference
 * Handles formats like: "A1", "prompt:A1", "output:A1", "Sheet2!A1", "A1-1", "A1:1-3"
 */
function extractCellIdFromReference(ref) {
  if (!ref) return null;

  // Remove type prefix (prompt:, output:)
  let remaining = ref;
  if (ref.includes(':') && (ref.startsWith('prompt:') || ref.startsWith('output:'))) {
    remaining = ref.substring(ref.indexOf(':') + 1);
  }

  // Remove cross-sheet prefix (Sheet2!)
  if (remaining.includes('!')) {
    remaining = remaining.substring(remaining.indexOf('!') + 1);
  }

  // Remove generation spec (-1, :1-3, :2)
  if (remaining.includes('-')) {
    const dashIndex = remaining.indexOf('-');
    // Check if it's a generation spec (number after dash)
    const afterDash = remaining.substring(dashIndex + 1);
    if (!isNaN(parseInt(afterDash))) {
      remaining = remaining.substring(0, dashIndex);
    }
  }
  if (remaining.includes(':')) {
    const colonIndex = remaining.indexOf(':');
    const afterColon = remaining.substring(colonIndex + 1);
    // Check if it's a generation spec (number or range)
    if (!isNaN(parseInt(afterColon)) || afterColon.includes('-')) {
      remaining = remaining.substring(0, colonIndex);
    }
  }

  return remaining.trim() || null;
}

/**
 * Generate connections from cell dependencies
 * 
 * @param {Array} cells - Array of cell objects
 * @returns {Array} Array of connection objects { source_cell_id, target_cell_id }
 */
export function generateConnectionsFromDependencies(cells) {
  const connections = [];
  const cellIds = new Set(cells.map(c => c.cell_id));

  cells.forEach(cell => {
    if (!cell.prompt) return;

    // Parse dependencies from the prompt
    const dependencies = parseDependencies(cell.prompt);

    dependencies.forEach(dep => {
      // Extract the cell ID from the dependency reference
      const sourceCellId = extractCellIdFromReference(dep);

      if (sourceCellId && cellIds.has(sourceCellId)) {
        // Create connection: sourceCellId -> cell.cell_id
        // This means cell.cell_id depends on sourceCellId
        connections.push({
          source_cell_id: sourceCellId,
          target_cell_id: cell.cell_id
        });
      }
    });
  });

  // Remove duplicates
  const uniqueConnections = [];
  const seen = new Set();
  connections.forEach(conn => {
    const key = `${conn.source_cell_id}-${conn.target_cell_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueConnections.push(conn);
    }
  });

  return uniqueConnections;
}

/**
 * Merge manual connections with dependency-based connections
 * 
 * @param {Array} manualConnections - Manually created connections
 * @param {Array} dependencyConnections - Connections from dependencies
 * @returns {Array} Merged connections
 */
export function mergeConnections(manualConnections = [], dependencyConnections = []) {
  const allConnections = [...manualConnections, ...dependencyConnections];
  const unique = [];
  const seen = new Set();

  allConnections.forEach(conn => {
    const key = `${conn.source_cell_id}-${conn.target_cell_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(conn);
    }
  });

  return unique;
}


