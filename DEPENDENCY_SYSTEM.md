# Dependency System Explanation

## How the System Prevents Running Cells Before Dependencies Are Ready

The dependency system ensures that cells only execute when **all** their dependencies have completed successfully. This prevents errors, ensures data consistency, and maintains proper execution order.

---

## The Dependency Check Process

### Step 1: Parse Dependencies from Prompt

When a cell is about to run, the system first extracts all dependencies from the cell's prompt:

```javascript
// Example prompt: "Write a summary of {{A1}} and {{B2}}"
// Dependencies found: ['A1', 'B2']
const dependencies = parseDependencies(cell.prompt);
```

**Supported formats:**
- `{{A1}}` - Cell output
- `{{prompt:A1}}` - Cell's prompt text
- `{{A1-1}}` - First generation of A1
- `{{Sheet2!A1}}` - Cross-sheet reference
- `{{A1:1-3}}` - Generations 1-3 of A1

### Step 2: Check Each Dependency

For each dependency, the system performs multiple checks:

#### Check 1: Does the Dependency Cell Exist?
```javascript
if (!depCell) {
  return false; // Cell doesn't exist - can't run
}
```

**Example:**
- Cell B2 references `{{A1}}`
- If A1 doesn't exist → B2 **cannot run**

#### Check 2: Is the Dependency Currently Running?
```javascript
if (runningCellsSet && runningCellsSet.has(ref)) {
  return false; // Dependency is still running - must wait
}
```

**Example:**
- Cell B2 references `{{A1}}`
- A1 is currently generating → B2 **waits** until A1 finishes
- This prevents using incomplete/partial data

#### Check 3: Does the Dependency Have Completed Output?
```javascript
// Check generation status
const hasCompletedGeneration = latestGeneration && 
                               latestGeneration.status === 'completed';

// Check for valid output
const hasOutput = depCell.output && 
                  depCell.output.trim() !== '' && 
                  !depCell.output.includes('No generations yet') &&
                  !depCell.output.includes('ERROR');

const isComplete = hasCompletedGeneration || hasOutput;
```

**Example:**
- Cell B2 references `{{A1}}`
- A1 exists but has no output → B2 **waits**
- A1 has output → B2 **can proceed**

### Step 3: Wait for All Dependencies

The `waitForDependencies` function polls until **ALL** dependencies are ready:

```javascript
async function waitForDependencies(cell, sheets, currentSheet, getLatestCells, runningCellsSet) {
  while (!areAllDependenciesComplete(cell, sheets, currentSheet, getLatestCells, runningCellsSet)) {
    // Check every 100ms
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Timeout after 5 minutes to prevent infinite waiting
    if (elapsed > maxWaitTime) {
      throw new Error('Timeout waiting for dependencies');
    }
  }
}
```

**What this means:**
- The cell **blocks** until all dependencies are complete
- Checks every 100ms (very responsive)
- Times out after 5 minutes (prevents infinite loops)
- Uses latest cell state (via `getLatestCells`) to see updates immediately

---

## Real-World Examples

### Example 1: Simple Dependency Chain

```
Cell A1: "Generate a topic"
Cell B1: "Write about {{A1}}"
```

**Execution Flow:**
1. User runs B1
2. System checks: Does A1 have output? → **No**
3. System **waits** (polls every 100ms)
4. User runs A1 → A1 generates output
5. System detects A1 has output → B1 **can now run**
6. B1 executes with A1's output in the prompt

### Example 2: Multiple Dependencies

```
Cell A1: "Generate a topic"
Cell B1: "Generate a subtitle"
Cell C1: "Write about {{A1}} with subtitle {{B1}}"
```

**Execution Flow:**
1. User runs C1
2. System checks:
   - Does A1 have output? → **No** → **WAIT**
   - Does B1 have output? → **No** → **WAIT**
3. System **waits** until **BOTH** A1 and B1 are complete
4. Once both are ready → C1 runs

### Example 3: Dependency Chain

```
Cell A1: "Generate a topic"
Cell B1: "Expand on {{A1}}"
Cell C1: "Summarize {{B1}}"
```

**Execution Flow:**
1. User runs C1
2. System checks: Does B1 have output? → **No** → **WAIT**
3. System checks B1's dependency: Does A1 have output? → **No** → **WAIT**
4. User runs A1 → A1 completes
5. B1 can now run (A1 is ready) → B1 completes
6. C1 can now run (B1 is ready) → C1 completes

**Note:** The system automatically handles chains - you don't need to run A1 and B1 manually if C1 has autorun enabled.

### Example 4: Currently Running Dependency

```
Cell A1: "Generate a topic" (currently running)
Cell B1: "Write about {{A1}}"
```

**Execution Flow:**
1. User runs B1 while A1 is still generating
2. System checks: Is A1 running? → **Yes** → **WAIT**
3. System **waits** until A1 finishes
4. A1 completes → B1 **can now run**

---

## Autorun Dependency Handling

