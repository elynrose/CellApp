import React, { useState, useEffect } from 'react';
import { X, Sparkles, Search, Filter } from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllTemplates as getLocalTemplates, TEMPLATE_CATEGORIES } from '../data/templates';
import { getAllTemplates, createTemplate } from '../firebase/firestore';
import { getModelType, generateAI } from '../api';

const TemplateModal = ({ isOpen, onClose, onSelectTemplate, availableModels = [] }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [hoveredTemplate, setHoveredTemplate] = useState(null);

  // Template generator state
  const [generatorPrompt, setGeneratorPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState('');

  // Load templates from Firestore
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const result = await getAllTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      } else {
        // Fallback to local templates if Firestore fails
        const localTemplates = getLocalTemplates();
        setTemplates(localTemplates);
      }
    } catch (error) {
      // Fallback to local templates
      const localTemplates = getLocalTemplates();
      setTemplates(localTemplates);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Get active models by type
  const getActiveModelsByType = (type) => {
    return availableModels.filter(model => {
      const modelType = getModelType(model.id || model.originalId || '');
      return modelType === type && (model.isActive !== false && model.status !== 'inactive');
    });
  };

  // Get a text model ID to use for template generation
  const getTextModelId = () => {
    const textModels = getActiveModelsByType('text');
    if (textModels.length > 0) {
      const m = textModels[0];
      return m.originalId || m.id;
    }
    // Fallback to common defaults if no active text models are loaded
    return 'gpt-4o-mini';
  };

  // Check if template can be used with available models
  const canUseTemplate = (template) => {
    const requiredTypes = new Set();
    template.cells?.forEach(cell => {
      // Use modelType if available, otherwise infer from model/preferredModel
      const cellModelType = cell.modelType || getModelType(cell.model || cell.preferredModel || '');
      if (cellModelType) {
        requiredTypes.add(cellModelType);
      }
    });

    // Check if we have at least one active model for each required type
    for (const type of requiredTypes) {
      const activeModelsOfType = getActiveModelsByType(type);
      if (activeModelsOfType.length === 0) {
        return false;
      }
    }
    return true;
  };

  const categories = ['all', ...Object.keys(TEMPLATE_CATEGORIES)];

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const hasRequiredModels = canUseTemplate(template);
    return matchesSearch && matchesCategory && hasRequiredModels;
  });

  const handleSelectTemplate = (template) => {
    onSelectTemplate(template);
    onClose();
  };

  const normalizeTemplateFromAI = (raw) => {
    if (!raw || typeof raw !== 'object') return null;

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const icon = typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : '✨';
    const category = TEMPLATE_CATEGORIES[raw.category] ? raw.category : 'content';
    const cells = Array.isArray(raw.cells) ? raw.cells : [];

    if (!name || cells.length === 0) {
      return null;
    }

    // Ensure each cell has minimal required fields
    const normalizedCells = cells.map((cell, index) => {
      const baseId = cell.cellId || cell.cellReference || `A${index + 1}`;
      const cellId = String(baseId).toUpperCase();
      return {
        cellId,
        cellReference: cell.cellReference || cellId,
        name: cell.name || `Step ${index + 1}`,
        prompt: cell.prompt || '',
        modelType: cell.modelType || 'text',
        preferredModel: cell.preferredModel || getTextModelId(),
        temperature: typeof cell.temperature === 'number' ? cell.temperature : 0.7,
        characterLimit: typeof cell.characterLimit === 'number' ? cell.characterLimit : 0,
        outputFormat: cell.outputFormat || '',
        autoRun: cell.autoRun ?? index > 0,
        x: typeof cell.x === 'number' ? cell.x : 100 + index * 150,
        y: typeof cell.y === 'number' ? cell.y : 100 + index * 120
      };
    });

    // Create a simple slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const id = raw.id || `${slug || 'custom-template'}-${Date.now()}`;

    return {
      id,
      name,
      description: description || 'Custom generated template',
      category,
      icon,
      cells: normalizedCells
    };
  };

  const handleGenerateTemplate = async () => {
    if (!generatorPrompt.trim()) return;
    setIsGenerating(true);
    setGeneratorError('');

    try {
      const modelId = getTextModelId();

      const systemPrompt = [
        'You are an expert workflow designer for a card-based AI canvas.',
        'Given a description, design a small set of 2-6 cards (cells) that work together.',
        'Return ONLY valid JSON with this shape, no extra text or explanation:',
        '{',
        '  "name": "Short template name",',
        '  "description": "1-2 sentence description",',
        '  "category": "one of: content, marketing, business, productivity, education, creative, personal",',
        '  "icon": "an emoji like 📝 or 📱",',
        '  "cells": [',
        '    {',
        '      "cellId": "A1",',
        '      "cellReference": "A1",',
        '      "name": "Card title",',
        '      "prompt": "Prompt text that may reference other cells like {{A1}}",',
        '      "modelType": "text" | "image" | "video" | "audio",',
        '      "preferredModel": "gpt-4o" or other model id,',
        '      "temperature": 0.7,',
        '      "characterLimit": 0,',
        '      "outputFormat": "markdown" | "plain" | "bullet-list" | "" ,',
        '      "autoRun": true or false',
        '    }',
        '  ]',
        '}'
      ].join('\n');

      const fullPrompt = `${systemPrompt}\n\nUser template idea:\n${generatorPrompt.trim()}`;

      const result = await generateAI(fullPrompt, modelId, 0.4, 2000);

      if (!result.success) {
        throw new Error(result.error || 'Template generation failed');
      }

      let rawText = result.output || '';

      // Strip markdown code fences if present
      rawText = rawText.trim();
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error('AI did not return valid JSON. Please try again or simplify your description.');
      }

      const normalized = normalizeTemplateFromAI(parsed);
      if (!normalized) {
        throw new Error('Generated template is missing required fields (name or cells). Please try again.');
      }

      const saveResult = await createTemplate(normalized);
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save template');
      }

      const savedTemplate = { ...normalized, id: saveResult.id || normalized.id };

      // Prepend new template to the list
      setTemplates(prev => [savedTemplate, ...prev]);
      setGeneratorPrompt('');
    } catch (error) {
      setGeneratorError(error.message || 'Failed to generate template');
    } finally {
      setIsGenerating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Choose a Template
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Select a template to generate cards automatically
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search, Filters, and Generator */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Categories */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-gray-400" />
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {category === 'all' ? 'All' : TEMPLATE_CATEGORIES[category].name}
                </button>
              ))}
            </div>

            {/* Template Generator */}
            <div className="rounded-xl border border-dashed border-blue-400/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Template Generator
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Describe the workflow you want and we&apos;ll generate a reusable template.
                  </p>
                </div>
              </div>
              <textarea
                rows={3}
                value={generatorPrompt}
                onChange={(e) => setGeneratorPrompt(e.target.value)}
                placeholder="Example: A 4-step YouTube content workflow with idea, script, thumbnail prompt, and social clips..."
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center justify-between gap-2">
                {generatorError && (
                  <p className="text-xs text-red-500 dark:text-red-400">
                    {generatorError}
                  </p>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleGenerateTemplate}
                  disabled={isGenerating || !generatorPrompt.trim()}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isGenerating || !generatorPrompt.trim()
                      ? 'bg-blue-400/60 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  {isGenerating ? 'Generating...' : 'Generate Template with AI'}
                </button>
              </div>
            </div>
          </div>

          {/* Templates Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p>Loading templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p>No templates found matching your search.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map(template => {
                  const categoryInfo = TEMPLATE_CATEGORIES[template.category];
                  return (
                    <motion.div
                      key={template.id}
                      whileHover={{ scale: 1.02, y: -4 }}
                      onClick={() => handleSelectTemplate(template)}
                      onMouseEnter={() => setHoveredTemplate(template.id)}
                      onMouseLeave={() => setHoveredTemplate(null)}
                      className="relative bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5 cursor-pointer transition-all hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-4xl">{template.icon}</div>
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          categoryInfo.color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          categoryInfo.color === 'purple' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                          categoryInfo.color === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          categoryInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          categoryInfo.color === 'indigo' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                          categoryInfo.color === 'pink' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' :
                          'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                        }`}>
                          {categoryInfo.name}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{template.cells.length} cards</span>
                        <span>•</span>
                        <span>Auto-connected</span>
                      </div>
                      {hoveredTemplate === template.id && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 bg-blue-500/10 rounded-xl flex items-center justify-center"
                        >
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">Click to Use</span>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default TemplateModal;

