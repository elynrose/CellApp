import React, { useState, useEffect } from 'react';
import { X, Check, Download } from 'lucide-react';
import { createPortal } from 'react-dom';

const GenerationSelectModal = ({ isOpen, onClose, cells, onDownload }) => {
  const [selectedGenerations, setSelectedGenerations] = useState({});

  useEffect(() => {
    if (isOpen) {
      // Initialize selection: by default, select current output and all generations
      const initialSelection = {};
      cells.forEach(cell => {
        const cellSelections = {
          currentOutput: true,
          generations: {}
        };
        
        if (cell.generations && Array.isArray(cell.generations)) {
          cell.generations.forEach((gen, index) => {
            cellSelections.generations[index] = true;
          });
        }
        
        initialSelection[cell.cell_id] = cellSelections;
      });
      setSelectedGenerations(initialSelection);
    }
  }, [isOpen, cells]);

  if (!isOpen) return null;

  const handleToggleCurrentOutput = (cellId) => {
    setSelectedGenerations(prev => ({
      ...prev,
      [cellId]: {
        ...prev[cellId],
        currentOutput: !prev[cellId]?.currentOutput
      }
    }));
  };

  const handleToggleGeneration = (cellId, genIndex) => {
    setSelectedGenerations(prev => ({
      ...prev,
      [cellId]: {
        ...prev[cellId],
        generations: {
          ...prev[cellId]?.generations || {},
          [genIndex]: !prev[cellId]?.generations?.[genIndex]
        }
      }
    }));
  };

  const handleSelectAll = () => {
    const allSelected = {};
    cells.forEach(cell => {
      allSelected[cell.cell_id] = {
        currentOutput: true,
        generations: {}
      };
      if (cell.generations && Array.isArray(cell.generations)) {
        cell.generations.forEach((_, index) => {
          allSelected[cell.cell_id].generations[index] = true;
        });
      }
    });
    setSelectedGenerations(allSelected);
  };

  const handleDeselectAll = () => {
    const allDeselected = {};
    cells.forEach(cell => {
      allDeselected[cell.cell_id] = {
        currentOutput: false,
        generations: {}
      };
      if (cell.generations && Array.isArray(cell.generations)) {
        cell.generations.forEach((_, index) => {
          allDeselected[cell.cell_id].generations[index] = false;
        });
      }
    });
    setSelectedGenerations(allDeselected);
  };

  const handleDownload = () => {
    onDownload(selectedGenerations);
    onClose();
  };

  const getTotalSelected = () => {
    let count = 0;
    Object.values(selectedGenerations).forEach(cellSelections => {
      if (cellSelections?.currentOutput) count++;
      if (cellSelections?.generations) {
        count += Object.values(cellSelections.generations).filter(Boolean).length;
      }
    });
    return count;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900/95 backdrop-blur-sm text-gray-200 max-w-4xl w-full mx-4 p-6 rounded-xl glass-panel max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Select Generations to Download</h2>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
          >
            Deselect All
          </button>
          <div className="flex-1"></div>
          <div className="px-3 py-1.5 text-sm bg-green-600/20 text-green-300 rounded-lg border border-green-600/30">
            {getTotalSelected()} selected
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {cells.map((cell) => {
            const cellSelections = selectedGenerations[cell.cell_id] || { currentOutput: false, generations: {} };
            const hasOutput = cell.output && cell.output.trim() !== '';
            const hasGenerations = cell.generations && Array.isArray(cell.generations) && cell.generations.length > 0;

            return (
              <div key={cell.cell_id} className="border border-white/10 rounded-lg p-4 bg-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-mono font-bold text-blue-300">{cell.cell_id}</span>
                  <span className="text-sm text-gray-400">-</span>
                  <span className="text-sm font-medium">{cell.name || 'Unnamed Card'}</span>
                </div>

                {/* Current Output */}
                {hasOutput && (
                  <div className="mb-3">
                    <label className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={cellSelections.currentOutput || false}
                        onChange={() => handleToggleCurrentOutput(cell.cell_id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium">Current Output</span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {cell.output.substring(0, 50)}...
                      </span>
                    </label>
                  </div>
                )}

                {/* Generations */}
                {hasGenerations ? (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400 mb-2">Generations:</div>
                    {cell.generations.map((gen, index) => {
                      const isSelected = cellSelections.generations?.[index] || false;
                      const genOutput = gen.output || '';
                      const hasGenOutput = genOutput.trim() !== '';
                      
                      return (
                        <label
                          key={index}
                          className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleGeneration(cell.cell_id, index)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">
                            Generation {index + 1}
                            {gen.timestamp && (
                              <span className="text-xs text-gray-500 ml-2">
                                ({(() => {
                                  let timestamp;
                                  if (gen.timestamp.toDate) {
                                    timestamp = gen.timestamp.toDate().toLocaleString();
                                  } else if (gen.timestamp.seconds) {
                                    timestamp = new Date(gen.timestamp.seconds * 1000).toLocaleString();
                                  } else {
                                    timestamp = new Date(gen.timestamp).toLocaleString();
                                  }
                                  return timestamp;
                                })()})
                              </span>
                            )}
                          </span>
                          {hasGenOutput && (
                            <span className="text-xs text-gray-500 ml-auto truncate max-w-xs">
                              {genOutput.substring(0, 50)}...
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic">No generations available</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={getTotalSelected() === 0}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Download size={16} />
            Download PDF ({getTotalSelected()} items)
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GenerationSelectModal;

