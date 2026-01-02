import React, { useState, useEffect } from 'react';
import { X, Code2, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getActiveModels } from '../firebase/firestore';
import ConditionBuilder from './ConditionBuilder';

const SettingsModal = ({ isOpen, onClose, cell, onSave, sheets = [], cells = {} }) => {
    const [model, setModel] = useState(cell?.model || 'gpt-3.5-turbo');
    const [temperature, setTemperature] = useState(cell?.temperature ?? 0.7);
    const [autoRun, setAutoRun] = useState(cell?.autoRun ?? false);
    const [interval, setInterval] = useState(cell?.interval ?? 0);
    const [prompt, setPrompt] = useState(cell?.prompt || '');
    const [cellPrompt, setCellPrompt] = useState(cell?.cellPrompt || '');
    const [characterLimit, setCharacterLimit] = useState(cell?.characterLimit || 0);
    const [outputFormat, setOutputFormat] = useState(cell?.outputFormat || '');
    const [condition, setCondition] = useState(cell?.condition || '');
    // CRITICAL: Ensure videoSeconds is always a string, not a number
    // If cell.videoSeconds is a number from the database, convert it to string
    const [videoSeconds, setVideoSeconds] = useState(
        cell?.videoSeconds !== undefined && cell?.videoSeconds !== null 
            ? String(cell.videoSeconds) 
            : '8'
    );
    const [videoResolution, setVideoResolution] = useState(cell?.videoResolution || '720p');
    const [videoAspectRatio, setVideoAspectRatio] = useState(cell?.videoAspectRatio || '9:16');
    const [audioVoice, setAudioVoice] = useState(cell?.audioVoice || 'alloy');
    const [audioSpeed, setAudioSpeed] = useState(cell?.audioSpeed ?? 1.0);
    const [audioFormat, setAudioFormat] = useState(cell?.audioFormat || 'mp3');
    const [availableModels, setAvailableModels] = useState([]);
    const [showConditionBuilder, setShowConditionBuilder] = useState(false);
    const [conditionBuilderType, setConditionBuilderType] = useState('value'); // 'value' or 'execution'
    const [showReferenceHelp, setShowReferenceHelp] = useState(false);
    const [thenValue, setThenValue] = useState('');
    const [elseValue, setElseValue] = useState('');
    const [thenValueType, setThenValueType] = useState('cell'); // 'cell' or 'text'
    const [elseValueType, setElseValueType] = useState('cell'); // 'cell' or 'text'

    useEffect(() => {
        if (isOpen) {
            loadModels();
        }
    }, [isOpen]);

    useEffect(() => {
        if (cell) {
            // Only update if values actually changed to prevent infinite loops
            const newModel = cell.model || 'gpt-3.5-turbo';
            const newTemperature = cell.temperature ?? 0.7;
            const newAutoRun = cell.autoRun ?? false;
            const newInterval = cell.interval ?? 0;
            const newPrompt = cell.prompt || '';
            const newCellPrompt = cell.cellPrompt || '';
            const newCharacterLimit = cell.characterLimit || 0;
            const newOutputFormat = cell.outputFormat || '';
            // CRITICAL: Ensure it's always a string, not a number
            const newVideoSeconds = cell.videoSeconds !== undefined && cell.videoSeconds !== null
                ? String(cell.videoSeconds)
                : '8';
            const newVideoResolution = cell.videoResolution || '720p';
            const newVideoAspectRatio = cell.videoAspectRatio || '9:16';
            const newAudioVoice = cell.audioVoice || 'alloy';
            const newAudioSpeed = cell.audioSpeed ?? 1.0;
            const newAudioFormat = cell.audioFormat || 'mp3';
            const newCondition = cell.condition || '';

            // Use functional updates to only set if changed
            setModel(prev => prev !== newModel ? newModel : prev);
            setTemperature(prev => prev !== newTemperature ? newTemperature : prev);
            setAutoRun(prev => prev !== newAutoRun ? newAutoRun : prev);
            setInterval(prev => prev !== newInterval ? newInterval : prev);
            setPrompt(prev => prev !== newPrompt ? newPrompt : prev);
            setCellPrompt(prev => prev !== newCellPrompt ? newCellPrompt : prev);
            setCharacterLimit(prev => prev !== newCharacterLimit ? newCharacterLimit : prev);
            setOutputFormat(prev => prev !== newOutputFormat ? newOutputFormat : prev);
            setVideoSeconds(prev => prev !== newVideoSeconds ? newVideoSeconds : prev);
            setVideoResolution(prev => prev !== newVideoResolution ? newVideoResolution : prev);
            setVideoAspectRatio(prev => prev !== newVideoAspectRatio ? newVideoAspectRatio : prev);
            setAudioVoice(prev => prev !== newAudioVoice ? newAudioVoice : prev);
            setAudioSpeed(prev => prev !== newAudioSpeed ? newAudioSpeed : prev);
            setAudioFormat(prev => prev !== newAudioFormat ? newAudioFormat : prev);
            setCondition(prev => prev !== newCondition ? newCondition : prev);
        }
    }, [cell?.cell_id, cell?.model, cell?.temperature, cell?.autoRun, cell?.interval, cell?.prompt, cell?.cellPrompt, cell?.characterLimit, cell?.outputFormat, cell?.videoSeconds, cell?.videoResolution, cell?.videoAspectRatio, cell?.audioVoice, cell?.audioSpeed, cell?.audioFormat]);

    const loadModels = async () => {
        try {
            const result = await getActiveModels();
            if (result.success) {
                setAvailableModels(result.models || []);
            }
        } catch (error) {
            console.error('Failed to load models:', error);
        }
    };

    const handleSave = async () => {
        // Ensure we're using the correct model ID format
        // The model value from the select is already in the correct format (originalId or id)
        const updated = {
            ...cell,
            cell_id: cell?.cell_id,
            model: model || cell?.model || 'gpt-3.5-turbo',
            temperature: temperature ?? 0.7,
            autoRun: autoRun ?? false,
            interval: interval > 0 ? interval : 0,
            prompt: prompt || '',
            cellPrompt: cellPrompt || '',
            characterLimit: characterLimit > 0 ? characterLimit : 0,
            outputFormat: outputFormat || '',
            condition: condition || '',
            // CRITICAL: Ensure videoSeconds is always saved as a string
            videoSeconds: videoSeconds ? String(videoSeconds) : '8',
            videoResolution: videoResolution || '720p',
            videoAspectRatio: videoAspectRatio || '9:16',
            audioVoice: audioVoice || 'alloy',
            audioSpeed: audioSpeed ?? 1.0,
            audioFormat: audioFormat || 'mp3',
            output: cell?.output || ''
        };
        onSave(updated);
        onClose();
    };

    if (!isOpen) return null;

    // Group models by type
    const modelsByType = {
        text: availableModels.filter(m => m.type === 'text'),
        image: availableModels.filter(m => m.type === 'image'),
        video: availableModels.filter(m => m.type === 'video'),
        audio: availableModels.filter(m => m.type === 'audio')
    };

    // Check if selected model is a video or audio model
    const selectedModel = availableModels.find(m => (m.originalId || m.id) === model);
    const isVideoModel = selectedModel?.type === 'video';
    const isAudioModel = selectedModel?.type === 'audio';

    // Render modal via portal to avoid being affected by canvas transforms
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-gray-900/90 backdrop-blur-sm text-gray-200 max-w-md w-full mx-4 p-6 rounded-xl glass-panel max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Card Settings</h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm">Prompt</label>
                            <button
                                type="button"
                                onClick={() => setShowReferenceHelp(!showReferenceHelp)}
                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                title="Show reference help"
                            >
                                <HelpCircle size={14} />
                                <span>Reference Help</span>
                                {showReferenceHelp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                        </div>
                        {showReferenceHelp && (
                            <div className="mb-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs">
                                <div className="font-semibold text-blue-300 mb-2">Cell Reference Guide:</div>
                                <div className="space-y-2 text-gray-300">
                                    <div>
                                        <span className="font-mono text-blue-400">{'{{A1}}'}</span>
                                        <span className="ml-2">- Reference cell A1's output (same sheet)</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-blue-400">{'{{prompt:A1}}'}</span>
                                        <span className="ml-2">- Reference cell A1's prompt text</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-blue-400">{'{{output:A1}}'}</span>
                                        <span className="ml-2">- Explicitly reference cell A1's output</span>
                                    </div>
                                    <div className="pt-1 border-t border-blue-500/20">
                                        <span className="font-semibold text-cyan-300">Cross-Sheet References:</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-cyan-400">{'{{Sheet1!A1}}'}</span>
                                        <span className="ml-2">- Reference Sheet1's A1 prompt (default for cross-sheet)</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-cyan-400">{'{{output:Sheet1!A1}}'}</span>
                                        <span className="ml-2">- Reference Sheet1's A1 output</span>
                                    </div>
                                    <div className="pt-1 border-t border-blue-500/20">
                                        <span className="font-semibold text-purple-300">Generation References:</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-purple-400">{'{{A1-1}}'}</span>
                                        <span className="ml-2">- First generation of A1</span>
                                    </div>
                                    <div>
                                        <span className="font-mono text-purple-400">{'{{A1:1-3}}'}</span>
                                        <span className="ml-2">- Generations 1 to 3 of A1</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <textarea
                            rows={4}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="w-full bg-gray-800 rounded p-2 text-sm font-mono"
                            placeholder="Enter your prompt here... Use {{A1}} to reference other cells, {{Sheet1!A1}} for cross-sheet references"
                        />
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400 flex-1">
                                Use {'{{A1}}'}, {'{{B1}}'}, etc. to reference other cells
                            </p>
                            <button
                                onClick={() => {
                                    setConditionBuilderType('value');
                                    setShowConditionBuilder(true);
                                }}
                                className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded flex items-center gap-1"
                                title="Add conditional value selection"
                            >
                                <Code2 size={12} />
                                Add IF/ELSE
                            </button>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm">Conditional Execution</label>
                            <button
                                onClick={() => {
                                    setConditionBuilderType('execution');
                                    setShowConditionBuilder(true);
                                }}
                                className="px-2 py-1 text-xs bg-orange-600 hover:bg-orange-700 rounded flex items-center gap-1"
                                title="Set condition to execute or skip this cell"
                            >
                                <Code2 size={12} />
                                {condition ? 'Edit Condition' : 'Add Condition'}
                            </button>
                        </div>
                        {condition ? (
                            <div className="bg-gray-800 rounded p-2 text-sm font-mono text-green-400 border border-green-500/30">
                                {condition}
                            </div>
                        ) : (
                            <div className="bg-gray-800 rounded p-2 text-sm text-gray-500 italic">
                                No condition set - cell will always execute
                            </div>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                            Cell will only execute if condition is true
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Model</label>
                        <select
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-gray-800 rounded p-2 text-sm"
                        >
                            {Object.entries(modelsByType).map(([type, models]) => {
                                if (models.length === 0) return null;
                                return (
                                    <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                                        {models.map((m) => (
                                            <option key={m.id} value={m.originalId || m.id}>
                                                {m.name}
                                            </option>
                                        ))}
                                    </optgroup>
                                );
                            })}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">
                            Temperature: {temperature.toFixed(2)}
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>Conservative</span>
                            <span>Creative</span>
                        </div>
                    </div>
                    {isVideoModel && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm mb-1">Video Duration (seconds)</label>
                                <select
                                    value={videoSeconds}
                                    onChange={(e) => setVideoSeconds(e.target.value)}
                                    className="w-full bg-gray-800 rounded p-2 text-sm"
                                >
                                    <option value="4">4 seconds</option>
                                    <option value="8">8 seconds</option>
                                    <option value="12">12 seconds</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Video length
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Resolution</label>
                                <select
                                    value={videoResolution}
                                    onChange={(e) => setVideoResolution(e.target.value)}
                                    className="w-full bg-gray-800 rounded p-2 text-sm"
                                >
                                    <option value="720p">720p</option>
                                    {selectedModel?.id === 'sora-2-pro' && (
                                        <option value="1024p">1024p (Pro only)</option>
                                    )}
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Video resolution
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Aspect Ratio</label>
                                <select
                                    value={videoAspectRatio}
                                    onChange={(e) => setVideoAspectRatio(e.target.value)}
                                    className="w-full bg-gray-800 rounded p-2 text-sm"
                                >
                                    <option value="9:16">9:16 (Portrait/Vertical)</option>
                                    <option value="16:9">16:9 (Landscape/Horizontal)</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Video aspect ratio
                                </p>
                            </div>
                        </div>
                    )}
                    {isAudioModel && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm mb-1">Voice</label>
                                <select
                                    value={audioVoice}
                                    onChange={(e) => setAudioVoice(e.target.value)}
                                    className="w-full bg-gray-800 rounded p-2 text-sm"
                                >
                                    <option value="alloy">Alloy</option>
                                    <option value="echo">Echo</option>
                                    <option value="fable">Fable</option>
                                    <option value="onyx">Onyx</option>
                                    <option value="nova">Nova</option>
                                    <option value="shimmer">Shimmer</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Voice selection
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">
                                    Speed: {audioSpeed.toFixed(2)}x
                                </label>
                                <input
                                    type="range"
                                    min="0.25"
                                    max="4.0"
                                    step="0.05"
                                    value={audioSpeed}
                                    onChange={(e) => setAudioSpeed(parseFloat(e.target.value))}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>0.25x</span>
                                    <span>4.0x</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm mb-1">Format</label>
                                <select
                                    value={audioFormat}
                                    onChange={(e) => setAudioFormat(e.target.value)}
                                    className="w-full bg-gray-800 rounded p-2 text-sm"
                                >
                                    <option value="mp3">MP3</option>
                                    <option value="opus">Opus</option>
                                    <option value="aac">AAC</option>
                                    <option value="flac">FLAC</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    Audio format
                                </p>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={autoRun}
                                    onChange={(e) => setAutoRun(e.target.checked)}
                                    className="rounded"
                                />
                                <span className="text-sm">Auto-run when dependencies change</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm mb-1">Auto-run Interval (seconds)</label>
                            <input
                                type="number"
                                min="0"
                                value={interval}
                                onChange={(e) => setInterval(parseInt(e.target.value, 10) || 0)}
                                className="w-full bg-gray-800 rounded p-2 text-sm"
                                placeholder="0 = disabled"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                0 = disabled
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm mb-1">Cell Prompt Template</label>
                        <textarea
                            rows={3}
                            value={cellPrompt}
                            onChange={(e) => setCellPrompt(e.target.value)}
                            className="w-full bg-gray-800 rounded p-2 text-sm"
                            placeholder="Optional: Template prompt that will be prepended to the user's prompt"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            This will be prepended to the user's prompt before generation
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1">Character Limit</label>
                            <input
                                type="number"
                                min="0"
                                value={characterLimit}
                                onChange={(e) => setCharacterLimit(parseInt(e.target.value, 10) || 0)}
                                className="w-full bg-gray-800 rounded p-2 text-sm"
                                placeholder="0 = no limit"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Max characters (0 = no limit)
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm mb-1">Output Format</label>
                            <select
                                value={outputFormat}
                                onChange={(e) => setOutputFormat(e.target.value)}
                                className="w-full bg-gray-800 rounded p-2 text-sm"
                            >
                                <option value="">Default</option>
                                <option value="markdown">Markdown</option>
                                <option value="json">JSON</option>
                                <option value="html">HTML</option>
                                <option value="plain">Plain Text</option>
                                <option value="bullet-list">Bullet List</option>
                                <option value="numbered-list">Numbered List</option>
                                <option value="code">Code</option>
                            </select>
                            <p className="text-xs text-gray-400 mt-1">
                                Output format for text
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end mt-6 space-x-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 text-sm"
                    >
                        Save
                    </button>
                </div>
            </div>
            
            {/* Condition Builder Widget */}
            {showConditionBuilder && (
                <ConditionBuilder
                    condition={conditionBuilderType === 'execution' ? condition : null}
                    conditionType={conditionBuilderType}
                    onConditionChange={(result) => {
                        if (conditionBuilderType === 'execution') {
                            // For execution, result is just the condition string
                            setCondition(result);
                        } else {
                            // For value selection, result is the full if/else/then block
                            // Insert at cursor position or append to prompt
                            setPrompt(prev => {
                                if (prev) {
                                    // Try to insert at cursor if textarea is focused, otherwise append
                                    return `${prev} ${result}`;
                                }
                                return result;
                            });
                        }
                        setShowConditionBuilder(false);
                    }}
                    availableCells={Object.keys(cells || {})}
                    sheets={sheets || []}
                    cells={cells || {}}
                    onClose={() => setShowConditionBuilder(false)}
                />
            )}
        </div>,
        document.body
    );
};

export default SettingsModal;