When a cell completes and has `autoRun` enabled, the system:

1. **Finds all dependent cells** that reference the completed cell
2. **Filters to only autorun cells** (cells with `autoRun: true`)
3. **Checks if each dependent's dependencies are complete** using the same robust function
4. **Only runs dependents** when ALL their dependencies are ready

**Example:**
```
Cell A1: autoRun: true, prompt: "Generate a topic"
Cell B1: autoRun: true, prompt: "Write about {{A1}}"
Cell C1: autoRun: true, prompt: "Summarize {{B1}}"
```

**Flow:**
1. A1 runs and completes
2. System finds B1 depends on A1 → Checks if B1 can run → **Yes** (A1 is ready)
3. B1 runs and completes
4. System finds C1 depends on B1 → Checks if C1 can run → **Yes** (B1 is ready)
5. C1 runs automatically

---

## Key Safety Features

### 1. **Prevents Race Conditions**
- Checks if dependencies are running before proceeding
- Uses `runningCellsSet` to track active executions
- Ensures no cell uses partial/incomplete data

### 2. **Uses Latest State**
- `getLatestCells()` function provides real-time cell state
- Updates are visible immediately (no stale data)
- Critical for autorun chains where cells update rapidly

### 3. **Validates Cell References**
- Only processes valid cell references (A1, B2, etc.)
- Ignores literal words like `{{genre}}` in prompts
- Prevents false dependency errors

### 4. **Handles Complex References**
- Cross-sheet: `{{Sheet2!A1}}`
- Generation-specific: `{{A1-1}}`, `{{A1:1-3}}`
- Type-specific: `{{prompt:A1}}`, `{{output:A1}}`

### 5. **Timeout Protection**
- Maximum wait time: 5 minutes
- Prevents infinite loops
- Provides error message showing which dependencies are blocking

---

## The Complete Flow

```
User triggers cell execution
         ↓
Parse dependencies from prompt
         ↓
For each dependency:
  ├─ Does it exist? → No → WAIT
  ├─ Is it running? → Yes → WAIT
  └─ Does it have output? → No → WAIT
         ↓
All dependencies ready?
  ├─ No → Poll every 100ms, check again
  └─ Yes → Execute cell
         ↓
Cell completes
         ↓
If autorun enabled:
  ├─ Find dependent cells
  ├─ Filter to autorun cells
  ├─ Check their dependencies
  └─ Run if ready
```

---

## Why This Matters

### Without Dependency Checking:
- ❌ Cells might run with empty/undefined values
- ❌ Cells might use data from cells that are still generating
- ❌ Errors like "Cannot read property of undefined"
- ❌ Inconsistent results

### With Dependency Checking:
- ✅ Cells always have valid data
- ✅ Execution order is guaranteed
- ✅ No race conditions
- ✅ Reliable autorun chains
- ✅ Better error messages

---

## Technical Details

### The `areAllDependenciesComplete` Function

This function returns `true` only when:
1. Cell has no dependencies (no `{{...}}` in prompt), OR
2. All dependencies exist, AND
3. All dependencies are not currently running, AND
4. All dependencies have completed output or completed generation status

### The `waitForDependencies` Function

This function:
- Polls every 100ms (responsive but not CPU-intensive)
- Uses `getLatestCells()` to see updates immediately
- Times out after 5 minutes
- Logs progress every 10 seconds
- Provides detailed error messages on timeout

### State Management

- **`cellsRef.current`**: Always has the latest cell state
- **`runningCellsRef.current`**: Tracks which cells are currently executing
- **`getLatestCells()`**: Function that returns the absolute latest state
- Updates happen immediately, so dependency checks see changes right away

---

## Double-Check Safety Mechanism

To prevent race conditions, the system has **two layers** of dependency checking:

### Layer 1: `waitForDependencies` (Before Execution)
- Checks if dependencies are complete **before** the cell starts running
- Blocks execution until all dependencies are ready
- Uses `areAllDependenciesComplete` function

### Layer 2: `resolveCellReference` (During Resolution)
- **Additional safety check** when actually resolving `{{A1}}` references
- If a dependency is still running, **waits** for it to complete
- Refreshes cell data to get the latest output
- Prevents errors where output isn't visible yet due to state propagation delays

**Why two layers?**
- Layer 1 prevents starting execution too early
- Layer 2 handles edge cases where:
  - State hasn't propagated yet (autorun chains)
  - Dependency just finished but output isn't in the cell object yet
  - Race conditions in rapid autorun sequences

## Summary

The system prevents running cells before dependencies are ready by:

1. **Parsing** all dependencies from the prompt
2. **Checking** each dependency for existence, running status, and completion
3. **Waiting** (polling) until ALL dependencies are ready (Layer 1)
4. **Double-checking** when resolving references (Layer 2)
5. **Only then** executing the cell
6. **Recursively** handling autorun dependents with the same checks

This ensures data integrity, prevents errors, and enables reliable autorun chains.

