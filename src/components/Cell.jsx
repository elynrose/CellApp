import React, { useState, useEffect } from 'react';
import { saveCell } from '../api';

// Image component with error handling and retry
const ImageWithErrorHandling = ({ src, alt, className, ...props }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const maxRetries = 3;

    const handleError = () => {
        if (retryCount < maxRetries) {
            // Retry with a small delay
            setTimeout(() => {
                setRetryCount(prev => prev + 1);
                // Force reload by adding cache busting parameter
                setImgSrc(`${src}?retry=${retryCount + 1}&t=${Date.now()}`);
                setHasError(false);
            }, 1000 * (retryCount + 1)); // Exponential backoff
        } else {
            setHasError(true);
        }
    };

    // Reset when src changes
    useEffect(() => {
        setImgSrc(src);
        setHasError(false);
        setRetryCount(0);
    }, [src]);

    if (hasError) {
        return (
            <div className={`${className} bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 flex items-center justify-center p-4`}>
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
                    <div className="mb-2">⚠️</div>
                    <div>Failed to load image</div>
                    <button 
                        onClick={() => {
                            setRetryCount(0);
                            setHasError(false);
                            setImgSrc(`${src}?retry=0&t=${Date.now()}`);
                        }}
                        className="mt-2 text-blue-500 hover:text-blue-600 underline text-xs"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <img 
            src={imgSrc} 
            alt={alt} 
            className={className} 
            onError={handleError}
            loading="lazy"
            {...props}
        />
    );
};

const Cell = ({ cellId, data, sheetId, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [prompt, setPrompt] = useState(data?.prompt || '');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setPrompt(data?.prompt || '');
    }, [data]);

    const handleKeyDown = async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            setIsEditing(false);
            handleSave();
        }
    };

    const handleSave = async () => {
        if (prompt === data?.prompt) return;

        setIsLoading(true);
        try {
            const result = await saveCell(sheetId, cellId, { prompt });
            if (onUpdate) onUpdate();
        } catch (error) {
        } finally {
            setIsLoading(false);
        }
    };

    const renderContent = () => {
        if (isLoading) return <div className="text-gray-400 text-xs p-2">Processing...</div>;

        const output = data?.output;
        if (!output) return <div className="text-gray-300 text-xs p-2 italic">{data?.prompt || ''}</div>;

        // Basic heuristic for media URL
        if (output.startsWith('http') && (output.match(/\.(jpg|jpeg|png|gif|webp)$/i) || output.includes('image') || output.includes('fal.media') || output.includes('oaidalleapiprod'))) {
            return <ImageWithErrorHandling src={output} alt="Generated" className="max-w-full h-auto max-h-64 object-contain" />;
        }

        if (output.startsWith('http') && (output.match(/\.(mp4|webm|mov)$/i) || output.includes('video'))) {
            return <video src={output} controls className="max-w-full h-auto max-h-64" />;
        }

        return <div className="p-2 text-sm whitespace-pre-wrap font-mono">{output}</div>;
    };

    return (
        <div
            className={`w-64 min-h-[6rem] border-r border-gray-200 relative group transition-all align-top ${isEditing ? 'bg-white z-10 ring-2 ring-blue-500' : 'bg-white hover:bg-gray-50'}`}
            onDoubleClick={() => setIsEditing(true)}
        >
            {isEditing ? (
                <textarea
                    className="w-full h-full min-h-[6rem] p-2 outline-none text-sm resize-none bg-white"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => { setIsEditing(false); handleSave(); }}
                    autoFocus
                    placeholder="Enter prompt..."
                />
            ) : (
                <div className="w-full h-full overflow-hidden">
                    {renderContent()}
                </div>
            )}

            {data?.prompt && !isEditing && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100" title={data.prompt}></div>
            )}
        </div>
    );
};

export default Cell;
