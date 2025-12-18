import React from 'react';
import Cell from './Cell';

const Grid = ({ sheet, cells, onCellUpdate }) => {
    if (!sheet) return <div className="p-4">Loading sheet...</div>;

    const rows = Array.from({ length: sheet.num_rows || 10 }, (_, i) => i);
    const cols = Array.from({ length: sheet.num_cols || 10 }, (_, i) => i);

    return (
        <div className="overflow-auto bg-gray-50 p-4 h-full">
            <div className="inline-block border border-gray-300 shadow-sm bg-white">
                {/* Header Row */}
                <div className="flex border-b border-gray-200">
                    <div className="w-10 bg-gray-100 border-r border-gray-200"></div>
                    {cols.map(col => (
                        <div key={col} className="w-64 px-2 py-1 bg-gray-100 border-r border-gray-200 text-center text-sm font-semibold text-gray-700">
                            {String.fromCharCode(65 + col)}
                        </div>
                    ))}
                </div>

                {/* Rows */}
                {rows.map(row => (
                    <div key={row} className="flex border-b border-gray-100">
                        {/* Row Header */}
                        <div className="w-10 flex items-center justify-center bg-gray-100 border-r border-gray-200 text-sm text-gray-600 font-medium">
                            {row + 1}
                        </div>
                        {/* Cells */}
                        {cols.map(col => {
                            const cellId = `${String.fromCharCode(65 + col)}${row + 1}`;
                            const cellData = cells ? cells.find(c => c.cell_id === cellId) : null;

                            return (
                                <Cell
                                    key={cellId}
                                    cellId={cellId}
                                    data={cellData}
                                    sheetId={sheet.id}
                                    onUpdate={onCellUpdate}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Grid;
