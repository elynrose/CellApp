import React from 'react';

// Simple sidebar that lists each cell and its outgoing/incoming connections
const DependenciesSidebar = ({ cells, connections }) => {
    // Build a map of connections for quick lookup
    const outgoing = {};
    const incoming = {};
    connections.forEach(conn => {
        const { source_cell_id, target_cell_id } = conn;
        if (!outgoing[source_cell_id]) outgoing[source_cell_id] = [];
        outgoing[source_cell_id].push(target_cell_id);
        if (!incoming[target_cell_id]) incoming[target_cell_id] = [];
        incoming[target_cell_id].push(source_cell_id);
    });

    return (
        <div className="absolute z-40 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[min(50vh,22rem)] max-md:w-full max-md:rounded-t-2xl max-md:border-b-0 max-md:border-t md:top-0 md:right-0 md:h-full md:w-64 md:rounded-none bg-gray-900/80 backdrop-blur-sm text-gray-200 p-4 overflow-y-auto glass-panel">
            <h2 className="text-lg font-semibold mb-4">Dependencies</h2>
            {cells.map(cell => (
                <div key={cell.cell_id} className="mb-3 border-b border-gray-700 pb-2">
                    <div className="font-mono text-sm text-blue-300">{cell.cell_id}</div>
                    <div className="text-xs mt-1">
                        <span className="font-medium">Outputs to:</span>{' '}
                        {outgoing[cell.cell_id] ? outgoing[cell.cell_id].join(', ') : '—'}
                    </div>
                    <div className="text-xs mt-1">
                        <span className="font-medium">Inputs from:</span>{' '}
                        {incoming[cell.cell_id] ? incoming[cell.cell_id].join(', ') : '—'}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default DependenciesSidebar;
