import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChange } from '../firebase/auth';
import { Box, Plus, Trash2, Edit2, FolderOpen, X, Search } from 'lucide-react';
import { getProjects, createProject, deleteProject, updateProject } from '../firebase/firestore';

const ProjectsPage = () => {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectName, setProjectName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChange((authUser) => {
      setUser(authUser);
      if (authUser) {
        loadProjects(authUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadProjects = async (userId) => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await getProjects(userId);
      if (result.success) {
        setProjects(result.projects || []);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!user || !projectName.trim()) return;

    try {
      const result = await createProject(user.uid, {
        name: projectName.trim(),
        numRows: 10,
        numCols: 10,
        order: projects.length
      });

      if (result.success) {
        setProjectName('');
        setShowCreateModal(false);
        await loadProjects(user.uid);
        
        // Store selected project in localStorage for App.jsx to pick up
        localStorage.setItem(`selectedProject_${user.uid}`, result.projectId);
        navigate('/');
      }
    } catch (error) {
      alert('Failed to create project: ' + error.message);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!user) return;
    
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? This will delete all sheets and cells in this project.`)) {
      return;
    }

    try {
      const result = await deleteProject(user.uid, projectId);
      if (result.success) {
        await loadProjects(user.uid);
        // Clear selected project if it was deleted
        const selectedProject = localStorage.getItem(`selectedProject_${user.uid}`);
        if (selectedProject === projectId) {
          localStorage.removeItem(`selectedProject_${user.uid}`);
        }
      } else {
        alert('Failed to delete project: ' + result.error);
      }
    } catch (error) {
      alert('Failed to delete project: ' + error.message);
    }
  };

  const handleEditProject = async () => {
    if (!user || !editingProject || !projectName.trim()) return;

    try {
      const result = await updateProject(user.uid, editingProject.id, {
        name: projectName.trim()
      });

      if (result.success) {
        setEditingProject(null);
        setProjectName('');
        await loadProjects(user.uid);
      } else {
        alert('Failed to update project: ' + result.error);
      }
    } catch (error) {
      alert('Failed to update project: ' + error.message);
    }
  };

  const handleSelectProject = (projectId) => {
    // Store selected project in localStorage for App.jsx to pick up
    if (user) {
      localStorage.setItem(`selectedProject_${user.uid}`, projectId);
    }
    navigate('/');
  };

  const filteredProjects = projects.filter(project =>
    project.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center mesh-gradient">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col mesh-gradient text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-16 flex items-center px-6 justify-between glass-panel z-50 relative">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Box size={24} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
              Projects
            </h1>
            <span className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">Manage your projects</span>
          </div>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          Back to Workspace
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Search and Create */}
          <div className="mb-6 flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => {
                setProjectName('');
                setEditingProject(null);
                setShowCreateModal(true);
              }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
            >
              <Plus size={16} />
              New Project
            </button>
          </div>

          {/* Projects Grid */}
          {filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                <FolderOpen size={48} className="text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </h3>
              <p className="text-gray-400 mb-6">
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Create your first project to get started'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => {
                    setProjectName('');
                    setEditingProject(null);
                    setShowCreateModal(true);
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 mx-auto"
                >
                  <Plus size={20} />
                  Create Project
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  className="glass-panel rounded-xl p-5 hover:bg-white/5 transition-all cursor-pointer group border border-white/10 hover:border-blue-500/50"
                  onClick={() => handleSelectProject(project.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                      <FolderOpen size={24} />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProject(project);
                          setProjectName(project.name || '');
                          setShowCreateModal(true);
                        }}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                        title="Edit project"
                      >
                        <Edit2 size={14} className="text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id, project.name);
                        }}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Delete project"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2 truncate">
                    {project.name || 'Unnamed Project'}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      {project.sheets?.length || 0} sheet{project.sheets?.length !== 1 ? 's' : ''}
                    </span>
                    {project.createdAt && (
                      <span>
                        {new Date(project.createdAt?.seconds * 1000 || project.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => {
            setShowCreateModal(false);
            setEditingProject(null);
            setProjectName('');
          }} />
          <div className="relative glass-panel rounded-2xl p-6 max-w-md w-full border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {editingProject ? 'Edit Project' : 'Create New Project'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingProject(null);
                  setProjectName('');
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      editingProject ? handleEditProject() : handleCreateProject();
                    }
                  }}
                  placeholder="Enter project name..."
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingProject(null);
                    setProjectName('');
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingProject ? handleEditProject : handleCreateProject}
                  disabled={!projectName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-semibold"
                >
                  {editingProject ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;

