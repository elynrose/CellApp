import React from 'react';

const Connection = ({ start, end, isDependency = false }) => {
    // Calculate control points for a smooth Bezier curve
    const deltaX = Math.abs(end.x - start.x);
    const controlPoint1 = { x: start.x + deltaX * 0.5, y: start.y };
    const controlPoint2 = { x: end.x - deltaX * 0.5, y: end.y };

    const pathData = `M ${start.x} ${start.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${end.x} ${end.y}`;

    // Different colors for dependency vs manual connections
    const strokeColor = isDependency ? '#10b981' : '#3b82f6'; // Green for dependencies, blue for manual
    const markerId = isDependency ? 'arrowhead-green' : 'arrowhead-blue';

    return (
        <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            style={{ zIndex: 0 }}
        >
            <defs>
                <marker
                    id="arrowhead-blue"
                    markerWidth="10"
                    markerHeight="7"
                    refX="10"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
                <marker
                    id="arrowhead-green"
                    markerWidth="10"
                    markerHeight="7"
                    refX="10"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                </marker>
            </defs>
            <path
                d={pathData}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isDependency ? "2.5" : "2"}
                strokeDasharray={isDependency ? "5,5" : "none"}
                markerEnd={`url(#${markerId})`}
                opacity={0.8}
            />
        </svg>
    );
};

export default Connection;
