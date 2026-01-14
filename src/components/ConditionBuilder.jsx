import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';

/**
 * Condition Builder Widget
 * Visual interface for creating conditional logic
 */
const ConditionBuilder = ({ 
  condition, 
  onConditionChange, 
  availableCells = [],
  sheets = [],
  cells = {},
  conditionType: initialConditionType = 'value', // 'value' or 'execution'
  onClose 
}) => {
  const [leftSide, setLeftSide] = useState('');
  const [operator, setOperator] = useState('==');
  const [rightSide, setRightSide] = useState('');
  const [rightSideType, setRightSideType] = useState('value'); // 'value' or 'cell'
  const [type, setType] = useState(initialConditionType); // 'value' or 'execution'
  const [thenValue, setThenValue] = useState('');
  const [elseValue, setElseValue] = useState('');
  const [thenValueType, setThenValueType] = useState('cell'); // 'cell' or 'text'
  const [elseValueType, setElseValueType] = useState('cell'); // 'cell' or 'text'

  useEffect(() => {
    // Parse existing condition if provided
    if (condition) {
      try {
        // Try to parse the condition
        const parts = condition.split(/(==|!=|>=|<=|>|<| contains | startsWith | endsWith )/);
        if (parts.length >= 3) {
          setLeftSide(parts[0].trim());
          setOperator(parts[1].trim());
          setRightSide(parts.slice(2).join('').trim().replace(/^["']|["']$/g, ''));
          
          // Check if right side is a cell reference
          if (/^[A-Za-z]+\d+$/.test(parts.slice(2).join('').trim())) {
            setRightSideType('cell');
          } else {
            setRightSideType('value');
          }
        } else {
          // Might be a truthy check (just a cell reference)
          if (/^[A-Za-z]+\d+$/.test(condition.trim())) {
            setLeftSide(condition.trim());
            setOperator('truthy');
            setRightSide('');
            setRightSideType('value');
          }
        }
      } catch (e) {
      }
    }
  }, [condition]);

  const operators = [
    { value: '==', label: 'Equals', needsRight: true },
    { value: '!=', label: 'Not Equals', needsRight: true },
    { value: '>', label: 'Greater Than', needsRight: true },
    { value: '<', label: 'Less Than', needsRight: true },
    { value: '>=', label: 'Greater or Equal', needsRight: true },
    { value: '<=', label: 'Less or Equal', needsRight: true },
    { value: ' contains ', label: 'Contains', needsRight: true },
    { value: ' startsWith ', label: 'Starts With', needsRight: true },
    { value: ' endsWith ', label: 'Ends With', needsRight: true },
    { value: 'truthy', label: 'Has Value', needsRight: false }
  ];

  const handleGenerate = () => {
    if (!leftSide) {
      alert('Please select or enter a cell reference');
      return;
    }

    if (operator !== 'truthy' && !rightSide) {
      alert('Please enter a comparison value');
      return;
    }

    let conditionStr = leftSide;
    
    if (operator !== 'truthy') {
      const right = rightSideType === 'cell' 
        ? rightSide 
        : `"${rightSide}"`; // Quote string values
      conditionStr = `${leftSide}${operator}${right}`;
    }

    // For value selection type, create the full if/else/then block
    if (type === 'value') {
      if (!thenValue) {
        alert('Please enter a "then" value');
        return;
      }
      
      const thenPart = thenValueType === 'cell' ? `{{${thenValue}}}` : thenValue;
      const elsePart = elseValue 
        ? (elseValueType === 'cell' ? `{{${elseValue}}}` : elseValue)
        : '';
      
      const fullBlock = `{{if:${conditionStr}}}then:${thenPart}${elsePart ? `{{else:${elsePart}}}` : ''}}`;
      onConditionChange(fullBlock);
    } else {
      // For execution type, just return the condition
      onConditionChange(conditionStr);
    }
    
    if (onClose) onClose();
  };

  const allCellsList = [];
  
  // Add cells from sheets
  sheets.forEach(sheet => {
    if (sheet.cells) {
      Object.keys(sheet.cells).forEach(cellId => {
        allCellsList.push({
          id: cellId,
          sheetId: sheet.id,
          sheetName: sheet.name || 'Sheet1',
          displayName: `${sheet.name && sheet.name !== 'Sheet1' ? `${sheet.name}!` : ''}${cellId}`
        });
      });
    }
  });
  
  // Also add cells from the cells prop if provided (for current sheet)
  if (cells && Object.keys(cells).length > 0) {
    Object.keys(cells).forEach(cellId => {
      if (!allCellsList.find(c => c.id === cellId)) {
        allCellsList.push({
          id: cellId,
          sheetId: null,
          sheetName: 'Current Sheet',
          displayName: cellId
        });
      }
    });
  }
  
  // Also add from availableCells array if provided
  if (availableCells && availableCells.length > 0) {
    availableCells.forEach(cellId => {
      if (!allCellsList.find(c => c.id === cellId)) {
        allCellsList.push({
          id: cellId,
          sheetId: null,
          sheetName: 'Current Sheet',
          displayName: cellId
        });
      }
    });
  }

  const selectedOperator = operators.find(op => op.value === operator);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl border border-gray-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Condition Builder</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Condition Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Condition Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('value')}
                className={`flex-1 px-4 py-2 rounded transition-colors ${
                  type === 'value'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Value Selection
              </button>
              <button
                onClick={() => setType('execution')}
                className={`flex-1 px-4 py-2 rounded transition-colors ${
                  type === 'execution'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Cell Execution
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {type === 'value' 
                ? 'Conditionally select which value to use in the prompt'
                : 'Conditionally execute or skip this cell'}
            </p>
          </div>

          {/* Left Side - Cell Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Check Cell
            </label>
            <div className="relative">
              <select
                value={leftSide}
                onChange={(e) => setLeftSide(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select a cell...</option>
                {allCellsList.map(cell => (
                  <option key={`${cell.sheetId || 'current'}-${cell.id}`} value={cell.id}>
                    {cell.displayName}
                  </option>
                ))}
              </select>
            </div>
            {!leftSide && (
              <input
                type="text"
                placeholder="Or type cell ID (e.g., A1, Sheet2!B1)"
                value={leftSide}
                onChange={(e) => setLeftSide(e.target.value)}
                className="mt-2 w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
              />
            )}
          </div>

          {/* Operator */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Operator
            </label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {/* Right Side - Value or Cell */}
          {selectedOperator?.needsRight && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Compare To
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setRightSideType('value')}
                  className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                    rightSideType === 'value'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Value
                </button>
                <button
                  onClick={() => setRightSideType('cell')}
                  className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                    rightSideType === 'cell'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Cell Reference
                </button>
              </div>
              
              {rightSideType === 'cell' ? (
                <select
                  value={rightSide}
                  onChange={(e) => setRightSide(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select a cell...</option>
                  {allCellsList.map(cell => (
                    <option key={`${cell.sheetId || 'current'}-${cell.id}`} value={cell.id}>
                      {cell.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter comparison value"
                  value={rightSide}
                  onChange={(e) => setRightSide(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Then/Else Values (for value selection type) */}
          {type === 'value' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Then Value (if condition is true)
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setThenValueType('cell')}
                    className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                      thenValueType === 'cell'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Cell
                  </button>
                  <button
                    onClick={() => setThenValueType('text')}
                    className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                      thenValueType === 'text'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Text
                  </button>
                </div>
                {thenValueType === 'cell' ? (
                  <select
                    value={thenValue}
                    onChange={(e) => setThenValue(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select a cell...</option>
                    {allCellsList.map(cell => (
                      <option key={`then-${cell.sheetId || 'current'}-${cell.id}`} value={cell.id}>
                        {cell.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter text value"
                    value={thenValue}
                    onChange={(e) => setThenValue(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Else Value (if condition is false) <span className="text-gray-500 text-xs">(optional)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setElseValueType('cell')}
                    className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                      elseValueType === 'cell'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Cell
                  </button>
                  <button
                    onClick={() => setElseValueType('text')}
                    className={`flex-1 px-3 py-1 rounded text-sm transition-colors ${
                      elseValueType === 'text'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Text
                  </button>
                </div>
                {elseValueType === 'cell' ? (
                  <select
                    value={elseValue}
                    onChange={(e) => setElseValue(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Select a cell...</option>
                    {allCellsList.map(cell => (
                      <option key={`else-${cell.sheetId || 'current'}-${cell.id}`} value={cell.id}>
                        {cell.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Enter text value (optional)"
                    value={elseValue}
                    onChange={(e) => setElseValue(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                )}
              </div>
            </>
          )}

          {/* Preview */}
          <div className="bg-gray-900 rounded p-3 border border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Condition Preview:</div>
            <div className="text-sm font-mono text-green-400">
              {leftSide || '?'} {operator !== 'truthy' && operator} {operator !== 'truthy' && (rightSide || '?')}
              {operator === 'truthy' && ' (has value)'}
            </div>
            {type === 'value' && thenValue && (
              <div className="text-xs text-blue-400 mt-2">
                Then: {thenValueType === 'cell' ? `{{${thenValue}}}` : thenValue}
                {elseValue && ` | Else: ${elseValueType === 'cell' ? `{{${elseValue}}}` : elseValue}`}
              </div>
            )}
            {type === 'execution' && (
              <div className="text-xs text-orange-400 mt-2">
                This cell will {leftSide ? 'execute' : '?'} if condition is true, otherwise skip
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleGenerate}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors font-medium"
            >
              {condition ? 'Update Condition' : 'Create Condition'}
            </button>
            {condition && (
              <button
                onClick={() => {
                  onConditionChange('');
                  if (onClose) onClose();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Remove
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConditionBuilder;

