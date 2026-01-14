import React, { useState, useEffect, useRef } from 'react';
import { parseConditionalBlocks } from '../utils/conditions';

// Image component with error handling and retry
const ImageWithErrorHandling = ({ src, alt, className, draggable, ...props }) => {
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
                : 'https://cellapp-production.up.railway.app';
            
            const response = await fetch(`${API_BASE_URL}/api/proxy-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
            console.error('Proxy fetch failed:', error);
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
            draggable={draggable}
            onError={handleError}
            loading="lazy"
            {...props}
        />
    );
};
import { motion } from 'framer-motion';
import { Play, Square, Trash2, GripHorizontal, Settings, Clock, Loader2, ChevronDown, ChevronUp, Unlink, Edit2, Check, X as XIcon, Copy, Maximize2, Download, ExternalLink, HelpCircle, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import SettingsModal from './SettingsModal';
import HistoryModal from './HistoryModal';
import { formatOutput } from '../services/cellExecution';
import { parseDependencies } from '../utils/dependencies';
import { uploadImageFromUrl, uploadVideoFromUrl, uploadAudioFromUrl } from '../firebase/storage';
import { saveCell } from '../firebase/firestore';

const Card = ({ cell, onUpdate, onPositionChange, onRunCell, onStopCell, onDelete, isRunning, userId, projectId, sheetId, scale = 1, availableModels = [], sheets = [], allCells = {} }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [prompt, setPrompt] = useState(cell.prompt || '');
    const [output, setOutput] = useState(cell.output || '');
    const [isDragging, setIsDragging] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [isOutputCollapsed, setIsOutputCollapsed] = useState(cell.outputCollapsed ?? false);
    const [isEditingName, setIsEditingName] = useState(false);
    // cardName is the display name/title (can be edited), cell.cell_id is the reference (A1, B1, etc. - never changes)
    const [cardName, setCardName] = useState(cell.name || '');
    const [showUnlinkMenu, setShowUnlinkMenu] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null); // 'x', 'y', or 'both'
    const [cardWidth, setCardWidth] = useState(cell.width || 350);
    const [cardHeight, setCardHeight] = useState(cell.height || null);
    const [isVideoLoading, setIsVideoLoading] = useState(false);
    const cardRef = useRef(null);
    const dragStateRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
    const unlinkMenuRef = useRef(null);
    const resizeStateRef = useRef({ isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0 });
    const dimensionsRef = useRef({ width: cell.width || 350, height: cell.height || null });
    const videoRef = useRef(null);

    // Sync with cell prop changes
    // Use specific dependencies instead of the entire cell object to prevent infinite loops
    useEffect(() => {
        setPrompt(cell.prompt || '');
        const newOutput = cell.output || '';
        setOutput(newOutput);
        if (newOutput && cell.cell_id) {
            const isVideo = newOutput.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) || 
                           newOutput.includes('openai.com') || 
                           newOutput.includes('cdn.openai.com') ||
                           (newOutput.includes('firebasestorage.googleapis.com') && newOutput.match(/videos\//i));
            console.log(`🎬 Card ${cell.cell_id} output updated:`, {
                output: newOutput,
                outputLength: newOutput.length,
                isVideo: isVideo
            });
            if (isVideo) {
                console.log(`🎬 VIDEO URL IN CARD: ${newOutput}`);
            }
        }
        setIsOutputCollapsed(cell.outputCollapsed ?? false);
        setCardName(cell.name || cell.cell_id || '');
        
        // Set video loading state when output changes to a video URL
        // Only set to loading if status is completed (video URL is ready)
        const isVideoOutput = cell.output && (
            cell.output.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) || // Has video extension
            (cell.output.includes('openai.com') && cell.output.includes('video')) || // OpenAI video URL
            (cell.output.includes('cdn.openai.com')) || // OpenAI CDN URL
            (cell.output.includes('firebasestorage.googleapis.com') && cell.output.match(/videos\//i)) // Firebase Storage video
        );
        
        if (isVideoOutput) {
            // If status is completed, video URL is ready - start loading
            if (cell.status === 'completed' || !cell.status) {
                setIsVideoLoading(true);
            } else {
                // Still polling, don't show video loading yet
                setIsVideoLoading(false);
            }
        } else {
            setIsVideoLoading(false);
        }
        const newWidth = cell.width || 350;
        const newHeight = cell.height || null;
        setCardWidth(newWidth);
        setCardHeight(newHeight);
        dimensionsRef.current = { width: newWidth, height: newHeight };
    }, [cell.prompt, cell.output, cell.outputCollapsed, cell.name, cell.cell_id, cell.width, cell.height]);

    // Close unlink menu when clicking outside
    useEffect(() => {
        if (showUnlinkMenu) {
            const handleClickOutside = (e) => {
                if (unlinkMenuRef.current && !unlinkMenuRef.current.contains(e.target)) {
                    setShowUnlinkMenu(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showUnlinkMenu]);

    // Set up drag handlers similar to master source (lines 8495-8546)
    // Account for zoom/scale level
    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const handleMouseDown = (e) => {
            // Only drag from the header (card-handle)
            if (!e.target.closest('.card-handle')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const container = card.closest('[data-canvas-container]');
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const cardRect = card.getBoundingClientRect();
            
            // Get current card position in container's coordinate space
            const cardLeft = parseFloat(card.style.left) || cell.x || 0;
            const cardTop = parseFloat(card.style.top) || cell.y || 0;
            
            // Mouse position relative to container (in viewport coordinates)
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;
            
            // Account for zoom: the container is transformed, so we need to convert
            // viewport coordinates to container coordinates
            // The scale affects how coordinates map from viewport to container space
            const currentScale = scale || 1;
            
            // Calculate offset in container's coordinate space
            // The mouse position needs to be converted from viewport to container space
            dragStateRef.current = {
                isDragging: true,
                offsetX: (mouseX / currentScale) - cardLeft,
                offsetY: (mouseY / currentScale) - cardTop
            };
            
            setIsDragging(true);
            card.style.cursor = 'grabbing';
        };

        const handleMouseMove = (e) => {
            if (!dragStateRef.current.isDragging) return;
            
            const container = card.closest('[data-canvas-container]');
            if (!container) return;
            
            const containerRect = container.getBoundingClientRect();
            const currentScale = scale || 1;
            
            // Mouse position relative to container (in viewport coordinates)
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;
            
            // Convert viewport coordinates to container coordinate space
            const x = (mouseX / currentScale) - dragStateRef.current.offsetX;
            const y = (mouseY / currentScale) - dragStateRef.current.offsetY;
            
            card.style.left = x + 'px';
            card.style.top = y + 'px';
            
            // Update position immediately for smooth dragging
            if (onPositionChange) {
                onPositionChange(cell.cell_id, x, y);
            }
        };

        const handleMouseUp = () => {
            if (dragStateRef.current.isDragging) {
                dragStateRef.current.isDragging = false;
        setIsDragging(false);
                if (card) {
                    card.style.cursor = 'move';
                }
                
                // Save position immediately when dragging ends (like master source)
                const finalX = parseFloat(card.style.left) || cell.x || 0;
                const finalY = parseFloat(card.style.top) || cell.y || 0;
                if (onPositionChange) {
                    // Pass isDragEnd flag to trigger immediate save
                    onPositionChange(cell.cell_id, finalX, finalY, true);
                }
            }
        };

        const header = card.querySelector('.card-handle');
        if (header) {
            header.addEventListener('mousedown', handleMouseDown);
        }
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            if (header) {
                header.removeEventListener('mousedown', handleMouseDown);
            }
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [cell.cell_id, cell.x, cell.y, scale, onPositionChange]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSave();
            // Also run the cell if there's a prompt
            if (prompt && onRunCell) {
                onRunCell(cell.cell_id);
            }
        }
    };

    const handleSave = () => {
        const updatedCell = {
            ...cell,
            prompt,
            output
        };
        onUpdate(cell.cell_id, prompt, output, updatedCell);
        setIsEditing(false);
    };

    const handleRun = (e) => {
        e.stopPropagation();
        if (isRunning && onStopCell) {
            onStopCell(cell.cell_id);
        } else if (onRunCell && prompt) {
            onRunCell(cell.cell_id);
        }
    };

    const handleDelete = async (e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this card?')) return;
        
        if (onDelete) {
            await onDelete(cell.cell_id);
        }
    };

    const handleNameSave = () => {
        // Only update the name field, cell_id (reference) never changes
        const updatedCell = {
            ...cell,
            cell_id: cell.cell_id, // Keep the reference (A1, B1, etc.) unchanged
            name: cardName.trim() || '', // Update only the display name
            prompt: cell.prompt,
            output: cell.output
        };
        onUpdate(cell.cell_id, cell.prompt, cell.output, updatedCell);
        setIsEditingName(false);
    };

    const handleNameCancel = () => {
        setCardName(cell.name || ''); // Reset to current name, not cell_id
        setIsEditingName(false);
    };

    // Resize handlers
    const handleResizeStart = (e, direction) => {
        e.stopPropagation();
        e.preventDefault();
        const currentWidth = cardRef.current?.offsetWidth || cardWidth;
        const currentHeight = cardRef.current?.offsetHeight || cardHeight || 150;
        
        setIsResizing(true);
        setResizeDirection(direction);
        resizeStateRef.current = {
            isResizing: true,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: currentWidth,
            startHeight: currentHeight
        };
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleResizeMove = (e) => {
            if (!resizeStateRef.current.isResizing) return;
            
            const deltaX = e.clientX - resizeStateRef.current.startX;
            const deltaY = e.clientY - resizeStateRef.current.startY;
            
            let newWidth = resizeStateRef.current.startWidth;
            let newHeight = resizeStateRef.current.startHeight;
            
            // Only update dimensions based on resize direction
            if (resizeDirection === 'x' || resizeDirection === 'both') {
                newWidth = Math.max(250, resizeStateRef.current.startWidth + deltaX);
            }
            if (resizeDirection === 'y' || resizeDirection === 'both') {
                newHeight = Math.max(150, resizeStateRef.current.startHeight + deltaY);
            }
            
            setCardWidth(newWidth);
            setCardHeight(newHeight);
            dimensionsRef.current = { width: newWidth, height: newHeight };
        };

        const handleResizeEnd = () => {
            if (resizeStateRef.current.isResizing) {
                // Get latest dimensions from ref (most up-to-date)
                const finalWidth = dimensionsRef.current.width;
                const finalHeight = dimensionsRef.current.height;
                
                // Save dimensions to Firestore
                const updatedCell = {
                    ...cell,
                    width: finalWidth,
                    height: finalHeight
                };
                onUpdate(cell.cell_id, cell.prompt, cell.output, updatedCell);
            }
            setIsResizing(false);
            setResizeDirection(null);
            resizeStateRef.current.isResizing = false;
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);

        return () => {
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };
    }, [isResizing, resizeDirection, cell, onUpdate]);

    const handleUnlink = (e) => {
        e.stopPropagation();
        setShowUnlinkMenu(!showUnlinkMenu);
    };

    const removeDependency = (depKey) => {
        // Parse dependencies from prompt
        const deps = parseDependencies(prompt);
        
        // Remove the specified dependency
        let newPrompt = prompt;
        deps.forEach(dep => {
            // Extract cell ID and sheet name from dependency reference
            let depId = dep;
            let depSheetName = null;
            
            // Handle cross-sheet references (Sheet1!A1 or prompt:Sheet1!A1)
            if (dep.includes('!')) {
                const parts = dep.split('!');
                let sheetPart = parts[0];
                // Remove type prefix if present
                if (sheetPart.includes(':')) {
                    const colonIndex = sheetPart.indexOf(':');
                    sheetPart = sheetPart.substring(colonIndex + 1);
                }
                depSheetName = sheetPart;
                depId = parts[parts.length - 1];
            } else if (dep.includes(':')) {
                // Remove type prefix (prompt:, output:)
                depId = dep.split(':').pop();
            }
            
            // Remove generation suffixes
            if (depId.includes('-')) {
                depId = depId.split('-')[0];
            }
            if (depId.includes(':')) {
                depId = depId.split(':')[0];
            }
            
            // Build the key to match
            const matchKey = depSheetName ? `${depSheetName}!${depId}` : depId;
            
            // Check if this dependency matches the one to remove
            if (matchKey === depKey) {
                // Remove the dependency reference from prompt
                const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\{\\{${escapedDep}\\}\\}`, 'g');
                newPrompt = newPrompt.replace(regex, '');
            }
        });
        
        // Clean up extra spaces
        newPrompt = newPrompt.replace(/\s+/g, ' ').trim();
        
        // Update the cell
        setPrompt(newPrompt);
        onUpdate(cell.cell_id, newPrompt, cell.output);
        setShowUnlinkMenu(false);
    };

    // Get dependencies for unlink menu
    const getDependencies = () => {
        const deps = parseDependencies(prompt);
        const uniqueCellIds = new Set();
        
        deps.forEach(dep => {
            let cellId = dep;
            let sheetName = null;
            
            // Handle cross-sheet references (Sheet1!A1)
            if (cellId.includes('!')) {
                const parts = cellId.split('!');
                // Remove type prefix if present (prompt:Sheet1!A1 or output:Sheet1!A1)
                let sheetPart = parts[0];
                if (sheetPart.includes(':')) {
                    const colonIndex = sheetPart.indexOf(':');
                    sheetPart = sheetPart.substring(colonIndex + 1);
                }
                sheetName = sheetPart;
                cellId = parts[parts.length - 1];
            } else {
                // Same-sheet reference - remove prefixes like "prompt:", "output:"
                if (cellId.includes(':')) {
                    const parts = cellId.split(':');
                    cellId = parts[parts.length - 1];
                }
            }
            
            // Remove generation suffixes like "-1", ":1-3", ":2"
            if (cellId.includes('-')) {
                cellId = cellId.split('-')[0];
            }
            // Remove any remaining colons
            cellId = cellId.split(':')[0];
            
            if (cellId) {
                // Store as "cellId" for same-sheet or "sheetName!cellId" for cross-sheet
                const key = sheetName ? `${sheetName}!${cellId}` : cellId;
                uniqueCellIds.add(key);
            }
        });
        
        return Array.from(uniqueCellIds);
    };

    // Check if this cell is referenced from another sheet
    const isReferencedFromOtherSheet = () => {
        if (!sheets || !cell.cell_id) return { referenced: false, fromSheet: null };
        
        const currentSheetName = sheets.find(s => s.id === sheetId)?.name;
        if (!currentSheetName) return false;
        
        // Check all sheets for references to this cell
        for (const sheet of sheets) {
            // Skip current sheet
            if (sheet.id === sheetId) continue;
            
            // Check all cells in this sheet
            const sheetCells = allCells[sheet.id] || {};
            for (const otherCell of Object.values(sheetCells)) {
                if (!otherCell.prompt) continue;
                
                // Parse dependencies from the other cell's prompt
                const deps = parseDependencies(otherCell.prompt);
                
                // Check if any dependency references this cell from another sheet
                for (const dep of deps) {
                    // Check for cross-sheet reference format: SheetName!CellId
                    if (dep.includes('!')) {
                        const parts = dep.split('!');
                        const sheetName = parts[0];
                        // Handle type prefix (prompt:, output:)
                        const cleanSheetName = sheetName.includes(':') 
                            ? sheetName.split(':')[1] 
                            : sheetName;
                        
                        // Check if it references current sheet and this cell
                        if (cleanSheetName.toLowerCase() === currentSheetName.toLowerCase()) {
                            let cellRef = parts[parts.length - 1];
                            // Remove generation specs
                            if (cellRef.includes('-')) cellRef = cellRef.split('-')[0];
                            if (cellRef.includes(':')) cellRef = cellRef.split(':')[0];
                            
                            if (cellRef === cell.cell_id) {
                                return { referenced: true, fromSheet: sheet.name };
                            }
                        }
                    }
                }
            }
        }
        
        return { referenced: false, fromSheet: null };
    };

    const renderContent = () => {
        // Show loading state for running generation or polling status
        // Handle various status values: pending, running, queued, processing, in_progress
        const isPolling = cell.status === 'pending' || 
                         cell.status === 'running' || 
                         cell.status === 'queued' || 
                         cell.status === 'processing' || 
                         cell.status === 'in_progress';
        const hasOutput = output && output.trim() !== '';
        const showLoadingOverlay = isRunning || (isPolling && !hasOutput) || isVideoLoading;
        
        // Determine content type from model or output
        const model = cell.model || '';
        const modelType = getModelType(model);
        
        // Show loading screen while generating/polling (no output yet)
        if (showLoadingOverlay && !hasOutput) {
            const getStatusMessage = () => {
                if (isPolling) {
                    switch(cell.status) {
                        case 'queued': return 'Job queued, waiting to start...';
                        case 'pending': return 'Job created, polling status...';
                        case 'processing':
                        case 'in_progress':
                        case 'running': return 'Processing video, checking status...';
                        default: return 'Processing, checking status...';
                    }
                }
                return 'Generating...';
            };
            
            const statusMessage = getStatusMessage();

    return (
                <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                    <Loader2 size={32} className="animate-spin mb-4 text-blue-400" />
                    <span className="text-sm font-medium">{statusMessage}</span>
                    {isPolling && cell.jobId && (
                        <>
                            <span className="text-xs text-gray-500 mt-2 font-mono">
                                Job ID: {cell.jobId.substring(0, 12)}...
                            </span>
                            {/* Active polling indicator */}
                            <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                                <span>Polling every second...</span>
                            </div>
                        </>
                    )}
                </div>
            );
        }

        if (!hasOutput) {
            return (
                <div className="text-gray-500 text-sm italic p-4 text-center">
                    Enter a prompt and press Ctrl+Enter or click Run
                </div>
            );
        }

        const formatted = formatOutput(output, modelType, cell.outputFormat);

        // For images, videos, audio - render directly
        if (modelType === 'image' && output.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i)) {
            return (
                <ImageWithErrorHandling 
                    src={output} 
                    alt="Generated" 
                    className="w-full h-auto rounded border border-white/10" 
                    draggable={false} 
                />
            );
        }

        // Check if output is a video URL (with or without file extension)
        const isVideoUrl = modelType === 'video' && output && (
            output.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) || // Has video extension
            (output.includes('openai.com') && (output.includes('video') || output.includes('/videos/'))) || // OpenAI video URL
            (output.includes('cdn.openai.com')) || // OpenAI CDN URL
            (output.includes('firebasestorage.googleapis.com') && output.match(/videos\//i)) || // Firebase Storage video
            (output.includes('api.openai.com') && output.includes('/videos/') && output.includes('/content')) // OpenAI content endpoint
        );
        
        if (isVideoUrl) {
            // Use the output URL directly, but convert OpenAI content endpoint URLs to proxy URLs
            // ONLY if it's not already a Firebase URL
            let videoSrc = output;
            const isFirebaseUrl = output.includes('firebasestorage.googleapis.com');
            
            // Only convert OpenAI URLs to proxy if they're not already saved to Firebase
            if (!isFirebaseUrl && output.includes('api.openai.com') && output.includes('/videos/') && output.includes('/content')) {
                // Extract video ID from URL like: https://api.openai.com/v1/videos/video_xxx/content
                const videoIdMatch = output.match(/\/videos\/([^\/]+)\/content/);
                if (videoIdMatch && videoIdMatch[1]) {
                    const videoId = videoIdMatch[1];
                    // Use relative URL in development (Vite proxy), absolute in production
                    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
                        ? '' 
                        : 'https://cellapp-production.up.railway.app';
                    videoSrc = `${API_BASE_URL}/api/proxy-video/${videoId}`;
                    console.log(`🎬 Converted OpenAI content URL to proxy: ${videoSrc}`);
                }
            } else if (isFirebaseUrl) {
                console.log(`🎬 Using Firebase video URL: ${videoSrc.substring(0, 100)}...`);
            }
            
            return (
                <div className="relative w-full max-w-full rounded border border-white/10 bg-black/10" style={{ aspectRatio: '16/9', maxHeight: '600px' }}>
                    {/* Loading overlay while video is loading */}
                    {isVideoLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded z-10">
                            <Loader2 size={32} className="animate-spin mb-2 text-blue-400" />
                            <span className="text-sm text-gray-300">Loading video...</span>
                        </div>
                    )}
                    <video 
                        ref={videoRef}
                        src={videoSrc} 
                        controls 
                        className="w-full h-full rounded"
                        style={{ 
                            display: 'block',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            objectPosition: 'center'
                        }}
                        onLoadedData={() => {
                            console.log('Video loaded');
                            setIsVideoLoading(false);
                        }}
                        onCanPlay={() => {
                            console.log('Video can play');
                            setIsVideoLoading(false);
                        }}
                        onError={(e) => {
                            console.error('Video load error:', e);
                            console.error('Failed video src:', videoSrc);
                            setIsVideoLoading(false);
                        }}
                    />
                </div>
            );
        }

        if (modelType === 'audio' && (output.match(/^https?:\/\/.+\.(mp3|wav|ogg)/i) || output.startsWith('data:audio'))) {
            return (
                <audio 
                    src={output} 
                    controls 
                    className="w-full" 
                />
            );
        }

        // For text, render with HTML support
        return (
            <div 
                className="text-sm text-gray-300 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar"
                dangerouslySetInnerHTML={{ __html: formatted }}
            />
        );
    };

    const getModelType = (modelId) => {
        if (!modelId) return 'text';
        const id = modelId.toLowerCase();
        if (id.includes('dall-e') || id.includes('stable-diffusion') || id.includes('flux') || id.includes('recraft')) {
            return 'image';
        }
        if (id.includes('sora') || id.includes('runway') || id.includes('pika') || id.includes('stable-video')) {
            return 'video';
        }
        if (id.includes('tts') || id.includes('elevenlabs') || id.includes('whisper')) {
            return 'audio';
        }
        return 'text';
    };

    const handleCopyOutput = async () => {
        if (!output) return;
        try {
            // For text output, copy the raw text (strip HTML if present)
            let textToCopy = output;
            if (typeof output === 'string') {
                // Remove HTML tags for text content
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = output;
                textToCopy = tempDiv.textContent || tempDiv.innerText || output;
            }
            
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = output;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const handleDownloadPDF = async () => {
        setIsGeneratingPDF(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const maxWidth = pageWidth - (margin * 2);
            let yPos = margin;

            // Helper function to add a new page if needed
            const checkPageBreak = (requiredHeight) => {
                if (yPos + requiredHeight > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                    return true;
                }
                return false;
            };

            // Helper function to add text with word wrap
            const addText = (text, fontSize = 10, isBold = false, color = [0, 0, 0]) => {
                doc.setFontSize(fontSize);
                doc.setFont('helvetica', isBold ? 'bold' : 'normal');
                doc.setTextColor(color[0], color[1], color[2]);
                
                const lines = doc.splitTextToSize(text, maxWidth);
                const lineHeight = fontSize * 0.4;
                
                checkPageBreak(lines.length * lineHeight + 5);
                
                lines.forEach((line) => {
                    doc.text(line, margin, yPos);
                    yPos += lineHeight;
                });
                yPos += 5; // Add spacing after text
            };

            // Title
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            const title = cardName || `Cell ${cell.cell_id}`;
            doc.text(title, margin, yPos);
            yPos += 10;

            // Cell ID
            addText(`Cell ID: ${cell.cell_id}`, 10, false, [100, 100, 100]);
            yPos += 3;

            // Prompt section
            if (cell.prompt) {
                checkPageBreak(15);
                addText('PROMPT', 12, true, [0, 0, 0]);
                addText(cell.prompt, 10, false, [0, 0, 0]);
                yPos += 5;
            }

            // Model and settings
            checkPageBreak(15);
            const modelName = availableModels.find(m => 
                m.id === cell.model || 
                m.originalId === cell.model ||
                m.id === cell.model?.split('/')?.pop()
            )?.name || cell.model || 'GPT-3.5';
            
            addText('MODEL & SETTINGS', 12, true, [0, 0, 0]);
            addText(`Model: ${modelName}`, 10, false, [0, 0, 0]);
            if (cell.temperature !== undefined) {
                addText(`Temperature: ${cell.temperature}`, 10, false, [0, 0, 0]);
            }
            if (cell.characterLimit) {
                addText(`Character Limit: ${cell.characterLimit}`, 10, false, [0, 0, 0]);
            }
            if (cell.outputFormat) {
                addText(`Output Format: ${cell.outputFormat}`, 10, false, [0, 0, 0]);
            }
            yPos += 5;

            // Current output
            if (cell.output) {
                checkPageBreak(20);
                addText('CURRENT OUTPUT', 12, true, [0, 0, 0]);
                
                // Check if output is a media URL
                const isMediaUrl = cell.output.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg)/i) || 
                                  cell.output.startsWith('data:');
                
                if (isMediaUrl) {
                    addText(`[Media URL: ${cell.output.substring(0, 100)}...]`, 10, false, [100, 100, 100]);
                } else {
                    // Format text output (remove markdown formatting for cleaner PDF)
                    const cleanOutput = cell.output
                        .replace(/#{1,6}\s+/g, '') // Remove markdown headers
                        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
                        .replace(/\*(.+?)\*/g, '$1') // Remove italic
                        .replace(/`(.+?)`/g, '$1') // Remove code
                        .replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Remove links
                    
                    addText(cleanOutput, 10, false, [0, 0, 0]);
                }
                yPos += 5;
            }

            // Generations
            if (cell.generations && Array.isArray(cell.generations) && cell.generations.length > 0) {
                checkPageBreak(20);
                addText('GENERATION HISTORY', 12, true, [0, 0, 0]);
                yPos += 3;

                cell.generations.forEach((gen, index) => {
                    checkPageBreak(25);
                    
                    // Generation header
                    addText(`Generation ${index + 1}`, 11, true, [50, 50, 150]);
                    
                    // Timestamp if available
                    if (gen.timestamp) {
                        let timestamp;
                        if (gen.timestamp.toDate) {
                            timestamp = gen.timestamp.toDate().toLocaleString();
                        } else if (gen.timestamp.seconds) {
                            timestamp = new Date(gen.timestamp.seconds * 1000).toLocaleString();
                        } else {
                            timestamp = new Date(gen.timestamp).toLocaleString();
                        }
                        addText(`Generated: ${timestamp}`, 9, false, [100, 100, 100]);
                    }
                    
                    // Status if available
                    if (gen.status) {
                        addText(`Status: ${gen.status}`, 9, false, [100, 100, 100]);
                    }
                    
                    // Output
                    if (gen.output) {
                        const isMediaUrl = gen.output.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg)/i) || 
                                          gen.output.startsWith('data:');
                        
                        if (isMediaUrl) {
                            addText(`[Media URL: ${gen.output.substring(0, 100)}...]`, 10, false, [100, 100, 100]);
                        } else {
                            // Format text output
                            const cleanOutput = gen.output
                                .replace(/#{1,6}\s+/g, '')
                                .replace(/\*\*(.+?)\*\*/g, '$1')
                                .replace(/\*(.+?)\*/g, '$1')
                                .replace(/`(.+?)`/g, '$1')
                                .replace(/\[(.+?)\]\(.+?\)/g, '$1');
                            
                            addText(cleanOutput, 10, false, [0, 0, 0]);
                        }
                    }
                    
                    // Add separator between generations
                    if (index < cell.generations.length - 1) {
                        yPos += 3;
                        doc.setDrawColor(200, 200, 200);
                        doc.line(margin, yPos, pageWidth - margin, yPos);
                        yPos += 5;
                    }
                });
            } else {
                checkPageBreak(10);
                addText('No generation history available', 10, false, [150, 150, 150]);
            }

            // Footer
            const totalPages = doc.internal.pages.length - 1;
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Page ${i} of ${totalPages} - Generated on ${new Date().toLocaleString()}`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                );
            }

            // Save PDF
            const fileName = `${cardName || cell.cell_id}_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            
            console.log('✅ PDF generated successfully');
        } catch (error) {
            console.error('❌ Error generating PDF:', error);
            alert(`Failed to generate PDF: ${error.message}`);
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleSaveMedia = async () => {
        if (!userId || !projectId || !sheetId || !cell.cell_id) {
            console.error('Missing required IDs for saving media');
            return;
        }

        // Check storage permissions before allowing save
        const { checkStoragePermission, getStorageLimitMessage } = await import('../utils/storagePermissions');
        const permission = await checkStoragePermission(userId);
        
        if (!permission.allowed) {
            setIsSaving(false);
            const message = permission.reason || 'Storage not available for your subscription plan';
            const limitMessage = getStorageLimitMessage(permission.subscription || 'free');
            
            // Show detailed message for Free/Starter users with download advice
            if (permission.subscription === 'free' || permission.subscription === 'starter') {
                alert(`${message}\n\n${limitMessage}\n\nPlease download copies of your images and videos to save them locally.`);
            } else {
                alert(message);
            }
            return;
        }

        setIsSaving(true);
        try {
            console.log('💾 Starting to save media for cell:', cell.cell_id);

            // Helper function to check if URL is already a Firebase URL
            const isFirebaseUrl = (url) => {
                return url && typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
            };

            // Helper function to detect media type from URL
            const getMediaType = (url) => {
                if (!url || typeof url !== 'string') return null;
                // Check for audio (data URLs or URLs with audio extensions)
                if (url.startsWith('data:audio') || url.match(/^https?:\/\/.+\.(mp3|wav|ogg)/i)) return 'audio';
                // Check for video (URLs with video extensions or OpenAI video URLs)
                // OpenAI video content URLs: https://api.openai.com/v1/videos/video_xxx/content
                if (url.match(/^https?:\/\/.+\.(mp4|webm|mov)/i) || 
                    (url.includes('openai.com') && (url.includes('video') || url.includes('/videos/') || url.includes('/content'))) ||
                    url.includes('sora') || url.includes('runway') || url.includes('pika') ||
                    url.includes('cdn.openai.com')) return 'video';
                // Check for images (URLs with image extensions or known image generation services)
                if (url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)/i) ||
                    url.includes('dalle') || url.includes('blob.core.windows.net') ||
                    url.includes('imagen') || url.includes('recraft') || url.includes('flux')) return 'image';
                return null;
            };

            // Collect all media URLs that need to be saved
            const mediaToSave = [];
            
            // Check cell output
            if (cell.output && typeof cell.output === 'string' && (cell.output.startsWith('http') || cell.output.startsWith('data:'))) {
                const mediaType = getMediaType(cell.output);
                console.log(`🔍 Checking output URL: ${cell.output.substring(0, 100)}...`, { mediaType, isFirebase: isFirebaseUrl(cell.output) });
                if (mediaType && !isFirebaseUrl(cell.output)) {
                    mediaToSave.push({
                        url: cell.output,
                        type: mediaType,
                        location: 'output',
                        index: null
                    });
                    console.log(`✅ Added ${mediaType} from output to save queue`);
                }
            }

            // Check all generations
            if (cell.generations && Array.isArray(cell.generations)) {
                cell.generations.forEach((gen, index) => {
                    if (gen.output && typeof gen.output === 'string' && (gen.output.startsWith('http') || gen.output.startsWith('data:'))) {
                        const mediaType = getMediaType(gen.output);
                        console.log(`🔍 Checking generation ${index} URL: ${gen.output.substring(0, 100)}...`, { mediaType, isFirebase: isFirebaseUrl(gen.output) });
                        if (mediaType && !isFirebaseUrl(gen.output)) {
                            mediaToSave.push({
                                url: gen.output,
                                type: mediaType,
                                location: 'generation',
                                index: index
                            });
                            console.log(`✅ Added ${mediaType} from generation ${index} to save queue`);
                        }
                    }
                });
            }

            if (mediaToSave.length === 0) {
                console.log('✅ No unsaved media found');
                alert('No unsaved media found. All media files are already saved to Firebase or this cell does not contain any media.');
                setIsSaving(false);
                return;
            }

            console.log(`📦 Found ${mediaToSave.length} media file(s) to save`);

            // Upload each media file
            const uploadResults = [];
            for (const media of mediaToSave) {
                try {
                    console.log(`📤 Uploading ${media.type}: ${media.url.substring(0, 100)}...`);
                    console.log(`📤 Media details:`, { type: media.type, location: media.location, index: media.index });
                    let uploadResult;
                    
                    if (media.type === 'image') {
                        uploadResult = await uploadImageFromUrl(media.url, userId, projectId, sheetId, cell.cell_id);
                    } else if (media.type === 'video') {
                        console.log(`🎬 Starting video upload for: ${media.url}`);
                        uploadResult = await uploadVideoFromUrl(media.url, userId, projectId, sheetId, cell.cell_id);
                        console.log(`🎬 Video upload result:`, uploadResult);
                    } else if (media.type === 'audio') {
                        uploadResult = await uploadAudioFromUrl(media.url, userId, projectId, sheetId, cell.cell_id);
                    }

                    if (uploadResult && uploadResult.success) {
                        uploadResults.push({
                            ...media,
                            firebaseUrl: uploadResult.url
                        });
                        console.log(`✅ Uploaded ${media.type} to Firebase: ${uploadResult.url.substring(0, 100)}...`);
                    } else {
                        const errorMsg = uploadResult?.error || 'Unknown error';
                        const isBlocked = uploadResult?.blocked || false;
                        // Check for expired URL errors
                        const isExpiredError = errorMsg.includes('no longer available') || 
                                             errorMsg.includes('expire') || 
                                             errorMsg.includes('expired') ||
                                             (media.type === 'video' && errorMsg.includes('1 hours')) ||
                                             (media.type === 'image' && errorMsg.includes('403'));
                        
                        if (isExpiredError) {
                            const expiredMsg = media.type === 'video' 
                                ? 'Video URL expired (OpenAI videos expire after 1 hour). Please regenerate the video or save it immediately after generation.'
                                : 'Image URL expired (DALL-E images expire after a short time). Please regenerate the image or save it immediately after generation.';
                            console.warn(`⚠️ ${expiredMsg}`);
                            uploadResults.push({
                                ...media,
                                firebaseUrl: null,
                                error: expiredMsg
                            });
                        } else {
                            // Check if upload was blocked due to subscription
                            if (isBlocked) {
                                console.warn(`⚠️ Upload blocked for ${media.type}: ${errorMsg}`);
                                uploadResults.push({
                                    ...media,
                                    firebaseUrl: null,
                                    error: errorMsg,
                                    blocked: true
                                });
                            } else {
                                console.warn(`⚠️ Failed to upload ${media.type}:`, errorMsg);
                                uploadResults.push({
                                    ...media,
                                    firebaseUrl: null,
                                    error: errorMsg,
                                    blocked: false
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error uploading ${media.type}:`, error);
                    console.error(`❌ Error stack:`, error.stack);
                    uploadResults.push({
                        ...media,
                        firebaseUrl: null,
                        error: error.message
                    });
                }
            }

            // Update cell with Firebase URLs
            let updatedOutput = cell.output;
            const updatedGenerations = cell.generations ? [...cell.generations] : [];

            console.log(`🔄 Updating cell with ${uploadResults.length} upload result(s)`);
            uploadResults.forEach((result, idx) => {
                console.log(`🔄 Processing upload result ${idx}:`, { 
                    type: result.type, 
                    location: result.location, 
                    index: result.index, 
                    hasFirebaseUrl: !!result.firebaseUrl,
                    firebaseUrl: result.firebaseUrl ? result.firebaseUrl.substring(0, 100) : null
                });
                if (result.firebaseUrl) {
                    if (result.location === 'output') {
                        console.log(`🔄 Replacing output URL: ${updatedOutput.substring(0, 100)}... -> ${result.firebaseUrl.substring(0, 100)}...`);
                        updatedOutput = result.firebaseUrl;
                    } else if (result.location === 'generation' && result.index !== null) {
                        if (updatedGenerations[result.index]) {
                            console.log(`🔄 Replacing generation ${result.index} URL: ${updatedGenerations[result.index].output?.substring(0, 100)}... -> ${result.firebaseUrl.substring(0, 100)}...`);
                            updatedGenerations[result.index] = {
                                ...updatedGenerations[result.index],
                                output: result.firebaseUrl
                            };
                        } else {
                            console.warn(`⚠️ Generation ${result.index} not found in generations array`);
                        }
                    }
                } else {
                    console.warn(`⚠️ Upload result ${idx} has no Firebase URL, skipping update`);
                }
            });

            // Save updated cell
            const updatedCell = {
                ...cell,
                output: updatedOutput,
                generations: updatedGenerations,
                updatedAt: new Date()
            };

            // Only save if we actually uploaded something
            const successfulUploads = uploadResults.filter(r => r.firebaseUrl);
            console.log(`📊 Upload summary: ${successfulUploads.length} successful, ${uploadResults.length - successfulUploads.length} failed`);
            console.log(`📊 Updated output: ${updatedOutput.substring(0, 100)}...`);
            console.log(`📊 Original output: ${cell.output?.substring(0, 100)}...`);
            
            if (successfulUploads.length > 0) {
                console.log(`💾 Saving cell with updated URLs...`);
                const saveResult = await saveCell(userId, projectId, sheetId, cell.cell_id, updatedCell);
                
                if (saveResult.success) {
                    console.log(`✅ Cell saved successfully with ${successfulUploads.length} Firebase URL(s)`);
                    console.log(`✅ New output URL: ${updatedOutput.substring(0, 100)}...`);
                    // Update local state
                    setOutput(updatedOutput);
                    // Notify parent component
                    if (onUpdate) {
                        console.log(`📢 Calling onUpdate callback...`);
                        onUpdate(cell.cell_id, updatedCell);
                    } else {
                        console.warn(`⚠️ onUpdate callback not provided`);
                    }
                    const blockedCount = uploadResults.filter(r => r.blocked).length;
                    let message = `Successfully saved ${successfulUploads.length} media file(s) to Firebase!`;
                    if (blockedCount > 0) {
                        message += `\n\n${blockedCount} file(s) could not be saved due to subscription limits. Please download copies of your media files.`;
                    }
                    alert(message);
                } else {
                    console.error('❌ Failed to save cell:', saveResult.error);
                    alert(`Failed to save cell: ${saveResult.error || 'Unknown error'}`);
                }
            } else {
                const failedCount = uploadResults.filter(r => !r.firebaseUrl).length;
                const blockedCount = uploadResults.filter(r => r.blocked).length;
                const expiredCount = uploadResults.filter(r => !r.firebaseUrl && r.error && (r.error.includes('expired') || r.error.includes('no longer available'))).length;
                
                console.error(`❌ All uploads failed. Failed count: ${failedCount}, Blocked: ${blockedCount}, Expired: ${expiredCount}`);
                uploadResults.forEach((result, idx) => {
                    if (!result.firebaseUrl) {
                        console.error(`❌ Upload ${idx} failed:`, result.error, result.blocked ? '(BLOCKED)' : '');
                    }
                });
                
                if (failedCount > 0) {
                    if (blockedCount === failedCount && blockedCount > 0) {
                        // All failures are due to subscription limits
                        const { getStorageLimitMessage } = await import('../utils/storagePermissions');
                        const limitMessage = getStorageLimitMessage('free');
                        alert(`Cannot save: ${blockedCount} media file(s) cannot be saved due to subscription limits.\n\n${limitMessage}\n\nPlease download copies of your media files.`);
                    } else if (expiredCount === failedCount && expiredCount > 0) {
                        // All failures are due to expired URLs
                        alert(`Cannot save: ${expiredCount} media file(s) have expired URLs. ${expiredCount === 1 ? 'It' : 'They'} must be saved within 1 hour of generation. Please regenerate ${expiredCount === 1 ? 'it' : 'them'} or ensure future generations are saved immediately.`);
                    } else {
                        let message = `Failed to upload ${failedCount} media file(s).`;
                        if (blockedCount > 0) {
                            message += ` ${blockedCount} blocked due to subscription limits.`;
                        }
                        if (expiredCount > 0) {
                            message += ` ${expiredCount} expired.`;
                        }
                        message += ' Check console for details.';
                        alert(message);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error saving media:', error);
            console.error('❌ Error stack:', error.stack);
            // Show user-friendly error message
            alert(`Failed to save media: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div
                ref={cardRef}
                className={`absolute glass-card rounded-2xl flex flex-col transition-shadow duration-300 ${isDragging ? 'cursor-grabbing shadow-blue-500/20' : ''} ${isResizing ? 'select-none' : ''} ${isRunning || cell.status === 'running' || cell.status === 'processing' || cell.status === 'in_progress' || cell.status === 'pending' || cell.status === 'queued' ? 'shadow-[0_0_20px_rgba(59,130,246,0.5)] shadow-blue-500/50' : ''}`}
                style={{ 
                    width: `${cardWidth}px`,
                    height: cardHeight ? `${cardHeight}px` : 'auto',
                    minHeight: '150px',
                    minWidth: '250px',
                    left: cell.x || 0,
                    top: cell.y || 0,
                    cursor: isResizing 
                        ? (resizeDirection === 'x' ? 'ew-resize' : resizeDirection === 'y' ? 'ns-resize' : 'nwse-resize')
                        : 'move'
                }}
                data-cell-id={cell.cell_id}
                >
                    {/* Header */}
                    <div className="card-handle h-10 border-b border-white/10 flex items-center justify-between px-4 cursor-grab active:cursor-grabbing select-none group rounded-t-2xl bg-white/5">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <GripHorizontal size={14} className="text-gray-500 flex-shrink-0" />
                            {isEditingName ? (
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                        type="text"
                                        value={cardName}
                                        onChange={(e) => setCardName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleNameSave();
                                            } else if (e.key === 'Escape') {
                                                handleNameCancel();
                                            }
                                        }}
                                        onBlur={handleNameSave}
                                        className="flex-1 bg-gray-800 rounded px-2 py-0.5 text-xs text-white min-w-0"
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleNameSave();
                                        }}
                                        className="text-green-400 hover:text-green-300"
                                        title="Save name"
                                    >
                                        <Check size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleNameCancel();
                                        }}
                                        className="text-red-400 hover:text-red-300"
                                        title="Cancel"
                                    >
                                        <XIcon size={12} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Cell Reference (A1, B1, etc.) - always shown, never changes */}
                                    <span 
                                        className="font-mono text-[10px] font-semibold text-blue-400 flex-shrink-0"
                                        title="Cell reference (cannot be changed)"
                                    >
                                        {cell.cell_id}
                            </span>
                                    {/* Cross-sheet reference indicator */}
                                    {(() => {
                                        const crossSheetRef = isReferencedFromOtherSheet();
                                        return crossSheetRef.referenced ? (
                                            <span 
                                                className="text-[8px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 flex-shrink-0"
                                                title={`Referenced from sheet: ${crossSheetRef.fromSheet}`}
                                            >
                                                <ExternalLink size={9} />
                                                <span>{crossSheetRef.fromSheet}</span>
                                            </span>
                                        ) : null;
                                    })()}
                                    {/* Conditional indicator */}
                                    {cell.prompt && parseConditionalBlocks(cell.prompt).some(b => b.type === 'conditional') && (
                                        <span 
                                            className="text-[8px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex-shrink-0"
                                            title="This cell contains conditional logic (if/else/then)"
                                        >
                                            IF
                                        </span>
                                    )}
                                    {cell.condition && (
                                        <span 
                                            className="text-[8px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 flex-shrink-0"
                                            title={`Conditional execution: ${cell.condition}`}
                                        >
                                            COND
                                        </span>
                                    )}
                                    {/* Display Name - editable, shown if exists */}
                                    {cardName && (
                                        <span 
                                            className="text-[10px] text-gray-300 ml-1 truncate"
                                            title="Display name (click to edit)"
                                        >
                                            - {cardName}
                                        </span>
                                    )}
                                    {/* Click area to edit name */}
                                    <span 
                                        className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer ml-1 flex-shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsEditingName(true);
                                        }}
                                        title="Click to edit name"
                                    >
                                        {cardName ? '✏️' : '➕'}
                                    </span>
                                    {/* Status indicator - always show when polling */}
                                    {cell.status && cell.status !== 'completed' && (
                                        <span 
                                            className={`text-[10px] ml-2 px-2 py-1 rounded-full flex items-center gap-1.5 font-medium ${
                                                cell.status === 'pending' || cell.status === 'queued' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                cell.status === 'running' || cell.status === 'processing' || cell.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                cell.status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                            }`}
                                            title={`Status: ${cell.status}${cell.jobId ? ` (Job: ${cell.jobId.substring(0, 8)}...)` : ''} - Polling active`}
                                        >
                                            {(cell.status === 'pending' || cell.status === 'queued') && <Clock size={11} className="animate-pulse" />}
                                            {(cell.status === 'running' || cell.status === 'processing' || cell.status === 'in_progress') && <Loader2 size={11} className="animate-spin" />}
                                            {cell.status === 'error' && <span className="text-xs">⚠️</span>}
                                            <span className="capitalize font-semibold">{cell.status}</span>
                                            {/* Active polling dot indicator */}
                                            {(cell.status === 'pending' || cell.status === 'queued' || cell.status === 'running' || cell.status === 'processing' || cell.status === 'in_progress') && (
                                                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse ml-0.5"></span>
                                            )}
                                        </span>
                                    )}
                                    <span className="font-mono text-[10px] font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 flex-shrink-0">
                                        {(() => {
                                            if (!cell.model) return 'GPT-3.5';
                                            // Find the model in availableModels that matches cell.model
                                            // Try multiple matching strategies
                                            const model = availableModels.find(m => 
                                                m.id === cell.model || 
                                                m.originalId === cell.model ||
                                                m.id === cell.model?.split('/')?.pop() ||
                                                (m.originalId && m.originalId === cell.model) ||
                                                (m.id && m.id.split('/').pop() === cell.model?.split('/')?.pop())
                                            );
                                            
                                            let modelName = '';
                                            // Return model name if found, otherwise try to extract from model ID
                                            if (model && model.name) {
                                                modelName = model.name;
                                            } else {
                                                // Fallback: extract from model ID
                                                const modelId = cell.model?.split('/')?.pop() || cell.model;
                                                modelName = modelId?.split('-').pop() || 'GPT-3.5';
                                            }
                                            
                                            // Limit to two words, add ... if longer
                                            const words = modelName.split(/\s+/);
                                            if (words.length > 2) {
                                                return words.slice(0, 2).join(' ') + '...';
                                            }
                                            return modelName;
                                        })()}
                            </span>
                                </>
                            )}
                        </div>
                        <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity relative">
                            <button
                                onClick={handleRun}
                                disabled={!isRunning && !prompt}
                                className={`transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isRunning 
                                        ? 'text-red-400 hover:text-red-300' 
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                title={isRunning ? "Stop generation" : "Run cell (Ctrl+Enter)"}
                            >
                                {isRunning ? <Square size={14} fill="currentColor" /> : <Play size={14} />}
                            </button>
                            <button
                                type="button"
                                className="text-gray-400 hover:text-white transition-colors"
                                title="History"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowHistory(true);
                                }}
                            >
                                <Clock size={14} />
                            </button>
                            <button
                                type="button"
                                className={`transition-colors ${
                                    isGeneratingPDF 
                                        ? 'text-blue-400 cursor-wait' 
                                        : 'text-gray-400 hover:text-purple-400'
                                }`}
                                title="Download PDF of all generations"
                                disabled={isGeneratingPDF}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPDF();
                                }}
                            >
                                {isGeneratingPDF ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                            </button>
                            <button
                                type="button"
                                className={`transition-colors ${
                                    isSaving 
                                        ? 'text-blue-400 cursor-wait' 
                                        : 'text-gray-400 hover:text-green-400'
                                }`}
                                title="Save media to Firebase"
                                disabled={isSaving}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveMedia();
                                }}
                            >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            <button
                                type="button"
                                className="text-gray-400 hover:text-white transition-colors"
                                title="Settings"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSettings(true);
                                }}
                            >
                                <Settings size={14} />
                            </button>
                            <button
                                type="button"
                                className="text-gray-400 hover:text-orange-400 transition-colors relative"
                                title="Unlink dependencies"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={handleUnlink}
                            >
                                <Unlink size={14} />
                                {showUnlinkMenu && (
                                    <div
                                        ref={unlinkMenuRef}
                                        className="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-[200px]"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700">
                                            Disconnect from:
                                        </div>
                                        {getDependencies().length > 0 ? (
                                            getDependencies().map(depKey => {
                                                const isCrossSheet = depKey.includes('!');
                                                const [sheetName, cellId] = isCrossSheet ? depKey.split('!') : [null, depKey];
                                                return (
                                                    <div
                                                        key={depKey}
                                                        className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer flex items-center justify-between border-b border-gray-700 last:border-b-0"
                                                        onClick={() => removeDependency(depKey)}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {isCrossSheet && (
                                                                <span className="text-cyan-400 text-xs">📄 {sheetName}</span>
                                                            )}
                                                            <span>{cellId}</span>
                                                        </span>
                                                        <span className="text-red-400">✕</span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="px-3 py-2 text-sm text-gray-400">
                                                No dependencies
                                            </div>
                                        )}
                        </div>
                                )}
                            </button>
                            <button
                                onClick={handleDelete}
                                className="text-gray-400 hover:text-red-400 transition-colors"
                                title="Delete"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    {/* Body */}
                    <div className="flex-1 flex flex-col p-0 min-h-0">
                        <div className={`border-b border-white/5 bg-black/20 flex-shrink-0 ${(!output || !isOutputCollapsed) ? 'flex-1' : ''}`}>
                            <div className="p-3 h-full flex flex-col">
                                <div className="relative w-full flex-1 min-h-0 flex flex-col">
                                    <div className="absolute top-2 right-2 z-20">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowSettings(true);
                                            }}
                                            className="text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 rounded-full p-1.5 border border-blue-500/30"
                                            title="Click for reference help and settings"
                                        >
                                            <HelpCircle size={14} />
                                        </button>
                                    </div>
                            <textarea
                                        className="w-full text-sm text-gray-200 placeholder-gray-600 focus:outline-none resize-none bg-transparent font-medium leading-relaxed flex-1 min-h-0"
                                        placeholder="What would you like to create? Use {{A1}} for same-sheet, {{Sheet1!A1}} for cross-sheet references"
                                        rows={(!output || !isOutputCollapsed) ? undefined : 2}
                                    style={(!output || !isOutputCollapsed) ? { height: '100%' } : {}}
                                value={prompt}
                                onChange={(e) => {
                                    const newPrompt = e.target.value;
                                    setPrompt(newPrompt);
                                    // Update cell state immediately for live connection updates
                                    // The full save will happen on blur
                                    const updatedCell = {
                                        ...cell,
                                        cell_id: cell.cell_id,
                                        prompt: newPrompt,
                                        output: cell.output
                                    };
                                    onUpdate(cell.cell_id, newPrompt, cell.output, updatedCell);
                                }}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setIsEditing(true)}
                                onBlur={() => {
                                    if (prompt !== cell.prompt) {
                                        handleSave();
                                    }
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onTouchStart={(e) => {
                                    e.stopPropagation();
                                }}
                            />
                        </div>
                            </div>
                        </div>
                        {/* Output Section - Collapsible */}
                        {output && (
                            <div className={`border-t border-white/5 flex flex-col ${!isOutputCollapsed ? 'flex-1 min-h-0' : 'flex-shrink-0'}`}>
                                <div className="flex items-center justify-between flex-shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newCollapsedState = !isOutputCollapsed;
                                            setIsOutputCollapsed(newCollapsedState);
                                            // Save collapsed state to cell
                                            const updatedCell = {
                                                ...cell,
                                                cell_id: cell.cell_id,
                                                prompt: cell.prompt,
                                                output: cell.output,
                                                outputCollapsed: newCollapsedState
                                            };
                                            onUpdate(cell.cell_id, cell.prompt, cell.output, updatedCell);
                                        }}
                                        className="flex-1 px-4 py-2 flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 hover:bg-white/5 transition-colors"
                                        title={isOutputCollapsed ? "Expand output" : "Collapse output"}
                                    >
                                        <span className="font-medium">Output</span>
                                        {isOutputCollapsed ? (
                                            <ChevronDown size={14} />
                                        ) : (
                                            <ChevronUp size={14} />
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCopyOutput();
                                        }}
                                        className="px-3 py-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                                        title="Copy output to clipboard"
                                    >
                                        {copied ? (
                                            <Check size={14} className="text-green-400" />
                                        ) : (
                                            <Copy size={14} />
                                        )}
                                    </button>
                                </div>
                                {!isOutputCollapsed && (
                                    <div className="p-4 bg-black/10 flex-1 min-h-0 rounded-b-2xl relative overflow-auto">
                            {renderContent()}
                        </div>
                                )}
                            </div>
                        )}
                        {!output && (
                        <div className="p-4 bg-black/10 flex-1 min-h-0 rounded-b-2xl overflow-auto">
                            {renderContent()}
                        </div>
                        )}
                    </div>
                    {/* Connection Ports */}
                    <motion.div
                        whileHover={{ scale: 1.2 }}
                        className="absolute top-12 -left-3 w-6 h-6 bg-gray-800 border-2 border-blue-500 rounded-full cursor-crosshair shadow-lg flex items-center justify-center z-20 group"
                        title="Input"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(cell.cell_id, 'connect-input');
                        }}
                    >
                        <div className="w-2 h-2 bg-blue-400 rounded-full group-hover:bg-white transition-colors" />
                    </motion.div>
                    <motion.div
                        whileHover={{ scale: 1.2 }}
                        className="absolute top-12 -right-3 w-6 h-6 bg-gray-800 border-2 border-purple-500 rounded-full cursor-crosshair shadow-lg flex items-center justify-center z-20 group"
                        title="Output"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onUpdate(cell.cell_id, 'connect-output');
                        }}
                    >
                        <div className="w-2 h-2 bg-purple-400 rounded-full group-hover:bg-white transition-colors" />
                    </motion.div>
                    {/* Resize Handles */}
                    {/* Right edge - resize width (X) */}
                    <div
                        className="absolute top-0 right-0 w-2 h-full cursor-ew-resize z-30 hover:bg-blue-500/20 transition-colors"
                        onMouseDown={(e) => handleResizeStart(e, 'x')}
                        title="Resize width"
                    />
                    {/* Bottom edge - resize height (Y) */}
                    <div
                        className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize z-30 hover:bg-blue-500/20 transition-colors"
                        onMouseDown={(e) => handleResizeStart(e, 'y')}
                        title="Resize height"
                    />
                    {/* Corner - resize both (X and Y) */}
                    <div
                        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-30 flex items-center justify-end pr-1 pb-1"
                        onMouseDown={(e) => handleResizeStart(e, 'both')}
                        title="Resize both"
                    >
                        <Maximize2 size={14} className="text-gray-500 opacity-50 hover:opacity-100 transition-opacity" style={{ transform: 'rotate(90deg)' }} />
                </div>
                </div>
            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                cell={cell}
                sheets={sheets}
                cells={allCells}
                onSave={(updated) => {
                    const merged = {
                        ...cell,
                        ...updated,
                        cell_id: cell.cell_id,
                        prompt: updated.prompt || cell.prompt, // Use updated prompt if provided
                        output: cell.output
                    };
                    // Update local prompt state if it changed
                    if (updated.prompt !== undefined && updated.prompt !== prompt) {
                        setPrompt(updated.prompt);
                    }
                    // Save the full updated cell with all settings
                    onUpdate(cell.cell_id, merged.prompt, cell.output, merged);
                }}
            />
            <HistoryModal
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                cell={cell}
                userId={userId}
                projectId={projectId}
                sheetId={sheetId}
                onRestore={(historyItem) => {
                    onUpdate(cell.cell_id, historyItem.prompt, historyItem.output);
                }}
            />
        </>
    );
};

export default Card;
