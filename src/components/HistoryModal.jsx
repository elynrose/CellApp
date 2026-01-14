import React, { useState, useEffect } from 'react';
import { auth } from '../firebase/config';

async function getAuthHeaders() {
    try {
        const user = auth.currentUser;
        if (!user) return {};
        const token = await user.getIdToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}

// Image component with error handling and retry
const ImageWithErrorHandling = ({ src, alt, className, ...props }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [errorType, setErrorType] = useState(null); // 'expired', 'network', 'other'
    const [isTryingProxy, setIsTryingProxy] = useState(false);
    const maxRetries = 2; // Reduced retries since expired URLs won't work

    // Check if URL is from Azure Blob Storage (DALL-E images)
    const isAzureBlobUrl = (url) => {
        return url && url.includes('blob.core.windows.net');
    };

    // Try to fetch image through proxy endpoint
    const tryProxyFetch = async (url) => {
        if (isTryingProxy) return false; // Already trying
        setIsTryingProxy(true);
        
        try {
            const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                ? '' 
                : 'https://gpt-cells-app-production.up.railway.app';
            
            const response = await fetch(`${API_BASE_URL}/api/proxy-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders()),
                },
                body: JSON.stringify({ url })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.dataUrl) {
                    setImgSrc(data.dataUrl);
                    setHasError(false);
                    setRetryCount(0);
                    setIsTryingProxy(false);
                    return true;
                }
            }
        } catch (error) {
        }
        
        setIsTryingProxy(false);
        return false;
    };

    const handleError = async (e) => {
        // For Azure Blob URLs, failures are usually due to expired signed URLs (403)
        if (isAzureBlobUrl(src)) {
            setErrorType('expired');
            
            // Try proxy fetch first (might work if server can still access it)
            // This is a one-time attempt, not a retry
            if (retryCount === 0 && !isTryingProxy) {
                const proxySuccess = await tryProxyFetch(src);
                if (proxySuccess) {
                    return; // Proxy worked, image should load now
                }
            }
            
            // If proxy failed or already tried, show expired error
            setHasError(true);
            return;
        }
        
        // For other URLs, treat as network error and retry
        setErrorType('network');
        
        if (retryCount < maxRetries) {
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
        setErrorType(null);
        setIsTryingProxy(false);
    }, [src]);

    if (hasError) {
        const isExpired = errorType === 'expired' || isAzureBlobUrl(src);
        
        return (
            <div className={`${className} bg-gray-800 rounded border border-gray-700 flex items-center justify-center p-4 min-h-[200px]`}>
                <div className="text-center text-gray-400 text-sm max-w-md">
                    <div className="mb-3 text-4xl">⚠️</div>
                    <div className="font-semibold text-gray-300 mb-2">
                        {isExpired ? 'Image Link Expired' : 'Failed to Load Image'}
                    </div>
                    <div className="text-xs text-gray-500 mb-4">
                        {isExpired 
                            ? 'This DALL-E image link has expired. Please regenerate the image to view it.'
                            : 'The image could not be loaded. Please check your connection and try again.'}
                    </div>
                    {!isExpired && (
                        <button 
                            onClick={() => {
                                setRetryCount(0);
                                setHasError(false);
                                setErrorType(null);
                                setImgSrc(`${src}?retry=0&t=${Date.now()}`);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
                        >
                            Retry
                        </button>
                    )}
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
import { createPortal } from 'react-dom';
import { X, Clock, RotateCcw, Loader2, ChevronDown, ChevronUp, Copy, Check, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getGenerations, deleteGeneration, deleteAllGenerations } from '../firebase/firestore';
import { formatOutput } from '../services/cellExecution';

const HistoryModal = ({ isOpen, onClose, cell, onRestore, userId, projectId, sheetId }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [collapsedPrompts, setCollapsedPrompts] = useState(new Set()); // Track which prompts are collapsed
    const [copiedIndex, setCopiedIndex] = useState(null); // Track which item was copied

    useEffect(() => {
        if (isOpen && cell && userId && projectId && sheetId) {
            fetchHistory();
            // Collapse all prompts by default on load
            if (history.length > 0) {
                const allIndices = new Set(history.map((_, idx) => idx));
                setCollapsedPrompts(allIndices);
            }
        }
    }, [isOpen, cell, userId, projectId, sheetId]);

    // Collapse all prompts when history loads
    useEffect(() => {
        if (history.length > 0) {
            const allIndices = new Set(history.map((_, idx) => idx));
            setCollapsedPrompts(allIndices);
        }
    }, [history.length]);

    const fetchHistory = async () => {
        if (!cell || !userId || !projectId || !sheetId) return;
        setLoading(true);
        setError(null);
        try {
            const result = await getGenerations(userId, projectId, sheetId, cell.cell_id);
            if (result.success) {
                // Combine with cell.generations if available (for backward compatibility)
                const allGenerations = [
                    ...(result.generations || []),
                    ...(cell.generations || [])
                ].sort((a, b) => {
                    const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || a.createdAt);
                    const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || b.createdAt);
                    return timeB - timeA;
                });
                setHistory(allGenerations);
            } else {
                setError(result.error || 'Failed to fetch history');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = (item) => {
        if (window.confirm('Are you sure you want to restore this version? Current content will be overwritten.')) {
            onRestore(item);
            onClose();
        }
    };

    const handleDelete = async (generationId, index) => {
        if (!window.confirm('Are you sure you want to delete this generation? This action cannot be undone.')) {
            return;
        }

        if (!userId || !projectId || !sheetId || !cell?.cell_id) {
            setError('Missing required information to delete generation');
            return;
        }

        try {
            const result = await deleteGeneration(userId, projectId, sheetId, cell.cell_id, generationId);
            if (result.success) {
                // Remove from local state
                setHistory(prev => prev.filter((_, idx) => idx !== index));
                // Refresh history to ensure consistency
                await fetchHistory();
            } else {
                setError(result.error || 'Failed to delete generation');
            }
        } catch (err) {
            setError(err.message || 'Failed to delete generation');
        }
    };

    const handleCopy = async (text, index) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'Unknown time';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden flex flex-col max-h-[80vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Clock className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Generation History
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                    {cell?.cell_id}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {history.length > 0 && (
                                <button
                                    onClick={async () => {
                                        if (!window.confirm(`Are you sure you want to delete all ${history.length} generation(s)? This action cannot be undone.`)) {
                                            return;
                                        }
                                        
                                        if (!userId || !projectId || !sheetId || !cell?.cell_id) {
                                            setError('Missing required information to delete generations');
                                            return;
                                        }
                                        
                                        try {
                                            setLoading(true);
                                            const result = await deleteAllGenerations(userId, projectId, sheetId, cell.cell_id);
                                            if (result.success) {
                                                setHistory([]);
                                                setError(null);
                                            } else {
                                                setError(result.error || 'Failed to delete all generations');
                                            }
                                        } catch (err) {
                                            setError(err.message);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                    title="Delete all generations"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Clear All
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            </div>
                        ) : error ? (
                            <div className="p-4 bg-red-50 dark:bg-red-900/10 text-red-600 rounded-lg text-sm">
                                {error}
                            </div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>No history available for this cell</p>
                            </div>
                        ) : (
                            history.map((item, index) => {
                                const isLatest = index === 0;
                                const timestamp = item.timestamp || item.createdAt;
                                const modelType = item.type || 'text';
                                // Ensure output is a string (handle null, undefined, or non-string values)
                                const outputStr = item.output != null ? String(item.output) : '';
                                const formattedOutput = formatOutput(outputStr, modelType);

                                return (
                                    <div
                                        key={item.id || index}
                                        className="group bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-500/30 transition-all"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                {isLatest && (
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">
                                                        Latest
                                                    </span>
                                                )}
                                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                                    {formatTimestamp(timestamp)}
                                                </span>
                                                <span>•</span>
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                                                    {item.model || 'Unknown Model'}
                                                </span>
                                                {item.temperature !== undefined && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                                                            Temp: {item.temperature.toFixed(2)}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleCopy(outputStr, index)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    title="Copy output to clipboard"
                                                >
                                                    {copiedIndex === index ? (
                                                        <>
                                                            <Check className="w-3.5 h-3.5" />
                                                            Copied!
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3.5 h-3.5" />
                                                            Copy
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleRestore(item)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    Restore
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id, index)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                                    title="Delete this generation"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Delete
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {/* Collapsible Prompt Section */}
                                            <div className="space-y-1">
                                                <button
                                                    onClick={() => {
                                                        setCollapsedPrompts(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(index)) {
                                                                next.delete(index);
                                                            } else {
                                                                next.add(index);
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                    className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-400 font-semibold hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                                >
                                                    <span>Prompt</span>
                                                    {collapsedPrompts.has(index) ? (
                                                        <ChevronDown className="w-3 h-3" />
                                                    ) : (
                                                        <ChevronUp className="w-3 h-3" />
                                                    )}
                                                </button>
                                                {!collapsedPrompts.has(index) && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg font-mono">
                                                            {item.prompt || item.resolvedPrompt || '(No prompt)'}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Output</div>
                                                    {outputStr && (
                                                        <button
                                                            onClick={() => handleCopy(outputStr, index)}
                                                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded transition-colors"
                                                            title="Copy output to clipboard"
                                                        >
                                                            {copiedIndex === index ? (
                                                                <>
                                                                    <Check className="w-3 h-3" />
                                                                    Copied
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="w-3 h-3" />
                                                                    Copy
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg relative">
                                                    {modelType === 'image' && outputStr && typeof outputStr === 'string' && outputStr.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i) ? (
                                                        <ImageWithErrorHandling src={outputStr} alt="Generated" className="max-w-full h-auto rounded" />
                                                    ) : modelType === 'video' && outputStr && typeof outputStr === 'string' && outputStr.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) ? (
                                                        <video src={outputStr} controls className="max-w-full h-auto rounded" />
                                                    ) : modelType === 'audio' && outputStr && typeof outputStr === 'string' && (outputStr.match(/^https?:\/\/.+\.(mp3|wav|ogg)/i) || outputStr.startsWith('data:audio')) ? (
                                                        <audio src={outputStr} controls className="w-full" />
                                                    ) : (
                                                        <div dangerouslySetInnerHTML={{ __html: formattedOutput }} />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
};

export default HistoryModal;
