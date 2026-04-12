import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChange } from './firebase/auth';
import { getProjects, createProject, getSheets, createSheet, updateSheet, getSheetCells, saveCell, getActiveModels, deleteCell, getUserSubscription } from './firebase/firestore';
import { runOrchestratorHandoffPipeline } from './services/orchestrator';
import { runCell, pollJobStatus, cancelPolling } from './services/cellExecution';
import { parseDependencies, findDependentCells } from './utils/dependencies';
import { getModelType } from './api';
import Canvas from './components/Canvas';
import { Plus, Box, Grid, Trash2, Play, LogOut, User, Shield, Crown, X, AlertCircle, Sparkles, Check, Edit2, GripVertical, ChevronDown, FolderOpen, Copy, FileText, Download, Workflow, Menu } from 'lucide-react';
import jsPDF from 'jspdf';
import { signInWithGoogle, signOutUser, isCurrentUserAdmin } from './firebase/auth';
import AdminDashboard from './components/AdminDashboard';
import SubscriptionModal from './components/SubscriptionModal';
import TemplateModal from './components/TemplateModal';
import UserProfile from './components/UserProfile';
import GenerationSelectModal from './components/GenerationSelectModal';

const orchestratorReportStorageKey = (userId, projectId, sheetId) =>
  `orchestratorRun_${userId}_${projectId}_${sheetId}`;

