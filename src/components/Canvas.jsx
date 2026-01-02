import React, { useRef, useState, useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import Card from './Card';
import Connection from './Connection';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import DependenciesSidebar from './DependenciesSidebar.jsx';
import { generateConnectionsFromDependencies, mergeConnections } from '../utils/connections';

const Canvas = ({ cells, connections = [], onCellUpdate, onCellPositionChange, onRunCell, onStopCell, onDeleteCell, runningCells = new Set(), userId, projectId, sheetId, availableModels = [], sheets = [], allCells = {} }) => {
    const [showSidebar, setShowSidebar] = useState(false);

    // Generate connections from dependencies
    // Create a dependency key from all cell prompts to ensure updates when prompts change
    const cellsPromptKey = useMemo(() => {
        return cells.map(c => `${c.cell_id}:${c.prompt || ''}`).join('|');
    }, [cells]);
    
    const dependencyConnections = useMemo(() => {
        return generateConnectionsFromDependencies(cells);
    }, [cells, cellsPromptKey]);

    // Merge manual connections with dependency-based connections
    const allConnections = useMemo(() => {
        return mergeConnections(connections, dependencyConnections);
    }, [connections, dependencyConnections]);

    // Helper to get coordinates
    const getPortCoords = (cellId, type) => {
        const cell = cells.find(c => c.cell_id === cellId);
        if (!cell) return null;
        const cardWidth = 288;
        const offsetY = 75;
        if (type === 'source') return { x: (cell.x || 0) + cardWidth, y: (cell.y || 0) + offsetY };
        if (type === 'target') return { x: (cell.x || 0), y: (cell.y || 0) + offsetY };
        return { x: 0, y: 0 };
    };

    return (
        <div className="w-full h-full overflow-hidden relative">
            {/* Fixed background grid */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                backgroundAttachment: 'fixed',
            }} />
            <TransformWrapper
                initialScale={1}
                initialPositionX={0}
                initialPositionY={0}
                minScale={0.1}
                maxScale={4}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ 
                    velocityDisabled: false, 
                    excluded: ['textarea', 'input', 'button', 'select']
                }}
                doubleClick={{ disabled: true }}
            >
                {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
                    <>
                        <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 glass-panel p-2 rounded-xl">
                            <button onClick={() => zoomIn()} className="p-2 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"><ZoomIn size={18} /></button>
                            <button onClick={() => zoomOut()} className="p-2 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"><ZoomOut size={18} /></button>
                            <button onClick={() => resetTransform()} className="p-2 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors"><Maximize size={18} /></button>
                            <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 hover:bg-white/10 rounded-lg text-gray-300 hover:text-white transition-colors">{showSidebar ? 'Hide' : 'Deps'}</button>
                        </div>
                        <TransformComponent
                            wrapperClass="w-full h-full"
                            contentClass="w-full h-full"
                            wrapperStyle={{ width: "100%", height: "100%" }}
                        >
                            <div className="w-[5000px] h-[5000px] relative pointer-events-auto" data-canvas-container>
                                {/* Render all connections (manual + dependency-based) */}
                                {allConnections.map(conn => {
                                    const start = getPortCoords(conn.source_cell_id, 'source');
                                    const end = getPortCoords(conn.target_cell_id, 'target');
                                    if (!start || !end) return null;
                                    return (
                                        <Connection 
                                            key={`${conn.source_cell_id}-${conn.target_cell_id}`} 
                                            start={start} 
                                            end={end}
                                            isDependency={dependencyConnections.some(
                                                dc => dc.source_cell_id === conn.source_cell_id && 
                                                      dc.target_cell_id === conn.target_cell_id
                                            )}
                                        />
                                    );
                                })}
                                {cells.map(cell => (
                                    <Card
                                        key={cell.cell_id}
                                        cell={cell}
                                        onUpdate={onCellUpdate}
                                        onPositionChange={onCellPositionChange}
                                        onRunCell={onRunCell}
                                        onStopCell={onStopCell}
                                        onDelete={onDeleteCell}
                                        isRunning={runningCells.has(cell.cell_id)}
                                        userId={userId}
                                        projectId={projectId}
                                        sheetId={sheetId}
                                        scale={rest.state ? rest.state.scale : 1}
                                        availableModels={availableModels}
                                        sheets={sheets}
                                        allCells={allCells}
                                    />
                                ))}
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
            {showSidebar && <DependenciesSidebar cells={cells} connections={allConnections} />}
        </div>
    );
};

export default Canvas;