function formatOrchestratorEventForPdf(ev) {
  if (!ev || typeof ev !== 'object') return String(ev);
  switch (ev.type) {
    case 'plan_start':
      return `Plan round ${ev.round}/${ev.maxPhases}`;
    case 'done':
      return `Planner: goal complete — ${ev.reason || ''}`.trim();
    case 'resolve':
      return `Resolve phase ${ev.round}: ${ev.instruction || ''}`.trim();
    case 'phase_ready':
      return `Template ready: ${ev.templateName || ev.templateId || '—'} (${ev.templateId || ''})`.trim();
    case 'applying':
      return `Applying phase ${ev.phase}/${ev.total}: ${ev.templateName || ''}`.trim();
    default:
      try {
        return JSON.stringify(ev);
      } catch {
        return String(ev.type || '');
      }
  }
}

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(null);
  const [cells, setCells] = useState({}); // Changed to object for easier lookup
  const [connections, setConnections] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('gpt-3.5-turbo');
  const defaultTemperature = 0.7;
  const [connectingSource, setConnectingSource] = useState(null);
  const [runningCells, setRunningCells] = useState(new Set());
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showGenerationSelect, setShowGenerationSelect] = useState(false);
  const [userCredits, setUserCredits] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOrchestratorModal, setShowOrchestratorModal] = useState(false);
  const [orchestratorPrompt, setOrchestratorPrompt] = useState('');
  const [orchestratorRunning, setOrchestratorRunning] = useState(false);
  const [orchestratorMaxPhases, setOrchestratorMaxPhases] = useState(5);
  const [orchestratorHandoffLog, setOrchestratorHandoffLog] = useState([]);
  /** Last successful orchestrator run on this sheet (for PDF + reload); persisted in sessionStorage */
  const [orchestratorRunReport, setOrchestratorRunReport] = useState(null);

  // Auto-dismiss notifications after 8 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (showUserMenu) {
      const handleClickOutside = (e) => {
        if (!e.target.closest('.user-menu-container')) {
          setShowUserMenu(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);
  
  // Interval timers for autorun cells
  const intervalTimersRef = useRef({});
  // Ref to store latest cells for autorun dependency checking
  const cellsRef = useRef(cells);
  // Ref to store latest runningCells to avoid stale closures
  const runningCellsRef = useRef(new Set());
  // Queue for auto-run requests to prevent concurrent API calls
  const autoRunQueueRef = useRef([]);
  const isProcessingAutoRunRef = useRef(false);
  // Track polling timeouts to allow cancellation

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
      if (authUser) {
        loadUserData(authUser.uid);
        loadUserCredits(authUser.uid);
      } else {
        // Clear data when logged out
        setProjects([]);
        setSheets([]);
        setCells({});
        setCurrentProjectId(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, []);

  // Check admin status when user changes
  useEffect(() => {
    if (user) {
      checkAdminStatus();
      loadUserCredits(user.uid);
    } else {
      setIsAdmin(false);
      setUserCredits(null);
    }
  }, [user]);

  const checkAdminStatus = async () => {
    try {
      const adminStatus = await isCurrentUserAdmin();
      setIsAdmin(adminStatus);
    } catch (error) {
      setIsAdmin(false);
    }
  };

  const loadUserCredits = async (userId) => {
    try {
      const result = await getUserSubscription(userId);
      if (result.success) {
        const subscriptionData = result.data;
        
        // Check if credits need to be reset
        const nextReset = subscriptionData?.credits?.nextReset;
        if (nextReset) {
          let nextResetDate;
          if (nextReset.toDate) {
            nextResetDate = nextReset.toDate();
          } else if (nextReset.seconds) {
            nextResetDate = new Date(nextReset.seconds * 1000);
          } else {
            nextResetDate = new Date(nextReset);
          }
          
          const now = new Date();
          if (now >= nextResetDate) {
            // Credits need reset - this will be handled by cellExecution when user tries to generate
            // But we can trigger it here for immediate UI update
            const { getPlanById } = await import('./services/subscriptions');
            const planId = subscriptionData.subscription || 'free';
            const plan = await getPlanById(planId);
            const { resetMonthlyCredits } = await import('./firebase/firestore');
            await resetMonthlyCredits(userId, planId, plan.monthlyCredits);
            
            // Reload after reset
            const updatedResult = await getUserSubscription(userId);
            if (updatedResult.success) {
              setUserCredits(updatedResult.data);
              return;
            }
          }
        }
        
        setUserCredits(subscriptionData);
      }
    } catch (error) {
    }
  };

  // Load sheets when project changes
  useEffect(() => {
    if (user && currentProjectId) {
      loadSheets(user.uid, currentProjectId);
    }
  }, [user, currentProjectId]);

  // Load cells when sheet changes
  useEffect(() => {
    if (user && currentProjectId && activeSheet) {
      loadCells(user.uid, currentProjectId, activeSheet.id);
    }
  }, [user, currentProjectId, activeSheet]);

  // Restore last orchestrator run report for this sheet (session-only)
  useEffect(() => {
    if (!user || !currentProjectId || !activeSheet) {
      setOrchestratorRunReport(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(
        orchestratorReportStorageKey(user.uid, currentProjectId, activeSheet.id)
      );
      if (raw) {
        const parsed = JSON.parse(raw);
        setOrchestratorRunReport(parsed && typeof parsed === 'object' ? parsed : null);
      } else {
        setOrchestratorRunReport(null);
      }
    } catch {
      setOrchestratorRunReport(null);
    }
  }, [user, currentProjectId, activeSheet]);

  // Save active sheet to localStorage whenever it changes
  useEffect(() => {
    if (user && currentProjectId && activeSheet) {
      const storageKey = `lastActiveSheet_${user.uid}_${currentProjectId}`;
      localStorage.setItem(storageKey, activeSheet.id);
    }
  }, [user, currentProjectId, activeSheet]);

  // Keep cellsRef in sync with cells state
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Keep runningCellsRef in sync with runningCells state
  useEffect(() => {
    runningCellsRef.current = runningCells;
  }, [runningCells]);

  // Set up interval timers when cells change
  useEffect(() => {
    if (!user || !currentProjectId || !activeSheet) return;

    // Clear all existing timers
    Object.values(intervalTimersRef.current).forEach(timer => clearInterval(timer));
    intervalTimersRef.current = {};

    // Set up new timers for cells with autorun and interval
    Object.entries(cells).forEach(([cellId, cell]) => {
      if (cell.autoRun && cell.interval && cell.interval > 0 && cell.prompt) {
        const intervalMs = cell.interval * 1000; // Convert seconds to milliseconds
        intervalTimersRef.current[cellId] = setInterval(() => {
          // Use refs to get latest state (avoid stale closures)
          if (user && currentProjectId && activeSheet) {
            const cellToRun = cellsRef.current[cellId];
            const isRunning = runningCellsRef.current.has(cellId);
            
            // Only run if cell exists, has prompt, and is not already running
            if (cellToRun && cellToRun.prompt && cellToRun.prompt.trim() !== '' && !isRunning) {
              // Run the cell (it will handle dependencies automatically)
              handleRunCell(cellId).catch(err => {
              });
            }
          }
        }, intervalMs);
      }
    });

    // Cleanup on unmount
    return () => {
      Object.values(intervalTimersRef.current).forEach(timer => clearInterval(timer));
      intervalTimersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, user, currentProjectId, activeSheet]);

  const loadUserData = async (userId) => {
    try {
      const result = await getProjects(userId);
      if (result.success) {
        setProjects(result.projects || []);
        if (result.projects && result.projects.length > 0) {
          // Check if there's a selected project in localStorage
          const selectedProjectId = localStorage.getItem(`selectedProject_${userId}`);
          if (selectedProjectId && result.projects.find(p => p.id === selectedProjectId)) {
            setCurrentProjectId(selectedProjectId);
          } else {
            setCurrentProjectId(result.projects[0].id);
          }
        } else {
          // Create default project if none exists
          const newProject = await createProject(userId, { name: 'My First Project' });
          if (newProject.success) {
            setCurrentProjectId(newProject.projectId);
            await loadUserData(userId);
          }
        }
      }
    } catch (error) {
    }
  };

  const loadModels = async () => {
    try {
      const result = await getActiveModels();
      if (result.success) {
        setAvailableModels(result.models || []);
        // Set default model if available
        const textModel = result.models.find(m => m.type === 'text');
        if (textModel) {
          setDefaultModel(textModel.originalId || textModel.id);
        }
      } else {
        // Fallback to API
        try {
          const { getAvailableModels } = await import('./api');
          const apiResult = await getAvailableModels();
          if (apiResult.success) {
            setAvailableModels(apiResult.models || []);
          }
        } catch (apiError) {
        }
      }
    } catch (error) {
    }
  };

  const loadSheets = async (userId, projectId) => {
    try {
      const result = await getSheets(userId, projectId);
      if (result.success) {
        const sheetsList = result.sheets || [];
        setSheets(sheetsList);
        if (sheetsList.length > 0) {
          // Try to restore last active sheet from localStorage
          const storageKey = `lastActiveSheet_${userId}_${projectId}`;
          const lastActiveSheetId = localStorage.getItem(storageKey);
          
          if (lastActiveSheetId) {
            // Find the sheet with the saved ID
            const savedSheet = sheetsList.find(s => s.id === lastActiveSheetId);
            if (savedSheet) {
              setActiveSheet(savedSheet);
            } else if (!activeSheet) {
              // Saved sheet doesn't exist anymore, use first sheet
              setActiveSheet(sheetsList[0]);
            }
          } else if (!activeSheet) {
            // No saved sheet, use first sheet
            setActiveSheet(sheetsList[0]);
          }
        } else if (sheetsList.length === 0) {
          // Create default sheet if none exists
          const newSheet = await createSheet(userId, projectId, {
            name: 'Sheet1',
            numRows: 10,
            numCols: 10,
            order: 0,
            cardPositions: {}
          });
          if (newSheet.success) {
            await loadSheets(userId, projectId);
          }
        }
      }
    } catch (error) {
    }
  };

  const loadCells = async (userId, projectId, sheetId) => {
    try {
      const result = await getSheetCells(userId, projectId, sheetId);
      if (result.success) {
        // Convert array to object for easier lookup
        const cellsObj = {};
        result.cells.forEach(cell => {
          cellsObj[cell.cell_id] = {
            ...cell,
            x: cell.x || 0,
            y: cell.y || 0,
            width: cell.width || 350,
            height: cell.height || null,
            model: cell.model || defaultModel,
            temperature: cell.temperature ?? defaultTemperature,
            generations: cell.generations || [],
            status: cell.status || null,
            jobId: cell.jobId || null
          };
        });
        setCells(cellsObj);

        // Resume polling for cells with pending/running/queued status
        Object.entries(cellsObj).forEach(([cellId, cell]) => {
          const isActiveStatus = cell.status === 'pending' || 
                                 cell.status === 'running' || 
                                 cell.status === 'queued' || 
                                 cell.status === 'processing' || 
                                 cell.status === 'in_progress';
          if (isActiveStatus && cell.jobId) {
            pollJobStatus({
              cellId,
              cell,
              jobId: cell.jobId,
              userId,
              projectId,
              sheetId,
              onProgress: ({ status, cellId: progressCellId, output, error, updatedCell }) => {
                if (status === 'complete' && output) {
                  // Ensure output is set in the cell state
                  const finalOutput = updatedCell?.output || output;
                  handleCellUpdate(progressCellId, undefined, finalOutput, updatedCell);
                  
                  // Also directly update cells state to ensure video URL is set immediately
                  setCells(prev => ({
                    ...prev,
                    [progressCellId]: {
                      ...prev[progressCellId],
                      output: finalOutput,
                      status: 'completed',
                      ...(updatedCell || {})
                    }
                  }));
                  cellsRef.current = {
                    ...cellsRef.current,
                    [progressCellId]: {
                      ...cellsRef.current[progressCellId],
                      output: finalOutput,
                      status: 'completed',
                      ...(updatedCell || {})
                    }
                  };
                } else if (status === 'error') {
                  handleCellUpdate(progressCellId, undefined, `Error: ${error}`, updatedCell);
                } else if (status === 'polling' || status === 'running' || status === 'pending') {
                  // Update status in cells during polling
                  const newStatus = updatedCell?.status || status || 'running';
                  setCells(prev => ({
                    ...prev,
                    [progressCellId]: {
                      ...prev[progressCellId],
                      status: newStatus,
                      ...(updatedCell || {})
                    }
                  }));
                  // Also update ref
                  cellsRef.current = {
                    ...cellsRef.current,
                    [progressCellId]: {
                      ...cellsRef.current[progressCellId],
                      status: newStatus,
                      ...(updatedCell || {})
                    }
                  };
                }
              }
            });
          }
        });
      }
    } catch (error) {
    }
  };

  const handleCreateSheet = async () => {
    if (!user || !currentProjectId) return;
    const name = `Sheet ${sheets.length + 1}`;
    // Calculate order as max order + 1 to ensure proper ordering
    const maxOrder = sheets.length > 0 ? Math.max(...sheets.map(s => s.order || 0)) : -1;
    const result = await createSheet(user.uid, currentProjectId, {
      name,
      numRows: 10,
      numCols: 10,
      order: maxOrder + 1,
      cardPositions: {}
    });
    if (result.success) {
      // Save the new sheet ID to localStorage before loading sheets
      // This ensures loadSheets will restore it as the active sheet
      if (result.sheetId) {
        const storageKey = `lastActiveSheet_${user.uid}_${currentProjectId}`;
        localStorage.setItem(storageKey, result.sheetId);
      }
      await loadSheets(user.uid, currentProjectId);
    }
  };

  const handleDeleteSheet = async (e, sheetId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this sheet?")) return;
    if (!user || !currentProjectId) return;

    try {
      const { deleteSheet } = await import('./firebase/firestore');
      await deleteSheet(user.uid, currentProjectId, sheetId);
      const remaining = sheets.filter(s => s.id !== sheetId);
    setSheets(remaining);

      if (activeSheet?.id === sheetId) {
        // Clear localStorage if deleting the active sheet
        const storageKey = `lastActiveSheet_${user.uid}_${currentProjectId}`;
        localStorage.removeItem(storageKey);
      setActiveSheet(remaining.length > 0 ? remaining[0] : null);
    }
      await loadSheets(user.uid, currentProjectId);
    } catch (error) {
    }
  };

  const handleDuplicateSheet = async (e, sheetId) => {
    e.stopPropagation();
    if (!user || !currentProjectId) return;

    const sourceSheet = sheets.find(s => s.id === sheetId);
    if (!sourceSheet) return;

    try {
      setNotification({
        type: 'info',
        title: 'Duplicating Sheet',
        message: `Creating a copy of "${sourceSheet.name}"...`,
        showUpgrade: false
      });

      // Get all cells from the source sheet
      const cellsResult = await getSheetCells(user.uid, currentProjectId, sheetId);
      if (!cellsResult.success) {
        throw new Error('Failed to load cells from source sheet');
      }

      // Create new sheet with "Copy of" prefix
      const newSheetName = sourceSheet.name.startsWith('Copy of ') 
        ? `${sourceSheet.name} (2)` 
        : `Copy of ${sourceSheet.name}`;
      
      const maxOrder = sheets.length > 0 ? Math.max(...sheets.map(s => s.order || 0)) : -1;
      const newSheetResult = await createSheet(user.uid, currentProjectId, {
        name: newSheetName,
        numRows: sourceSheet.numRows || 10,
        numCols: sourceSheet.numCols || 10,
        order: maxOrder + 1,
        cardPositions: sourceSheet.cardPositions || {}
      });

      if (!newSheetResult.success || !newSheetResult.sheetId) {
        throw new Error('Failed to create new sheet');
      }

      const newSheetId = newSheetResult.sheetId;

      // Copy all cells to the new sheet
      const cellsToCopy = cellsResult.cells || [];
      let copiedCount = 0;
      
      for (const cell of cellsToCopy) {
        // Create a clean copy of the cell data without jobId, status, etc.
        const cellCopy = {
          cell_id: cell.cell_id,
          prompt: cell.prompt || '',
          output: cell.output || '',
          x: cell.x || 0,
          y: cell.y || 0,
          width: cell.width || 350,
          height: cell.height || null,
          model: cell.model || defaultModel,
          temperature: cell.temperature ?? defaultTemperature,
          characterLimit: cell.characterLimit || 0,
          outputFormat: cell.outputFormat || '',
          autoRun: cell.autoRun || false,
          interval: cell.interval || null,
          name: cell.name || '',
          outputCollapsed: cell.outputCollapsed || false,
          generations: [] // Don't copy generations history
        };

        await saveCell(user.uid, currentProjectId, newSheetId, cell.cell_id, cellCopy);
        copiedCount++;
      }

      // Set the new sheet as active in localStorage before reloading
      const storageKey = `lastActiveSheet_${user.uid}_${currentProjectId}`;
      localStorage.setItem(storageKey, newSheetId);
      
      // Reload sheets - this will automatically switch to the new sheet
      await loadSheets(user.uid, currentProjectId);

      setNotification({
        type: 'success',
        title: 'Sheet Duplicated',
        message: `Successfully copied "${sourceSheet.name}" with ${copiedCount} cell${copiedCount !== 1 ? 's' : ''}`,
        showUpgrade: false
      });
    } catch (error) {
      setNotification({
        type: 'error',
        title: 'Error',
        message: `Failed to duplicate sheet: ${error.message}`,
        showUpgrade: false
      });
    }
  };

  const [editingSheetId, setEditingSheetId] = useState(null);
  const [editingSheetName, setEditingSheetName] = useState('');

  const handleRenameSheet = async (e, sheetId, currentName) => {
    e.stopPropagation();
    setEditingSheetId(sheetId);
    setEditingSheetName(currentName);
  };

  const handleSaveSheetName = async (sheetId) => {
    if (!user || !currentProjectId || !editingSheetName.trim()) {
      setEditingSheetId(null);
      return;
    }

    try {
      await updateSheet(user.uid, currentProjectId, sheetId, { name: editingSheetName.trim() });
      await loadSheets(user.uid, currentProjectId);
      setEditingSheetId(null);
      setEditingSheetName('');
    } catch (error) {
      setNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to rename sheet: ' + error.message,
        showUpgrade: false
      });
    }
  };

  const handleCancelRename = () => {
    setEditingSheetId(null);
    setEditingSheetName('');
  };

  const handleReorderSheets = async (draggedSheetId, targetSheetId) => {
    if (!user || !currentProjectId || draggedSheetId === targetSheetId) return;

    try {
      const draggedSheet = sheets.find(s => s.id === draggedSheetId);
      const targetSheet = sheets.find(s => s.id === targetSheetId);
      
      if (!draggedSheet || !targetSheet) return;

      // Get all sheets with their current order
      const sortedSheets = [...sheets].sort((a, b) => (a.order || 0) - (b.order || 0));
      const draggedIndex = sortedSheets.findIndex(s => s.id === draggedSheetId);
      const targetIndex = sortedSheets.findIndex(s => s.id === targetSheetId);

      // Reorder the array
      const reorderedSheets = [...sortedSheets];
      const [removed] = reorderedSheets.splice(draggedIndex, 1);
      reorderedSheets.splice(targetIndex, 0, removed);

      // Update orders
      const updates = reorderedSheets.map((sheet, index) => ({
        id: sheet.id,
        order: index
      }));

      // Update all affected sheets
      for (const update of updates) {
        await updateSheet(user.uid, currentProjectId, update.id, { order: update.order });
      }

      await loadSheets(user.uid, currentProjectId);
    } catch (error) {
      setNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to reorder sheets: ' + error.message,
        showUpgrade: false
      });
    }
  };

  const handleCellUpdate = async (cellId, prompt, output, updatedCellData = null) => {
    // Check for connection special events
    if (prompt === 'connect-output') {
      setConnectingSource(cellId);
      return;
    }
    if (prompt === 'connect-input') {
      if (connectingSource && connectingSource !== cellId) {
        const newConn = { source_cell_id: connectingSource, target_cell_id: cellId };
        if (!connections.some(c => c.source_cell_id === newConn.source_cell_id && c.target_cell_id === newConn.target_cell_id)) {
          setConnections(prev => [...prev, newConn]);
        }
        setConnectingSource(null);
      }
      return;
    }

    // Standard update
    const cell = cells[cellId] || {};
    const updatedCell = updatedCellData || {
      ...cell,
      cell_id: cellId, // Always preserve the cell_id (reference like A1, B1, etc.) - never changes
      prompt: prompt !== undefined ? prompt : cell.prompt,
      output: output !== undefined ? output : cell.output
    };

    // Ensure cell_id is set
    if (!updatedCell.cell_id) {
      updatedCell.cell_id = cellId;
    }

    // Update state immediately for live connection updates
    setCells(prev => ({ ...prev, [cellId]: updatedCell }));
    
    // Also update ref immediately so dependency checks see the latest state
    cellsRef.current = { ...cellsRef.current, [cellId]: updatedCell };

    // Update interval timer if autorun or interval changed
    if (updatedCell.autoRun !== undefined || updatedCell.interval !== undefined) {
      // Clear existing timer
      if (intervalTimersRef.current[cellId]) {
        clearInterval(intervalTimersRef.current[cellId]);
        delete intervalTimersRef.current[cellId];
      }

      // Set up new timer if autorun and interval are enabled
      if (updatedCell.autoRun && updatedCell.interval && updatedCell.interval > 0 && updatedCell.prompt) {
        const intervalMs = updatedCell.interval * 1000;
        intervalTimersRef.current[cellId] = setInterval(() => {
          // Use refs to get latest state (avoid stale closures)
          if (user && currentProjectId && activeSheet) {
            const cellToRun = cellsRef.current[cellId];
            const isRunning = runningCellsRef.current.has(cellId);
            
            // Only run if cell exists, has prompt, and is not already running
            if (cellToRun && cellToRun.prompt && cellToRun.prompt.trim() !== '' && !isRunning) {
              // Run the cell (it will handle dependencies automatically)
              handleRunCell(cellId).catch(err => {
              });
            }
          }
        }, intervalMs);
      }
    }

    // Save to Firestore (async, doesn't block UI updates)
    if (user && currentProjectId && activeSheet) {
      // Don't await - let it save in background so UI updates immediately
      saveCell(user.uid, currentProjectId, activeSheet.id, cellId, updatedCell).catch(error => {
      });
    }

    // Check for dependent cells with autoRun when output changes
    // This ensures auto-run works when dependencies are updated
    if (output !== undefined && output !== null && output !== '' && output !== cell.output && user && currentProjectId && activeSheet) {
      // Queue the auto-run check to prevent concurrent API requests
      autoRunQueueRef.current.push({ cellId, output, cell });
      
      // Process queue if not already processing
      if (!isProcessingAutoRunRef.current) {
        processAutoRunQueue();
      }
    }
  };

  // Process auto-run queue sequentially to prevent concurrent API requests
  // This handles cases where multiple cells depend on one cell (e.g., 3 cells with 1 dependency)
  const processAutoRunQueue = async () => {
    if (isProcessingAutoRunRef.current || autoRunQueueRef.current.length === 0) {
      return;
    }

    isProcessingAutoRunRef.current = true;

    while (autoRunQueueRef.current.length > 0) {
      const { cellId } = autoRunQueueRef.current.shift();
      
      // Wait a bit for state to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        const currentCells = cellsRef.current;
        const allSheets = sheets.map(s => ({
          ...s,
          cells: s.id === activeSheet.id ? currentCells : {}
        }));
        const dependents = findDependentCells(cellId, allSheets);
        
        // Filter to only cells with autorun enabled in the current sheet
        const autoRunDependents = dependents.filter(dep => {
          if (dep.sheetId === activeSheet.id) {
            const depCell = currentCells[dep.cellId];
            return depCell && depCell.autoRun && depCell.prompt;
          }
          return false;
        });

        if (autoRunDependents.length > 0) {
          // Run dependent cells sequentially (one at a time) to avoid API rate limiting
          // Only run cells that have ALL their dependencies complete
          const { areAllDependenciesComplete } = await import('./services/cellExecution');
          
          // Process dependents sequentially - wait for each one to complete before starting the next
          // This handles the case where 3 cells depend on 1 cell - they'll run one after another
          for (const dependent of autoRunDependents) {
            if (dependent.sheetId === activeSheet.id && !runningCellsRef.current.has(dependent.cellId)) {
              const depCell = currentCells[dependent.cellId];
              
              // Check if all dependencies of this dependent cell are complete
              if (depCell && depCell.prompt) {
                // Create a proper currentSheet object with the latest cells
                const currentSheetWithCells = {
                  ...activeSheet,
                  cells: currentCells
                };
                
                // Check if all dependencies are complete using the robust function
                const allDepsComplete = await areAllDependenciesComplete(
                  depCell,
                  allSheets,
                  currentSheetWithCells,
                  () => cellsRef.current, // getLatestCells function - always get latest state
                  runningCellsRef.current, // runningCellsSet - check if deps are running
                  user.uid, // userId for loading cross-sheet cells
                  currentProjectId // projectId for loading cross-sheet cells
                );
                
                // Only run if all dependencies are complete
                if (allDepsComplete) {
                  // Wait for this cell to complete before starting the next one
                  // This prevents multiple concurrent API requests
                  try {
                    await handleRunCell(dependent.cellId);
                  } catch (err) {
                    // Continue with next dependent even if this one fails
                  }
                }
              }
            }
          }
        }
      } catch (error) {
      }
    }

    isProcessingAutoRunRef.current = false;
  };

  // Debounce timer for position saves during dragging
  const positionSaveTimers = useRef({});

  const handleDeleteCell = async (cellId) => {
    if (!user || !currentProjectId || !activeSheet) return;
    
    // Clear interval timer if exists
    if (intervalTimersRef.current[cellId]) {
      clearInterval(intervalTimersRef.current[cellId]);
      delete intervalTimersRef.current[cellId];
    }
    
    // Check for dependent cells
    const dependentCells = Object.values(cells).filter(c => {
      if (!c.prompt) return false;
      const deps = parseDependencies(c.prompt);
      return deps.some(dep => {
        // Extract cell ID from dependency reference
        let depId = dep;
        if (dep.includes(':')) depId = dep.split(':').pop();
        if (dep.includes('!')) depId = dep.split('!').pop();
        if (dep.includes('-')) depId = dep.split('-')[0];
        return depId === cellId;
      });
    });
    
    if (dependentCells.length > 0) {
      const dependentIds = dependentCells.map(c => c.cell_id).join(', ');
      if (!window.confirm(`This card is referenced by: ${dependentIds}. Are you sure you want to delete it?`)) {
        return;
      }
    }
    
    try {
      // Delete from Firestore
      const result = await deleteCell(user.uid, currentProjectId, activeSheet.id, cellId);
      if (result.success) {
        // Remove from local state
        setCells(prev => {
          const updated = { ...prev };
          delete updated[cellId];
          return updated;
        });
        
        // Remove connections involving this cell
        setConnections(prev => prev.filter(
          conn => conn.source_cell_id !== cellId && conn.target_cell_id !== cellId
        ));
      } else {
        alert(`Failed to delete card: ${result.error}`);
      }
    } catch (error) {
      alert(`Failed to delete card: ${error.message}`);
    }
  };

  const handleCellPositionChange = (cellId, x, y, isDragEnd = false) => {
    // Check if position actually changed BEFORE calling setState to prevent infinite loops
    const currentCell = cells[cellId] || {};
    if (currentCell.x === x && currentCell.y === y) {
      return; // No change, return early to prevent re-render
    }

    // Use functional update to avoid stale closures
    setCells(prev => {
      const cell = prev[cellId] || {};
      const updatedCell = { ...cell, cell_id: cellId, x, y };
      // Update ref immediately so it's available for saving
      cellsRef.current = { ...cellsRef.current, [cellId]: updatedCell };
      return { ...prev, [cellId]: updatedCell };
    });

    // If dragging ended, save immediately (like master source)
    if (isDragEnd) {
      // Clear any pending debounced save
      if (positionSaveTimers.current[cellId]) {
        clearTimeout(positionSaveTimers.current[cellId]);
        delete positionSaveTimers.current[cellId];
      }
      
      // Save immediately - get latest cell state from ref (ensures we have all cell data)
      if (user && currentProjectId && activeSheet) {
        // Use a small delay to ensure state has updated
        setTimeout(() => {
          const latestCell = cellsRef.current[cellId];
          if (latestCell) {
            // Ensure x and y are numbers, not strings or undefined
            const cellToSave = { 
              ...latestCell, 
      cell_id: cellId,
              x: typeof x === 'number' ? x : parseFloat(x) || 0, 
              y: typeof y === 'number' ? y : parseFloat(y) || 0 
            };
            saveCell(user.uid, currentProjectId, activeSheet.id, cellId, cellToSave).catch(error => {
            });
          }
        }, 0);
      }
      return;
    }

    // During dragging: debounce Firestore saves to prevent write queue overflow
    // Clear existing timer for this cell
    if (positionSaveTimers.current[cellId]) {
      clearTimeout(positionSaveTimers.current[cellId]);
    }

    // Save to Firestore after 1 second of no position changes (only during drag)
    positionSaveTimers.current[cellId] = setTimeout(async () => {
      if (user && currentProjectId && activeSheet) {
        try {
          // Get latest cell state from ref to ensure we have the most recent position
          const latestCell = cellsRef.current[cellId];
          if (latestCell) {
            // Ensure x and y are numbers, not strings or undefined
            const cellToSave = { 
              ...latestCell, 
              cell_id: cellId, 
              x: typeof latestCell.x === 'number' ? latestCell.x : parseFloat(latestCell.x) || 0, 
              y: typeof latestCell.y === 'number' ? latestCell.y : parseFloat(latestCell.y) || 0 
            };
            await saveCell(user.uid, currentProjectId, activeSheet.id, cellId, cellToSave);
          }
          delete positionSaveTimers.current[cellId];
        } catch (error) {
          delete positionSaveTimers.current[cellId];
        }
      }
    }, 1000);
  };

  const handleStopCell = (cellId) => {
    // Get the current cell to find its dependencies
    const cell = cells[cellId];
    const allSheets = sheets.map(s => ({
      ...s,
      cells: s.id === activeSheet.id ? cells : {}
    }));
    
    // Set to collect all cells to stop (the cell itself, its dependencies, and its dependents)
    const cellsToStop = new Set([cellId]);
    
    // 1. Find all dependencies (cells this cell depends on)
    if (cell && cell.prompt) {
      const dependencies = parseDependencies(cell.prompt);
      dependencies.forEach(dep => {
        // Extract cell ID from dependency (handle formats like "prompt:A1", "Sheet2!A1", etc.)
        let ref = dep;
        if (ref.includes(':')) {
          ref = ref.split(':')[1];
        }
        if (ref.includes('!')) {
          // Cross-sheet reference - extract cell ID after !
          ref = ref.split('!')[1];
        }
        // Handle generation specs
        if (ref.includes('-')) {
          ref = ref.split('-')[0];
        }
        if (ref.includes(':')) {
          ref = ref.split(':')[0];
        }
        
        // Check if it's a valid cell reference and if it's running
        if (ref && /^[A-Za-z]+\d+$/.test(ref)) {
          // Check if it's in the current sheet or find it in other sheets
          if (cells[ref] && runningCells.has(ref)) {
            cellsToStop.add(ref);
          } else {
            // Check other sheets for cross-sheet references
            for (const sheet of allSheets) {
              if (sheet.cells && sheet.cells[ref] && runningCells.has(ref)) {
                cellsToStop.add(ref);
                break;
              }
            }
          }
        }
      });
    }
    
    // 2. Find all dependents (cells that depend on this cell)
    const dependents = findDependentCells(cellId, allSheets);
    dependents.forEach(dep => {
      // Only stop dependents that are in the current sheet and currently running
      if (dep.sheetId === activeSheet.id && runningCells.has(dep.cellId)) {
        cellsToStop.add(dep.cellId);
      }
    });
    
    // 3. Stop all collected cells
    setRunningCells(prev => {
      const next = new Set(prev);
      cellsToStop.forEach(id => {
        next.delete(id);
      });
      runningCellsRef.current = next; // Keep ref in sync
      return next;
    });
    
    // Update cell statuses to clear any pending/running status
    setCells(prev => {
      const updated = { ...prev };
      cellsToStop.forEach(id => {
        if (updated[id]) {
          updated[id] = {
            ...updated[id],
            status: null, // Clear status
            jobId: null // Clear job ID if any
          };
        }
      });
      return updated;
    });
    
    // Also update cellsRef
    cellsToStop.forEach(id => {
      if (cellsRef.current[id]) {
        cellsRef.current[id] = {
          ...cellsRef.current[id],
          status: null,
          jobId: null
        };
      }
      // Cancel polling for stopped cells
      cancelPolling(id);
    });
    
    // Save updated cells to Firestore (clear status and jobId)
    if (user && currentProjectId && activeSheet) {
      cellsToStop.forEach(async (id) => {
        const cellToUpdate = cellsRef.current[id];
        if (cellToUpdate) {
          const updatedCell = {
            ...cellToUpdate,
            status: null,
            jobId: null
          };
          try {
            await saveCell(user.uid, currentProjectId, activeSheet.id, id, updatedCell);
          } catch (error) {
          }
        }
      });
    }
    
    // Log which cells were stopped for debugging
    console.log('🛑 Stopped cells:', Array.from(cellsToStop));
  };

  const handleRunCell = async (cellId) => {
    if (!user || !currentProjectId || !activeSheet) return;
    if (runningCells.has(cellId)) return;

    const cell = cells[cellId];
    if (!cell || !cell.prompt) return;

    setRunningCells(prev => {
      const next = new Set(prev);
      next.add(cellId);
      runningCellsRef.current = next; // Keep ref in sync
      return next;
    });

    try {
      const result = await runCell({
        cellId,
        cell,
        userId: user.uid,
        projectId: currentProjectId,
        sheetId: activeSheet.id,
        sheets: sheets.map(s => ({
          ...s,
          cells: s.id === activeSheet.id ? cells : {}
        })),
        currentSheet: { ...activeSheet, cells },
        getLatestCells: () => cellsRef.current, // Provide function to get latest cell state
        runningCellsSet: runningCellsRef.current, // Provide Set of currently running cells
        onProgress: ({ status, cellId: progressCellId, output, error, updatedCell, message }) => {
          if (status === 'complete' && output) {
            // Pass the full updatedCell (including generations) to ensure dependency checker sees completed status
            // Ensure output is set in the cell state
            const finalOutput = updatedCell?.output || output;
            handleCellUpdate(progressCellId, undefined, finalOutput, updatedCell);
            
            // Also directly update cells state to ensure video URL is set immediately
            setCells(prev => ({
              ...prev,
              [progressCellId]: {
                ...prev[progressCellId],
                output: finalOutput,
                status: 'completed',
                ...(updatedCell || {})
              }
            }));
            cellsRef.current = {
              ...cellsRef.current,
              [progressCellId]: {
                ...cellsRef.current[progressCellId],
                output: finalOutput,
                status: 'completed',
                ...(updatedCell || {})
              }
            };
          } else if (status === 'polling' || status === 'pending' || status === 'running') {
            // Update cell state when polling starts or status changes
            if (updatedCell) {
              setCells(prev => ({
                ...prev,
                [progressCellId]: {
                  ...prev[progressCellId],
                  ...updatedCell
                }
              }));
              // Also update ref
              cellsRef.current = {
                ...cellsRef.current,
                [progressCellId]: {
                  ...cellsRef.current[progressCellId],
                  ...updatedCell
                }
              };
            }
          } else if (status === 'error') {
            // Check if error is about insufficient credits
            if (error && error.includes('Insufficient credits')) {
              // Extract credit information from error message
              const creditMatch = error.match(/You need (\d+) credits but only have (\d+)/);
              const needed = creditMatch ? creditMatch[1] : 'some';
              const current = creditMatch ? creditMatch[2] : '0';
              
              // Show user-friendly notification
              setNotification({
                type: 'error',
                title: 'Insufficient Credits',
                message: `You need ${needed} credit${needed !== '1' ? 's' : ''} to run this cell, but you only have ${current}. Please upgrade your subscription to continue.`,
                showUpgrade: true
              });
              
              // Automatically open subscription modal
              setShowSubscription(true);
            } else {
              // Show generic error notification
              setNotification({
                type: 'error',
                title: 'Error',
                message: error || 'An error occurred while running the cell.',
                showUpgrade: false
              });
            }
          }
        }
      });

      // Check if result needs polling (async job like video generation)
      if (result.needsPolling && result.jobId) {
        // Update local state immediately to show loading status
        const updatedCellWithStatus = {
          ...cell,
          status: 'pending',
          jobId: result.jobId
        };
        
        // Update cells state immediately so UI shows loading
        setCells(prev => ({
          ...prev,
          [cellId]: updatedCellWithStatus
        }));
        
        // Also update cellsRef for consistency
        cellsRef.current = {
          ...cellsRef.current,
          [cellId]: updatedCellWithStatus
        };
        // Start polling immediately
        pollJobStatus({
          cellId,
          cell: updatedCellWithStatus,
          jobId: result.jobId,
          userId: user.uid,
          projectId: currentProjectId,
          sheetId: activeSheet.id,
          onProgress: ({ status, cellId: progressCellId, output, error, updatedCell }) => {
            if (status === 'complete' && output) {
              // Ensure output is set in the cell state
              const finalOutput = updatedCell?.output || output;
              handleCellUpdate(progressCellId, undefined, finalOutput, updatedCell);
              
              // Also directly update cells state to ensure video URL is set immediately
              setCells(prev => ({
                ...prev,
                [progressCellId]: {
                  ...prev[progressCellId],
                  output: finalOutput,
                  status: 'completed',
                  ...(updatedCell || {})
                }
              }));
              cellsRef.current = {
                ...cellsRef.current,
                [progressCellId]: {
                  ...cellsRef.current[progressCellId],
                  output: finalOutput,
                  status: 'completed',
                  ...(updatedCell || {})
                }
              };
            } else if (status === 'error') {
              handleCellUpdate(progressCellId, undefined, `Error: ${error}`, updatedCell);
            } else if (status === 'polling' || status === 'running' || status === 'pending') {
              // Update status in cells during polling
              setCells(prev => ({
                ...prev,
                [progressCellId]: {
                  ...prev[progressCellId],
                  status: updatedCell?.status || status || 'running'
                }
              }));
              // Also update ref
              cellsRef.current = {
                ...cellsRef.current,
                [progressCellId]: {
                  ...cellsRef.current[progressCellId],
                  status: updatedCell?.status || status || 'running'
                }
              };
            }
          }
        });
      }

      if (result.success) {
        // Cell output already updated via onProgress callback
        // Wait a bit for state to update, then check for dependent cells with autorun
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Always check for dependent cells with autorun (like master source)
        // The master source calls runDependentCells after every cell run
        // and filters to only run cells with autorun enabled
        // Use cellsRef to get the latest cells state
        const currentCells = cellsRef.current;
        const allSheets = sheets.map(s => ({
          ...s,
          cells: s.id === activeSheet.id ? currentCells : {}
        }));
        const dependents = findDependentCells(cellId, allSheets);
        
        // Filter to only cells with autorun enabled in the current sheet
        const autoRunDependents = dependents.filter(dep => {
          if (dep.sheetId === activeSheet.id) {
            const depCell = currentCells[dep.cellId];
            return depCell && depCell.autoRun && depCell.prompt;
          }
          return false;
        });

        // Run dependent cells sequentially (one at a time)
        // Only run cells that have ALL their dependencies complete
        // Use the same robust dependency checking logic as runCell
        const { areAllDependenciesComplete } = await import('./services/cellExecution');
        
        for (const dependent of autoRunDependents) {
          if (dependent.sheetId === activeSheet.id && !runningCells.has(dependent.cellId)) {
            const depCell = currentCells[dependent.cellId];
            
            // Check if all dependencies of this dependent cell are complete
            // Use the same robust function that runCell uses for consistency
            if (depCell && depCell.prompt) {
              // Create a proper currentSheet object with the latest cells
              const currentSheetWithCells = {
                ...activeSheet,
                cells: currentCells
              };
              
              // Check if all dependencies are complete using the robust function
              // This handles: cross-sheet refs, generation refs, running cells, proper validation
              const allDepsComplete = await areAllDependenciesComplete(
                depCell,
                allSheets,
                currentSheetWithCells,
                () => cellsRef.current, // getLatestCells function - always get latest state
                runningCellsRef.current, // runningCellsSet - check if deps are running
                user.uid, // userId for loading cross-sheet cells
                currentProjectId // projectId for loading cross-sheet cells
              );
              
              // Only run if all dependencies are complete
              if (allDepsComplete) {
                // Recursively run dependent cell (it will trigger its own dependents if they have autorun)
                await handleRunCell(dependent.cellId);
              }
            }
          }
        }
      }
    } catch (error) {
      // Check if error is about insufficient credits
      const errorMessage = error?.message || error?.toString() || '';
      if (errorMessage.includes('Insufficient credits')) {
        // Extract credit information from error message
        const creditMatch = errorMessage.match(/You need (\d+) credits but only have (\d+)/);
        const needed = creditMatch ? creditMatch[1] : 'some';
        const current = creditMatch ? creditMatch[2] : '0';
        
        // Show user-friendly notification
        setNotification({
          type: 'error',
          title: 'Insufficient Credits',
          message: `You need ${needed} credit${needed !== '1' ? 's' : ''} to run this cell, but you only have ${current}. Please upgrade your subscription to continue.`,
          showUpgrade: true
        });
        
        // Automatically open subscription modal
        setShowSubscription(true);
      } else {
        // Show generic error notification
        setNotification({
          type: 'error',
          title: 'Error',
          message: errorMessage || 'An error occurred while running the cell.',
          showUpgrade: false
        });
      }
    } finally {
      setRunningCells(prev => {
        const next = new Set(prev);
        next.delete(cellId);
        runningCellsRef.current = next; // Keep ref in sync
        return next;
      });
    }
  };

  // Helper function to generate next available cell reference (A1, B1, C1, etc.)
  const getNextCellReference = () => {
    // Filter to only cell references that match the pattern A1, B1, C1, etc.
    const existingRefs = Object.keys(cells).filter(id => /^[A-Z]\d+$/.test(id));
    
    if (existingRefs.length === 0) {
      return 'A1';
    }
    
    // Parse existing references to find the next available
    const refMap = new Map();
    existingRefs.forEach(ref => {
      const col = ref.charAt(0);
      const row = parseInt(ref.substring(1));
      if (!refMap.has(col)) {
        refMap.set(col, []);
      }
      refMap.get(col).push(row);
    });
    
    // Try columns A-Z
    for (let col = 65; col <= 90; col++) {
      const colChar = String.fromCharCode(col);
      const rows = refMap.get(colChar) || [];
      
      if (rows.length === 0) {
        return `${colChar}1`;
      }
      
      // Find first missing row number
      const sortedRows = rows.sort((a, b) => a - b);
      for (let row = 1; row <= sortedRows[sortedRows.length - 1] + 1; row++) {
        if (!sortedRows.includes(row)) {
          return `${colChar}${row}`;
        }
      }
    }
    
    // If all columns are used, start with A and increment row
    const allRows = Array.from(refMap.values()).flat();
    if (allRows.length > 0) {
      const maxRow = Math.max(...allRows);
      return `A${maxRow + 1}`;
    }
    
    return 'A1';
  };

  const addCard = async (x = null, y = null, cellData = {}, specifiedCellId = null) => {
    if (!activeSheet || !user || !currentProjectId) return;
    
    // Use specified cell ID (from template) or generate next available reference (A1, B1, etc.)
    const cellId = specifiedCellId || getNextCellReference();
    
    const newCell = {
      cell_id: cellId, // This is the reference (A1, B1, etc.) - never changes
      prompt: cellData.prompt || '',
      output: '',
      x: x !== null ? x : (100 + (Math.random() * 50)),
      y: y !== null ? y : (100 + (Math.random() * 50)),
      model: cellData.model || defaultModel,
      temperature: cellData.temperature !== undefined ? cellData.temperature : defaultTemperature,
      characterLimit: cellData.characterLimit !== undefined ? cellData.characterLimit : 0,
      outputFormat: cellData.outputFormat || '',
      autoRun: cellData.autoRun !== undefined ? cellData.autoRun : false,
      interval: cellData.interval !== undefined ? cellData.interval : 0,
      enableTools: cellData.enableTools ?? false,
      enabledTools: cellData.enabledTools && typeof cellData.enabledTools === 'object' ? cellData.enabledTools : undefined,
      schedule: cellData.schedule || null,
      name: cellData.name || '', // Display name/title - can be changed by user
      generations: []
    };

    setCells(prev => ({ ...prev, [cellId]: newCell }));

    try {
      await saveCell(user.uid, currentProjectId, activeSheet.id, cellId, newCell);
      return cellId;
    } catch (error) {
      return null;
    }
  };

  const clearCurrentSheetCells = async () => {
    if (!user || !currentProjectId || !activeSheet) return;
    const ids = Object.keys(cells);
    for (const cellId of ids) {
      try {
        await deleteCell(user.uid, currentProjectId, activeSheet.id, cellId);
      } catch {
        // continue
      }
    }
    flushSync(() => {
      setCells({});
      setConnections([]);
    });
    cellsRef.current = {};
  };

  const handleRunOrchestrator = async () => {
    const goal = orchestratorPrompt.trim();
    if (!goal || !user || !currentProjectId || !activeSheet) {
      setNotification({
        type: 'error',
        title: 'Orchestrator',
        message: 'Describe your task and ensure a sheet is open.',
        showUpgrade: false
      });
      return;
    }

    setOrchestratorRunning(true);
    const runEvents = [];
    try {
      const hadCells = Object.keys(cells).length > 0;
      if (hadCells) {
        const ok = window.confirm(
          'Replace all cards on this sheet with the workflow the orchestrator selects or creates?'
        );
        if (!ok) {
          setOrchestratorRunning(false);
          return;
        }
        await clearCurrentSheetCells();
      }

      setOrchestratorHandoffLog([]);
      const maxPhases = Math.min(Math.max(Number(orchestratorMaxPhases) || 5, 1), 10);

      const pipeline = await runOrchestratorHandoffPipeline(goal, availableModels, {
        maxPhases,
        onProgress: (ev) => {
          runEvents.push(ev);
          setOrchestratorHandoffLog((prev) => [...prev, ev]);
        }
      });

      if (!pipeline.success) {
        setNotification({
          type: 'error',
          title: 'Orchestrator failed',
          message: pipeline.error || 'Could not build workflows.',
          showUpgrade: false
        });
        return;
      }

      const phases = pipeline.phases || [];
      if (phases.length === 0) {
        setNotification({
          type: 'info',
          title: 'Orchestrator',
          message: pipeline.summary || 'No template phases were needed.',
          showUpgrade: false
        });
        setShowOrchestratorModal(false);
        setOrchestratorPrompt('');
        return;
      }

      for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        setOrchestratorHandoffLog((prev) => [
          ...prev,
          { type: 'applying', phase: i + 1, total: phases.length, templateName: p.template.name }
        ]);
        if (i > 0) {
          await clearCurrentSheetCells();
        }
        await applyTemplate(p.template, { skipEmptySheetCheck: true });
      }

      const last = phases[phases.length - 1];
      const parts = phases.map(
        (p, idx) =>
          `Phase ${idx + 1}: ${p.template.name}${p.source === 'generated' ? ' (saved)' : ''}`
      );
      let msg = parts.join(' → ');
      if (pipeline.finished && pipeline.stopReason === 'goal_met') {
        msg += `. ${pipeline.summary || 'Goal addressed.'}`;
      } else if (pipeline.stopReason === 'max_phases') {
        msg += `. ${pipeline.summary || ''}`;
      }
      setNotification({
        type: 'success',
        title: 'Orchestrator',
        message: msg,
        showUpgrade: false
      });
      setShowOrchestratorModal(false);
      setOrchestratorPrompt('');

      const phaseSummaries = phases.map((p, idx) => ({
        phase: idx + 1,
        instruction: p.instruction,
        templateId: p.template?.id,
        templateName: p.template?.name,
        source: p.source,
        matchReason: p.matchReason,
        plannerReason: p.plannerReason
      }));
      const report = {
        goal,
        completedAt: new Date().toISOString(),
        finished: pipeline.finished === true,
        stopReason: pipeline.stopReason,
        summary: pipeline.summary,
        maxPhases,
        phases: phaseSummaries,
        progressEvents: [...runEvents]
      };
      try {
        sessionStorage.setItem(
          orchestratorReportStorageKey(user.uid, currentProjectId, activeSheet.id),
          JSON.stringify(report)
        );
      } catch {
        // ignore quota / private mode
      }
      setOrchestratorRunReport(report);
      setOrchestratorHandoffLog([]);
    } catch (e) {
      setNotification({
        type: 'error',
        title: 'Orchestrator error',
        message: e.message || 'Something went wrong.',
        showUpgrade: false
      });
    } finally {
      setOrchestratorRunning(false);
    }
  };

  // Helper function to get active model by type
  const getActiveModelByType = (type, preferredModelId = null) => {
    const activeModelsOfType = availableModels.filter(model => {
      const modelType = getModelType(model.id || model.originalId || '');
      return modelType === type && (model.isActive !== false && model.status !== 'inactive');
    });

    if (activeModelsOfType.length === 0) {
      return null;
    }

    // If preferred model is specified and available, use it
    if (preferredModelId) {
      const preferred = activeModelsOfType.find(m => 
        (m.id === preferredModelId || m.originalId === preferredModelId)
      );
      if (preferred) {
        return preferred.id || preferred.originalId;
      }
    }

    // Return the first active model of this type
    return activeModelsOfType[0].id || activeModelsOfType[0].originalId;
  };

  const applyTemplate = async (template, options = {}) => {
    const { skipEmptySheetCheck = false } = options;
    if (!activeSheet || !user || !currentProjectId) return;

    // Check if the sheet already has cards
    const existingCellsCount = Object.keys(cells).length;
    if (!skipEmptySheetCheck && existingCellsCount > 0) {
      setNotification({
        type: 'error',
        title: 'Cannot Apply Template',
        message: 'Templates can only be applied to empty sheets. Please create a new sheet or remove existing cards first.',
        showUpgrade: false
      });
      return;
    }

    try {
      const baseX = 100;
      const baseY = 100;
      const spacing = 300;

      // Create all cells first with their specified cell references (A1, B1, etc.)
      for (let i = 0; i < template.cells.length; i++) {
        const cellTemplate = template.cells[i];
        const x = cellTemplate.x !== undefined ? cellTemplate.x : (baseX + (i % 3) * spacing);
        const y = cellTemplate.y !== undefined ? cellTemplate.y : (baseY + Math.floor(i / 3) * 250);
        
        // Use cell reference (A1, B1, etc.) as the cell ID, or generate one if not specified
        const cellId = cellTemplate.cellId || cellTemplate.cellReference || `CARD_${Date.now()}_${i}`;
        
        // Determine model type from template (use modelType if available, otherwise infer from model/preferredModel)
        const templateModelType = cellTemplate.modelType || getModelType(cellTemplate.model || cellTemplate.preferredModel || '');
        const preferredModel = cellTemplate.preferredModel || cellTemplate.model;
        
        // Get active model of the required type
        let selectedModel = defaultModel;
        if (templateModelType === 'image') {
          const imageModel = getActiveModelByType('image', preferredModel);
          if (!imageModel) {
            throw new Error('No active image generation models available. Please activate at least one image model in the admin dashboard.');
          }
          selectedModel = imageModel;
        } else if (templateModelType === 'video') {
          const videoModel = getActiveModelByType('video', preferredModel);
          if (!videoModel) {
            throw new Error('No active video generation models available. Please activate at least one video model in the admin dashboard.');
          }
          selectedModel = videoModel;
        } else if (templateModelType === 'audio') {
          const audioModel = getActiveModelByType('audio', preferredModel);
          if (!audioModel) {
            throw new Error('No active audio generation models available. Please activate at least one audio model in the admin dashboard.');
          }
          selectedModel = audioModel;
        } else {
          // For text models, try to use the preferred model or fallback to default
          const textModel = getActiveModelByType('text', preferredModel);
          if (!textModel) {
            throw new Error('No active text generation models available. Please activate at least one text model in the admin dashboard.');
          }
          selectedModel = textModel;
        }
        
        // Use the prompt as-is (it should already contain {{A1}}, {{B1}}, etc. references)
        await addCard(x, y, {
          prompt: cellTemplate.prompt || '',
          model: selectedModel,
          temperature: cellTemplate.temperature !== undefined ? cellTemplate.temperature : defaultTemperature,
          characterLimit: cellTemplate.characterLimit !== undefined ? cellTemplate.characterLimit : 0,
          outputFormat: cellTemplate.outputFormat || '',
          autoRun: cellTemplate.autoRun !== undefined ? cellTemplate.autoRun : false,
          interval: cellTemplate.interval !== undefined ? cellTemplate.interval : 0,
          enableTools: cellTemplate.enableTools ?? false,
          enabledTools: cellTemplate.enabledTools || undefined,
          schedule: cellTemplate.schedule || null,
          name: cellTemplate.name || ''
        }, cellId);
      }

      setNotification({
        type: 'success',
        title: 'Template Applied',
        message: `Created ${template.cells.length} cards from "${template.name}" template`,
        showUpgrade: false
      });
    } catch (error) {
      setNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to apply template: ' + error.message,
        showUpgrade: false
      });
    }
  };

  // Convert cells object to array for Canvas component
  // Sort cells by cell_id (A1, A2, B1, B2, etc.)
  const sortCellsByID = (cells) => {
    return Object.values(cells).sort((a, b) => {
      const idA = a.cell_id || '';
      const idB = b.cell_id || '';
      
      // Extract column (letter) and row (number) from cell ID
      const matchA = idA.match(/^([A-Z]+)(\d+)$/);
      const matchB = idB.match(/^([A-Z]+)(\d+)$/);
      
      if (!matchA || !matchB) {
        // If format doesn't match, sort alphabetically
        return idA.localeCompare(idB);
      }
      
      const colA = matchA[1];
      const colB = matchB[1];
      const rowA = parseInt(matchA[2], 10);
      const rowB = parseInt(matchB[2], 10);
      
      // First compare by column (A, B, C, etc.)
      if (colA !== colB) {
        return colA.localeCompare(colB);
      }
      
      // Then compare by row number
      return rowA - rowB;
    });
  };

  const cellsArray = sortCellsByID(cells);

  const handleDownloadSheet = async (selectedGenerations = null) => {
    if (!activeSheet || cellsArray.length === 0) {
      alert('No cells to download. Add some cards to the sheet first.');
      return;
    }

    // If no selections provided, show the selection modal
    if (selectedGenerations === null) {
      setShowGenerationSelect(true);
      return;
    }

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
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const sheetName = activeSheet.name || 'Sheet';
      doc.text(sheetName, margin, yPos);
      yPos += 10;

      // Sheet info
      addText(`Generated on ${new Date().toLocaleString()}`, 9, false, [100, 100, 100]);
      addText(`Total Cards: ${cellsArray.length}`, 9, false, [100, 100, 100]);
      yPos += 10;

      // Process each cell in order, including only selected generations
      let cellIndex = 0;
      cellsArray.forEach((cell) => {
        const cellSelections = selectedGenerations[cell.cell_id] || { currentOutput: false, generations: {} };
        const hasCurrentOutput = cellSelections.currentOutput && cell.output && cell.output.trim() !== '';
        const selectedGenIndices = cell.generations && Array.isArray(cell.generations)
          ? Object.keys(cellSelections.generations || {})
              .map(Number)
              .filter(idx => cellSelections.generations[idx] && idx < cell.generations.length)
              .sort((a, b) => a - b)
          : [];
        
        // Skip cell if nothing is selected
        if (!hasCurrentOutput && selectedGenIndices.length === 0) {
          return;
        }

        checkPageBreak(30);
        
        // Cell separator
        if (cellIndex > 0) {
          yPos += 5;
          doc.setDrawColor(200, 200, 200);
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 10;
        }
        cellIndex++;

        // Cell header
        const cellTitle = cell.name || `Cell ${cell.cell_id}`;
        addText(cellTitle, 14, true, [0, 0, 0]);
        addText(`ID: ${cell.cell_id}`, 10, false, [100, 100, 100]);
        yPos += 3;

        // Prompt
        if (cell.prompt) {
          checkPageBreak(15);
          addText('PROMPT', 11, true, [50, 50, 150]);
          addText(cell.prompt, 10, false, [0, 0, 0]);
          yPos += 3;
        }

        // Model and settings
        checkPageBreak(15);
        const modelName = availableModels.find(m => 
          m.id === cell.model || 
          m.originalId === cell.model ||
          m.id === cell.model?.split('/')?.pop()
        )?.name || cell.model || 'GPT-3.5';
        
        addText('SETTINGS', 11, true, [50, 50, 150]);
        addText(`Model: ${modelName}`, 9, false, [0, 0, 0]);
        if (cell.temperature !== undefined) {
          addText(`Temperature: ${cell.temperature}`, 9, false, [0, 0, 0]);
        }
        if (cell.characterLimit) {
          addText(`Character Limit: ${cell.characterLimit}`, 9, false, [0, 0, 0]);
        }
        if (cell.outputFormat) {
          addText(`Output Format: ${cell.outputFormat}`, 9, false, [0, 0, 0]);
        }
        yPos += 3;

        // Current output (if selected)
        if (hasCurrentOutput) {
          checkPageBreak(20);
          addText('CURRENT OUTPUT', 11, true, [50, 50, 150]);
          
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
          yPos += 3;
        }

        // Selected generations only
        if (selectedGenIndices.length > 0) {
          checkPageBreak(15);
          addText(`GENERATIONS (${selectedGenIndices.length} selected)`, 11, true, [150, 50, 50]);
          
          selectedGenIndices.forEach((genIndex, idx) => {
            const gen = cell.generations[genIndex];
            if (!gen) return;
            
            checkPageBreak(20);
            
            addText(`Generation ${genIndex + 1}`, 10, true, [100, 100, 100]);
            
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
              addText(`Generated: ${timestamp}`, 8, false, [120, 120, 120]);
            }
            
            // Output
            if (gen.output) {
              const isMediaUrl = gen.output.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg)/i) || 
                                gen.output.startsWith('data:');
              
              if (isMediaUrl) {
                addText(`[Media URL: ${gen.output.substring(0, 80)}...]`, 9, false, [120, 120, 120]);
              } else {
                const cleanOutput = gen.output
                  .replace(/#{1,6}\s+/g, '')
                  .replace(/\*\*(.+?)\*\*/g, '$1')
                  .replace(/\*(.+?)\*/g, '$1')
                  .replace(/`(.+?)`/g, '$1')
                  .replace(/\[(.+?)\]\(.+?\)/g, '$1');
                
                addText(cleanOutput, 9, false, [0, 0, 0]);
              }
            }
            
            if (idx < selectedGenIndices.length - 1) {
              yPos += 2;
              doc.setDrawColor(220, 220, 220);
              doc.line(margin + 5, yPos, pageWidth - margin - 5, yPos);
              yPos += 3;
            }
          });
        }
      });

      // Orchestrator activity (planning log + phase templates) when this sheet was built via Orchestrator
      const orchReport = orchestratorRunReport;
      if (
        orchReport &&
        activeSheet &&
        orchReport.phases &&
        Array.isArray(orchReport.phases) &&
        orchReport.phases.length > 0
      ) {
        checkPageBreak(40);
        yPos += 8;
        doc.setDrawColor(180, 180, 180);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 12;

        addText('ORCHESTRATOR ACTIVITY', 16, true, [0, 80, 120]);
        const goalLine =
          typeof orchReport.goal === 'string' && orchReport.goal.trim()
            ? orchReport.goal.trim()
            : '(no goal text stored)';
        addText(`Main goal: ${goalLine}`, 10, false, [0, 0, 0]);
        if (orchReport.completedAt) {
          try {
            addText(
              `Orchestrator completed: ${new Date(orchReport.completedAt).toLocaleString()}`,
              9,
              false,
              [100, 100, 100]
            );
          } catch {
            addText(`Orchestrator completed: ${orchReport.completedAt}`, 9, false, [100, 100, 100]);
          }
        }
        const statusBits = [
          orchReport.finished ? 'finished' : 'not finished',
          orchReport.stopReason ? `stop: ${orchReport.stopReason}` : ''
        ]
          .filter(Boolean)
          .join(' · ');
        if (statusBits) addText(statusBits, 9, false, [100, 100, 100]);
        if (orchReport.summary) {
          addText(`Summary: ${orchReport.summary}`, 10, false, [0, 0, 0]);
        }
        yPos += 5;

        addText('Phases (templates applied)', 12, true, [50, 50, 150]);
        orchReport.phases.forEach((ph, i) => {
          checkPageBreak(28);
          const title = ph.templateName || ph.templateId || `Phase ${i + 1}`;
          addText(
            `Phase ${ph.phase != null ? ph.phase : i + 1}: ${title}`,
            11,
            true,
            [0, 0, 0]
          );
          if (ph.instruction) addText(`Instruction: ${ph.instruction}`, 9, false, [0, 0, 0]);
          if (ph.templateId) addText(`Template ID: ${ph.templateId}`, 8, false, [120, 120, 120]);
          if (ph.source) addText(`Source: ${ph.source}`, 8, false, [120, 120, 120]);
          if (ph.matchReason) addText(`Template match: ${ph.matchReason}`, 8, false, [120, 120, 120]);
          if (ph.plannerReason) addText(`Planner note: ${ph.plannerReason}`, 8, false, [120, 120, 120]);
          yPos += 4;
        });

        const evs = orchReport.progressEvents;
        if (Array.isArray(evs) && evs.length > 0) {
          checkPageBreak(24);
          addText('Planning & execution log', 12, true, [50, 50, 150]);
          evs.forEach((ev) => {
            const line = formatOrchestratorEventForPdf(ev);
            if (line) addText(`• ${line}`, 9, false, [60, 60, 60]);
          });
        }
        yPos += 5;
      }

      // Footer
      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${totalPages} - ${sheetName} - Generated on ${new Date().toLocaleString()}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }

      // Save PDF
      const fileName = `${sheetName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      console.log('✅ Sheet PDF generated successfully');
    } catch (error) {
      console.error('❌ Error generating sheet PDF:', error);
      alert(`Failed to generate PDF: ${error.message}`);
    }
  };

  // Show login screen if not authenticated
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center mesh-gradient">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Demo cards data - all related to launching a Smart Task Management App
    const demoCards = [
      {
        id: 'A1',
        name: 'Product Concept',
        prompt: 'Define the core concept for a smart task management app',
        output: '**SmartTask - AI-Powered Task Management**\n\nA task management app that uses AI to:\n- Auto-prioritize tasks based on deadlines & importance\n- Suggest optimal work schedules\n- Break down complex projects into actionable steps\n- Learn from user patterns to improve suggestions\n- Integrate with calendar, email, and productivity tools\n\n**Key Differentiator:** Proactive AI assistant vs reactive task lists',
        x: 50,
        y: 50,
        width: 300
      },
      {
        id: 'B1',
        name: 'Marketing Strategy',
        prompt: 'Create a 3-month marketing strategy for SmartTask launch',
        output: '**Month 1: Foundation**\n- Launch website & SEO optimization\n- Content marketing: 8 blog posts on productivity\n- Social media presence (LinkedIn, Twitter)\n- Product Hunt launch preparation\n\n**Month 2: Growth**\n- Paid ads: Google & Facebook targeting professionals\n- Webinar series: "Master Your Productivity"\n- Influencer partnerships with productivity coaches\n\n**Month 3: Scale**\n- Referral program launch (invite 3, get premium)\n- Case studies & user testimonials\n- Email marketing campaigns to early adopters',
        x: 1660,
        y: 80,
        width: 300
      },
      {
        id: 'C1',
        name: 'User Personas',
        prompt: 'Define 3 user personas for SmartTask app',
        output: '**Persona 1: Sarah, 28 - Busy Professional**\n- Marketing manager, juggles 10+ projects\n- Values: Time-saving, automation, mobile access\n- Goals: Reduce overwhelm, meet deadlines\n- Pain: Too many tools, tasks slip through cracks\n\n**Persona 2: Mike, 35 - Freelancer**\n- Works with multiple clients, needs organization\n- Values: Simplicity, affordability, flexibility\n- Goals: Track all client work, never miss deadlines\n\n**Persona 3: Lisa, 42 - Team Lead**\n- Manages 5-person team, needs visibility\n- Values: Collaboration, reporting, integrations\n- Goals: Team alignment, project transparency',
        x: 1275,
        y: 679,
        width: 300
      },
      {
        id: 'A2',
        name: 'Content Ideas',
        prompt: 'Generate 10 blog post ideas for SmartTask marketing',
        output: '1. "5 Ways AI Can Transform Your Task Management"\n2. "Why Traditional To-Do Lists Fail (And What Works Instead)"\n3. "How to Prioritize Tasks When Everything Feels Urgent"\n4. "The Psychology of Productivity: What Science Says"\n5. "Task Management for Remote Teams: Best Practices"\n6. "From Overwhelmed to Organized: A 30-Day Guide"\n7. "The Hidden Cost of Context Switching"\n8. "How Successful People Manage Their Daily Tasks"\n9. "Task Management Tools Comparison: 2024 Edition"\n10. "Building Better Work Habits with SmartTask"',
        x: 1827,
        y: 617,
        width: 300
      },
      {
        id: 'B2',
        name: 'Feature List',
        prompt: 'List key features for SmartTask app',
        output: '**Core Features:**\n✓ AI-powered task prioritization\n✓ Smart scheduling suggestions\n✓ Project breakdown automation\n✓ Real-time collaboration\n✓ Calendar & email integration\n✓ Mobile apps (iOS & Android)\n✓ Custom workflows & templates\n✓ Progress tracking & analytics\n✓ Team workspaces\n✓ Slack, Google Workspace integrations\n✓ Recurring task automation\n✓ Deadline reminders & notifications',
        x: 400,
        y: 628,
        width: 300
      },
      {
        id: 'C2',
        name: 'Competitive Analysis',
        prompt: 'Analyze top 3 competitors in the task management space',
        output: '**1. Asana**\nStrengths: Robust features, great for teams\nWeaknesses: Complex, expensive, learning curve\n\n**2. Todoist**\nStrengths: Simple, clean interface, natural language\nWeaknesses: Limited AI, basic collaboration\n\n**3. Notion**\nStrengths: All-in-one workspace, flexible\nWeaknesses: Not task-focused, can be overwhelming\n\n**Our Opportunity:**\nAI-first approach with intelligent automation that competitors lack. Focus on reducing cognitive load rather than adding features.',
        x: 1000,
        y: 39,
        width: 300
      }
    ];

    // Demo connections (showing relationships between cards)
    const demoConnections = [
      { from: 'A1', to: 'B1' }, // Product Ideas -> Marketing Strategy
      { from: 'A1', to: 'C1' }, // Product Ideas -> User Personas
      { from: 'B1', to: 'A2' }, // Marketing Strategy -> Content Ideas
      { from: 'C1', to: 'B2' }, // User Personas -> Feature List
      { from: 'B2', to: 'C2' }, // Feature List -> Competitive Analysis
    ];

    // Helper to get connection port coordinates
    const getPortCoords = (cardId, type) => {
      const card = demoCards.find(c => c.id === cardId);
      if (!card) return { x: 0, y: 0 };
      const cardWidth = card.width;
      const offsetY = 50; // Middle of header
      if (type === 'source') return { x: card.x + cardWidth, y: card.y + offsetY };
      if (type === 'target') return { x: card.x, y: card.y + offsetY };
      return { x: 0, y: 0 };
    };

    // Render connection path
    const renderConnection = (from, to) => {
      const start = getPortCoords(from, 'source');
      const end = getPortCoords(to, 'target');
      const deltaX = Math.abs(end.x - start.x);
      const controlPoint1 = { x: start.x + deltaX * 0.5, y: start.y };
      const controlPoint2 = { x: end.x - deltaX * 0.5, y: end.y };
      const pathData = `M ${start.x} ${start.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${end.x} ${end.y}`;
      
      return (
        <path
          key={`${from}-${to}`}
          d={pathData}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeDasharray="5,5"
          opacity={0.6}
          markerEnd="url(#arrowhead-demo)"
        />
      );
    };

    return (
      <div className="h-screen flex items-center justify-center mesh-gradient relative overflow-hidden">
        {/* Demo cards and connections behind login */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          {/* SVG for connections */}
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            style={{ zIndex: 0 }}
          >
            <defs>
              <marker
                id="arrowhead-demo"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" opacity="0.6" />
              </marker>
            </defs>
            {demoConnections.map(conn => renderConnection(conn.from, conn.to))}
          </svg>

          {/* Demo Cards */}
          {demoCards.map(card => (
            <div
              key={card.id}
              className="glass-card rounded-2xl flex flex-col absolute"
              style={{
                width: `${card.width}px`,
                left: `${card.x}px`,
                top: `${card.y}px`,
                minHeight: '200px',
                opacity: 0.75
              }}
            >
              {/* Card Header with icon */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
                    <span className="text-xs font-mono text-blue-400 font-bold">{card.id}</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{card.name}</span>
                </div>
              </div>
              
              {/* Card Content */}
              <div className="p-4 flex-1 overflow-y-auto">
                <div className="text-xs text-gray-400 mb-2 italic line-clamp-2">{card.prompt}</div>
                <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {card.output}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Login box */}
        <div className="glass-panel p-8 rounded-2xl max-w-md w-full mx-4 relative z-10">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mx-auto mb-4">
              <Box size={32} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Draftai</h1>
            <p className="text-gray-400">AI-powered brainstorming</p>
          </div>
          <button
            onClick={async () => {
              const result = await signInWithGoogle();
              if (!result.success) {
                alert(result.error || 'Failed to sign in');
              }
            }}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
          >
            <User size={20} />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Show admin dashboard if requested
  if (showAdmin && user) {
    return (
      <AdminDashboard 
        user={user} 
        onBack={() => setShowAdmin(false)}
      />
    );
  }

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="h-screen flex flex-col mesh-gradient text-white font-sans overflow-hidden">
      {/* Mobile nav backdrop */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px] lg:hidden"
          onClick={closeMobileNav}
        />
      )}

      {/* Mobile slide-out menu */}
      <aside
        id="mobile-app-nav"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[min(20rem,88vw)] max-w-full flex-col border-r border-white/10 bg-gray-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold tracking-wide text-white">Menu</span>
          <button
            type="button"
            onClick={closeMobileNav}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3">
          {connectingSource && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/20 px-3 py-2.5 text-xs font-medium text-blue-100 animate-pulse">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-400 align-middle" />
              Select target to connect
            </div>
          )}
          {userCredits && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2.5">
              <Sparkles size={16} className="shrink-0 text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">
                {userCredits.credits?.current || 0} credits
              </span>
            </div>
          )}
          {user && currentProjectId && (
            <button
              type="button"
              onClick={() => {
                navigate('/projects');
                closeMobileNav();
              }}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-medium text-gray-200 hover:bg-white/10"
            >
              <FolderOpen size={18} />
              Projects
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              addCard();
              closeMobileNav();
            }}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-blue-600 px-3 py-2.5 text-left text-sm font-semibold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500"
          >
            <Plus size={18} />
            Add Card
          </button>
          <button
            type="button"
            onClick={() => {
              handleDownloadSheet();
              closeMobileNav();
            }}
            disabled={!activeSheet || cellsArray.length === 0}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-purple-600 px-3 py-2.5 text-left text-sm font-semibold text-white shadow-lg shadow-purple-900/20 hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-gray-600"
          >
            <FileText size={18} />
            Download Sheet
          </button>
          <button
            type="button"
            onClick={() => {
              setShowOrchestratorModal(true);
              closeMobileNav();
            }}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-700/90 px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-amber-600"
          >
            <Workflow size={18} />
            Orchestrator
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTemplates(true);
              closeMobileNav();
            }}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2.5 text-left text-sm font-semibold text-white hover:from-purple-500 hover:to-pink-500"
          >
            <Sparkles size={18} />
            Templates
          </button>
        </div>
      </aside>

      {/* Toolbar / Header */}
      <div className="relative z-50 flex h-14 shrink-0 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6 glass-panel pointer-events-auto sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen((o) => !o)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-200 hover:bg-white/10 lg:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-app-nav"
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            <Menu size={22} strokeWidth={2} />
          </button>
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20 sm:h-10 sm:w-10">
              <Box size={22} strokeWidth={2.5} className="sm:hidden" />
              <Box size={24} strokeWidth={2.5} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex flex-col">
              <h1 className="truncate text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300 sm:text-xl">
                Draftai
              </h1>
              <span className="hidden text-[10px] font-medium uppercase tracking-wider text-gray-400 sm:block">
                Beta v2.0
              </span>
            </div>
          </div>

          {user && currentProjectId && (
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="ml-1 hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-gray-300 transition-all hover:bg-white/10 hover:text-white lg:flex"
              title="Manage projects"
            >
              <FolderOpen size={16} />
              Projects
            </button>
          )}

          {connectingSource && (
            <div className="ml-2 hidden max-w-[14rem] items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/20 px-3 py-1 animate-pulse lg:flex">
              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
              <span className="truncate text-xs font-medium text-blue-200">Select target to connect</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {userCredits && (
            <div className="hidden items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 lg:flex">
              <Sparkles size={14} className="text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">
                {userCredits.credits?.current || 0} Credits
              </span>
            </div>
          )}
          {userCredits && (
            <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1.5 lg:hidden" title="Credits">
              <Sparkles size={14} className="text-blue-400" />
              <span className="text-xs font-semibold tabular-nums text-blue-300">{userCredits.credits?.current || 0}</span>
            </div>
          )}
          <div className="hidden items-center gap-2 lg:flex xl:gap-3">
            <button
              type="button"
              onClick={() => addCard()}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-all hover:bg-blue-500 active:bg-blue-700"
            >
              <Plus size={16} />
              Add Card
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSheet()}
              disabled={!activeSheet || cellsArray.length === 0}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/20 transition-all hover:bg-purple-500 active:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-600"
              title="Download sheet as PDF"
            >
              <FileText size={16} />
              Download Sheet
            </button>
            <button
              type="button"
              onClick={() => setShowOrchestratorModal(true)}
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-700/90 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-amber-600"
              title="Orchestrator: describe your task; we pick or create a template"
            >
              <Workflow size={16} />
              Orchestrator
            </button>
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/20 transition-all hover:from-purple-500 hover:to-pink-500 active:from-purple-700 active:to-pink-700"
              title="Use a template"
            >
              <Sparkles size={16} />
              Templates
            </button>
          </div>
          {/* User Menu */}
          {user && (
            <div className="relative user-menu-container">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 glass-button hover:bg-white/10 transition-colors sm:px-3"
                title="User menu"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || user.email || 'User'}
                    className="h-8 w-8 rounded-full md:h-6 md:w-6"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 text-xs font-semibold text-white md:h-6 md:w-6">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden max-w-[8rem] truncate text-sm font-medium text-white md:block">
                  {user.displayName || user.email || 'User'}
                </span>
                <ChevronDown size={14} className="hidden text-gray-400 md:block" />
              </button>

              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 top-full z-[70] mt-2 w-56 max-w-[calc(100vw-1rem)] glass-panel rounded-lg border border-white/10 shadow-xl overflow-hidden">
                  <div className="border-b border-white/10 p-3">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || user.email || 'User'}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 font-semibold text-white">
                          {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {user.displayName || 'No Name'}
                        </div>
                        <div className="truncate text-xs text-gray-400">{user.email}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfile(true);
                        setShowUserMenu(false);
                      }}
                      className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10"
                    >
                      <User size={16} />
                      <span>Profile</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubscription(true);
                        setShowUserMenu(false);
                      }}
                      className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10"
                    >
                      <Crown size={16} />
                      <span>Subscriptions</span>
                      {userCredits && (
                        <span className="ml-auto text-xs font-semibold text-blue-400">
                          {userCredits.credits?.current || 0}
                        </span>
                      )}
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdmin(true);
                          setShowUserMenu(false);
                        }}
                        className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10"
                      >
                        <Shield size={16} />
                        <span>Admin Dashboard</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        setShowUserMenu(false);
                        await signOutUser();
                      }}
                      className="flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content (Canvas) */}
      <div className="flex-1 overflow-hidden relative">
        {activeSheet ? (
          <Canvas
            cells={cellsArray}
            connections={connections}
            onCellUpdate={handleCellUpdate}
            onCellPositionChange={handleCellPositionChange}
            onRunCell={handleRunCell}
            onStopCell={handleStopCell}
            onDeleteCell={handleDeleteCell}
            runningCells={runningCells}
            userId={user.uid}
            projectId={currentProjectId}
            sheetId={activeSheet.id}
            availableModels={availableModels}
            sheets={sheets}
            allCells={cells}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse"></div>
            <p className="text-gray-500">Select or create a sheet to get started</p>
          </div>
        )}
      </div>

      {/* Footer / Tabs */}
      <div className="flex h-14 min-h-[3rem] shrink-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 glass-panel border-t-0 border-b border-l-0 border-r-0 z-50 relative touch-pan-x sm:h-12 sm:px-4 sm:py-0">
        <button
          type="button"
          onClick={handleCreateSheet}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
          title="Add Sheet"
        >
          <Plus size={18} />
        </button>
        <div className="mx-1 h-6 w-px shrink-0 bg-white/10 sm:mx-2"></div>
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', sheet.id);
              e.currentTarget.style.opacity = '0.5';
            }}
            onDragEnd={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderLeft = '2px solid rgba(59, 130, 246, 0.5)';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderLeft = '';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderLeft = '';
              const draggedSheetId = e.dataTransfer.getData('text/plain');
              if (draggedSheetId && draggedSheetId !== sheet.id) {
                handleReorderSheets(draggedSheetId, sheet.id);
              }
            }}
            onClick={() => {
              if (editingSheetId !== sheet.id) {
                setActiveSheet(sheet);
                // Save to localStorage immediately
                if (user && currentProjectId) {
                  const storageKey = `lastActiveSheet_${user.uid}_${currentProjectId}`;
                  localStorage.setItem(storageKey, sheet.id);
                }
              }
            }}
            className={`
              min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-all sm:min-h-0 sm:px-4 sm:py-1.5 flex
              ${activeSheet?.id === sheet.id
                ? 'bg-white/10 text-white border-white/10 shadow-sm'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5'}
            `}
          >
            <GripVertical 
              size={12} 
              className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing"
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Grid size={14} className={activeSheet?.id === sheet.id ? 'text-blue-400' : 'text-gray-500'} />
            {editingSheetId === sheet.id ? (
              <input
                type="text"
                value={editingSheetName}
                onChange={(e) => setEditingSheetName(e.target.value)}
                onBlur={() => handleSaveSheetName(sheet.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveSheetName(sheet.id);
                  } else if (e.key === 'Escape') {
                    handleCancelRename();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white text-sm min-w-[100px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            ) : (
              <span
                className="font-medium"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleRenameSheet(e, sheet.id, sheet.name);
                }}
              >
                {sheet.name}
              </span>
            )}
            {activeSheet?.id === sheet.id && editingSheetId !== sheet.id && (
              <>
                <button
                  className="hover:text-green-400 text-gray-500 p-0.5 rounded transition-colors"
                  onClick={(e) => handleDuplicateSheet(e, sheet.id)}
                  title="Duplicate sheet"
                >
                  <Copy size={12} />
                </button>
                <button
                  className="hover:text-blue-400 text-gray-500 p-0.5 rounded transition-colors"
                  onClick={(e) => handleRenameSheet(e, sheet.id, sheet.name)}
                  title="Rename sheet"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  className="hover:text-red-400 text-gray-500 p-0.5 rounded transition-colors"
                onClick={(e) => handleDeleteSheet(e, sheet.id)}
                  title="Delete sheet"
              >
                <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed left-4 right-4 top-4 z-50 mx-auto max-w-md transition-all duration-300 ease-in-out sm:left-auto sm:right-4 sm:mx-0">
          <div className={`rounded-lg shadow-xl border p-4 backdrop-blur-sm ${
            notification.type === 'error' 
              ? 'bg-red-900/95 border-red-700 text-white' 
              : notification.type === 'success'
              ? 'bg-green-900/95 border-green-700 text-white'
              : 'bg-blue-900/95 border-blue-700 text-white'
          }`}>
            <div className="flex items-start gap-3">
              {notification.type === 'success' ? (
                <Check className="h-5 w-5 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h4 className="font-semibold mb-1">{notification.title}</h4>
                <p className="text-sm opacity-90">{notification.message}</p>
                {notification.showUpgrade && (
                  <button
                    onClick={() => {
                      setShowSubscription(true);
                      setNotification(null);
                    }}
                    className="mt-3 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Upgrade Subscription
                  </button>
                )}
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showOrchestratorModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Workflow className="text-amber-400" size={22} />
                  Orchestrator
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Describe your main goal. The orchestrator may run several templates in sequence (hand-offs): each phase can use a different template or create one, until the goal is satisfied or the phase limit is reached. Repeating the same template is blocked to avoid loops.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !orchestratorRunning && setShowOrchestratorModal(false)}
                className="p-1 text-gray-400 hover:text-white shrink-0"
                disabled={orchestratorRunning}
              >
                <X size={20} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Main goal</label>
              <textarea
                value={orchestratorPrompt}
                onChange={(e) => setOrchestratorPrompt(e.target.value)}
                rows={5}
                disabled={orchestratorRunning}
                placeholder="e.g. Daily AI newsletter with research, draft, subject lines, and email digest…"
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-300 flex items-center gap-2">
                Max hand-off phases
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={orchestratorMaxPhases}
                  onChange={(e) =>
                    setOrchestratorMaxPhases(
                      Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 5))
                    )
                  }
                  disabled={orchestratorRunning}
                  className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-white"
                />
              </label>
              <span className="text-xs text-gray-500">1–10 (stops early if the goal is met)</span>
            </div>
            {orchestratorHandoffLog.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg bg-black/30 border border-white/5 p-2 text-xs font-mono text-gray-400 space-y-1">
                {orchestratorHandoffLog.slice(-20).map((ev, i) => (
                  <div key={i} className="truncate">
                    {ev.type === 'plan_start' && `Planning phase ${ev.round}/${ev.maxPhases}…`}
                    {ev.type === 'resolve' && `→ ${ev.instruction?.slice(0, 120)}${(ev.instruction?.length || 0) > 120 ? '…' : ''}`}
                    {ev.type === 'phase_ready' && `Template: ${ev.templateName}`}
                    {ev.type === 'done' && `Goal check: done`}
                    {ev.type === 'applying' &&
                      `Applying ${ev.phase}/${ev.total}: ${ev.templateName}`}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !orchestratorRunning && setShowOrchestratorModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-white/5 rounded-lg"
                disabled={orchestratorRunning}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRunOrchestrator}
                disabled={orchestratorRunning || !orchestratorPrompt.trim()}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 rounded-lg text-white"
              >
                {orchestratorRunning ? 'Working…' : 'Run'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      <TemplateModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelectTemplate={applyTemplate}
        availableModels={availableModels}
      />

      <GenerationSelectModal
        isOpen={showGenerationSelect}
        onClose={() => setShowGenerationSelect(false)}
        cells={cellsArray}
        onDownload={handleDownloadSheet}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showSubscription}
        onClose={() => {
          setShowSubscription(false);
          if (user) {
            loadUserCredits(user.uid);
          }
        }}
        user={user}
      />

      {/* User Profile Modal */}
      {showProfile && user && (
        <UserProfile
          user={user}
          onClose={() => {
            setShowProfile(false);
            if (user) {
              loadUserCredits(user.uid);
            }
          }}
        />
      )}
    </div>
  );
}

export default App;
