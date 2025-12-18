import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, FolderOpen, Brain, Crown, CreditCard, 
  BarChart3, Settings, LogOut, Plus, Edit, Trash2, 
  RefreshCw, Search, X, Check, AlertCircle, Coins, Sparkles,
  ChevronLeft, ChevronRight 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { isCurrentUserAdmin, makeCurrentUserAdmin, signOutUser } from '../firebase/auth';
import { 
  getAllUsers, updateUser, deleteUser, 
  getAllProjects, deleteProject,
  getAllModels, createModel, updateModel, deleteModel,
  getAdminConfig, setAdminConfig,
  getUserSubscription, resetMonthlyCredits, updateUserCredits, addCredits,
  getAllPackages, createPackage, updatePackage, deletePackage,
  getAllGenerations,
  getAllTemplates, createTemplate, updateTemplate, deleteTemplate
} from '../firebase/firestore';
import { getSubscriptionPlans, getPlanById } from '../services/subscriptions';

const AdminDashboard = ({ user, onBack }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [adminData, setAdminData] = useState({
    users: [],
    projects: [],
    models: [],
    subscriptions: [],
    payments: [],
    packages: [],
    templates: []
  });
  const [plans, setPlans] = useState({});
  const [modelUsage, setModelUsage] = useState([]);
  const [analytics, setAnalytics] = useState({
    userGrowth: [],
    subscriptionDistribution: [],
    paymentTrends: [],
    revenueByPlan: [],
    activeUsers: 0,
    inactiveUsers: 0,
    totalRevenue: 0,
    monthlyRevenue: [],
    paymentStatusBreakdown: []
  });
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProjects: 0,
    totalModels: 0,
    totalRevenue: 0
  });
  const [filters, setFilters] = useState({
    userSearch: '',
    userStatus: '',
    userRole: '',
    projectSearch: '',
    projectStatus: '',
    modelSearch: '',
    modelType: '',
    modelProvider: '',
    modelStatus: '',
    subscriptionSearch: '',
    subscriptionPlan: '',
    subscriptionStatus: '',
    paymentSearch: '',
    paymentStatus: '',
    paymentDateFrom: ''
  });
  const [modals, setModals] = useState({
    user: { open: false, editing: null },
    project: { open: false, editing: null },
    model: { open: false, editing: null },
    package: { open: false, editing: null },
    template: { open: false, editing: null }
  });
  const [formData, setFormData] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({
    users: { page: 1, perPage: 10 },
    projects: { page: 1, perPage: 10 },
    models: { page: 1, perPage: 10 },
    subscriptions: { page: 1, perPage: 10 },
    payments: { page: 1, perPage: 10 },
    templates: { page: 1, perPage: 10 },
    packages: { page: 1, perPage: 10 }
  });

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData();
    }
  }, [isAdmin]);

  const checkAdminAccess = async () => {
    try {
      const adminStatus = await isCurrentUserAdmin();
      setIsAdmin(adminStatus);
      setLoading(false);
      
      if (!adminStatus) {
        showNotification('Access denied. Admin privileges required.', 'error');
        setTimeout(() => {
          onBack();
        }, 2000);
      }
    } catch (error) {
      setLoading(false);
      showNotification('Error checking admin status', 'error');
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel and also get back the raw arrays
      const [
        users,
        projects,
        models,
        subscriptions,
        payments,
        packages,
        templates,
        plansData,
        modelUsageData
      ] = await Promise.all([
        loadUsers(),
        loadProjects(),
        loadModels(),
        loadSubscriptions(),
        loadPayments(),
        loadPackages(),
        loadTemplates(),
        loadPlans(),
        loadModelUsage()
      ]);

      const safeUsers = users || [];
      const safeProjects = projects || [];
      const safeModels = models || [];
      const safeSubscriptions = subscriptions || [];
      const safePayments = payments || [];

      // Update top-level stats from the fresh data, not from possibly stale state
      setStats({
        totalUsers: safeUsers.length,
        totalProjects: safeProjects.length,
        totalModels: safeModels.length,
        totalRevenue: safePayments
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + (p.amount || 0), 0)
      });

      // Update analytics based on the same fresh data
      await loadAnalytics(safeUsers, safePayments, safeSubscriptions);

      // Also store supporting data that isn't part of stats directly
      if (plansData) {
        setPlans(plansData);
      }
      if (modelUsageData) {
        setModelUsage(modelUsageData);
      }

      setLoading(false);
    } catch (error) {
      showNotification('Failed to load dashboard data', 'error');
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const result = await getAllUsers();
      if (result.success) {
        const users = result.data || [];
        setAdminData(prev => ({ ...prev, users }));
        return users;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadProjects = async () => {
    try {
      const result = await getAllProjects();
      if (result.success) {
        const projects = result.data || [];
        setAdminData(prev => ({ ...prev, projects }));
        return projects;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadModels = async () => {
    try {
      const result = await getAllModels();
      if (result.success) {
        const models = result.data || [];
        // Debug: Log video models
        const videoModels = models.filter(m => {
          const type = m.type || (m.id?.includes('sora') ? 'video' : null);
          return type === 'video';
        });
        console.log('🎥 Video models:', videoModels);
        setAdminData(prev => ({ ...prev, models }));
        return models;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadSubscriptions = async () => {
    try {
      // Load subscriptions from users collection
      const usersResult = await getAllUsers();
      if (usersResult.success) {
        const subscriptions = usersResult.data.map(user => ({
          userId: user.id,
          userEmail: user.email,
          displayName: user.displayName,
          plan: user.subscription || 'free',
          status: user.subscriptionStatus || 'active',
          credits: user.credits || { current: 0, total: 0 },
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: user.stripeSubscriptionId,
          createdAt: user.createdAt
        }));
        setAdminData(prev => ({ ...prev, subscriptions }));
        return subscriptions;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadPayments = async () => {
    try {
      // For now, we'll show subscription info as payments
      // In production, you'd fetch from Stripe API or a payments collection
      const usersResult = await getAllUsers();
      if (usersResult.success) {
        const plansData = await getSubscriptionPlans();
        const payments = [];
        for (const user of usersResult.data) {
          if (user.subscription && user.subscription !== 'free' && user.stripeSubscriptionId) {
            const plan = plansData[user.subscription];
            if (plan) {
              payments.push({
                id: user.stripeSubscriptionId || `sub_${user.id}`,
                userId: user.id,
                userEmail: user.email,
                amount: plan.price,
                status: user.subscriptionStatus === 'active' ? 'completed' : user.subscriptionStatus || 'pending',
                date: user.createdAt,
                description: `${plan.name} Subscription`,
                plan: user.subscription
              });
            }
          }
        }
        setAdminData(prev => ({ ...prev, payments }));
        return payments;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadPackages = async () => {
    try {
      const result = await getAllPackages();
      if (result.success) {
        const packages = result.data || [];
        setAdminData(prev => ({ ...prev, packages }));
        return packages;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadTemplates = async () => {
    try {
      const result = await getAllTemplates();
      if (result.success) {
        const templates = result.data || [];
        setAdminData(prev => ({ ...prev, templates }));
        return templates;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadPlans = async () => {
    try {
      const plansData = await getSubscriptionPlans();
      // Plans are also set in loadDashboardData to ensure sync with stats
      setPlans(plansData);
      return plansData;
    } catch (error) {
      return null;
    }
  };

  const loadModelUsage = async () => {
    try {
      const result = await getAllGenerations();
      if (result.success && result.data) {
        // Count usage per model
        const usageMap = {};
        result.data.forEach(gen => {
          const model = gen.model || 'unknown';
          if (!usageMap[model]) {
            usageMap[model] = {
              model,
              count: 0,
              type: gen.type || 'text'
            };
          }
          usageMap[model].count++;
        });

        // Convert to array and sort by count
        const usageArray = Object.values(usageMap)
          .sort((a, b) => b.count - a.count)
          .slice(0, 20); // Top 20 models

        setModelUsage(usageArray);
        return usageArray;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const loadAnalytics = async (usersFromLoad, paymentsFromLoad, subscriptionsFromLoad) => {
    try {
      // Prefer the freshly loaded data if provided, otherwise fall back to state
      const users = Array.isArray(usersFromLoad)
        ? usersFromLoad
        : (adminData.users || []);
      const payments = Array.isArray(paymentsFromLoad)
        ? paymentsFromLoad
        : (adminData.payments || []);
      const subscriptions = Array.isArray(subscriptionsFromLoad)
        ? subscriptionsFromLoad
        : (adminData.subscriptions || []);

      // User Growth Over Time
      const userGrowthMap = {};
      users.forEach(user => {
        let date;
        if (user.createdAt?.toDate) {
          date = user.createdAt.toDate();
        } else if (user.createdAt?.seconds) {
          date = new Date(user.createdAt.seconds * 1000);
        } else if (user.createdAt) {
          date = new Date(user.createdAt);
        } else {
          return;
        }
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!userGrowthMap[monthKey]) {
          userGrowthMap[monthKey] = 0;
        }
        userGrowthMap[monthKey]++;
      });
      const userGrowth = Object.entries(userGrowthMap)
        .map(([month, count]) => ({ month, users: count }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Subscription Distribution
      const subscriptionMap = {};
      subscriptions.forEach(sub => {
        const plan = sub.plan || 'free';
        subscriptionMap[plan] = (subscriptionMap[plan] || 0) + 1;
      });
      const subscriptionDistribution = Object.entries(subscriptionMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));

      // Payment Trends
      const paymentTrendsMap = {};
      payments.forEach(payment => {
        let date;
        if (payment.date?.toDate) {
          date = payment.date.toDate();
        } else if (payment.date?.seconds) {
          date = new Date(payment.date.seconds * 1000);
        } else if (payment.date) {
          date = new Date(payment.date);
        } else {
          return;
        }
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!paymentTrendsMap[monthKey]) {
          paymentTrendsMap[monthKey] = { revenue: 0, count: 0 };
        }
        paymentTrendsMap[monthKey].revenue += payment.amount || 0;
        paymentTrendsMap[monthKey].count++;
      });
      const paymentTrends = Object.entries(paymentTrendsMap)
        .map(([month, data]) => ({ month, revenue: data.revenue, count: data.count }))
        .sort((a, b) => a.month.localeCompare(b.month));

      // Revenue by Plan
      const revenueByPlanMap = {};
      payments.forEach(payment => {
        if (payment.status === 'completed') {
          const plan = payment.plan || 'unknown';
          revenueByPlanMap[plan] = (revenueByPlanMap[plan] || 0) + (payment.amount || 0);
        }
      });
      const revenueByPlan = Object.entries(revenueByPlanMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        revenue: value
      }));

      // Active vs Inactive Users
      const activeUsers = users.filter(u => u.isActive !== false).length;
      const inactiveUsers = users.length - activeUsers;

      // Total Revenue
      const totalRevenue = payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      // Monthly Revenue
      const monthlyRevenue = paymentTrends.map(t => ({
        month: t.month,
        revenue: t.revenue
      }));

      // Payment Status Breakdown
      const statusMap = {};
      payments.forEach(payment => {
        const status = payment.status || 'pending';
        statusMap[status] = (statusMap[status] || 0) + 1;
      });
      const paymentStatusBreakdown = Object.entries(statusMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value
      }));

      setAnalytics({
        userGrowth,
        subscriptionDistribution,
        paymentTrends,
        revenueByPlan,
        activeUsers,
        inactiveUsers,
        totalRevenue,
        monthlyRevenue,
        paymentStatusBreakdown
      });
    } catch (error) {
    }
  };

  const populateDefaultPackages = async () => {
    if (!window.confirm('This will create default packages in the database. Continue?')) {
      return;
    }

    // Verify admin status
    if (!isAdmin) {
      showNotification('Admin privileges required to create packages', 'error');
      return;
    }

    const defaultPackages = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        priceId: null,
        monthlyCredits: 50,
        features: [
          '50 credits per month',
          'Basic AI models',
          'Community support'
        ],
        limits: {
          maxProjects: 3,
          maxSheets: 5,
          maxCells: 20
        }
      },
      {
        id: 'starter',
        name: 'Starter',
        price: 9.99,
        priceId: null,
        monthlyCredits: 500,
        features: [
          '500 credits per month',
          'All AI models',
          'Priority support',
          'Unlimited projects',
          'Unlimited sheets'
        ],
        limits: {
          maxProjects: -1,
          maxSheets: -1,
          maxCells: -1
        }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29.99,
        priceId: null,
        monthlyCredits: 2000,
        features: [
          '2,000 credits per month',
          'All AI models',
          'Priority support',
          'Unlimited projects',
          'Unlimited sheets',
          'Advanced features'
        ],
        limits: {
          maxProjects: -1,
          maxSheets: -1,
          maxCells: -1
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99.99,
        priceId: null,
        monthlyCredits: 10000,
        features: [
          '10,000 credits per month',
          'All AI models',
          '24/7 support',
          'Unlimited everything',
          'Custom integrations',
          'Dedicated account manager'
        ],
        limits: {
          maxProjects: -1,
          maxSheets: -1,
          maxCells: -1
        }
      }
    ];

    try {
      setLoading(true);
      let created = 0;
      let skipped = 0;
      let errors = [];

      // Reload packages first to get current state
      await loadPackages();

      for (const pkg of defaultPackages) {
        try {
          // Check if package already exists (by document ID)
          const existing = adminData.packages.find(p => p.id === pkg.id);
          if (existing) {
            skipped++;
            continue;
          }
          const result = await createPackage(pkg);
          if (result.success) {
            created++;
          } else {
            errors.push(`${pkg.id}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${pkg.id}: ${error.message}`);
        }
      }

      // Reload packages to show new ones
      await loadPackages();

      if (errors.length > 0) {
        showNotification(`Created ${created} packages, skipped ${skipped}, ${errors.length} errors: ${errors.join(', ')}`, 'error');
      } else {
        showNotification(`Successfully created ${created} packages, skipped ${skipped} existing packages`, 'success');
      }
    } catch (error) {
      showNotification('Error populating packages: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update stats when adminData changes
  useEffect(() => {
    const revenue = adminData.payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    setStats({
      totalUsers: adminData.users.length,
      totalProjects: adminData.projects.length,
      totalModels: adminData.models.length,
      totalRevenue: revenue
    });
  }, [adminData.users.length, adminData.projects.length, adminData.models.length, adminData.payments.length]);

  const showNotification = (message, type = 'success') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      onBack();
    } catch (error) {
    }
  };

  const handleTopupCredits = async (userId, amount = 100) => {
    try {
      const result = await addCredits(userId, amount);
      if (result.success) {
        showNotification(`Successfully added ${amount} credits to user. New balance: ${result.newCredits}`, 'success');
        loadUsers(); // Reload to show updated credits
      } else {
        showNotification(`Failed to add credits: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error adding credits', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await deleteUser(userId);
      if (result.success) {
        showNotification('User deleted successfully', 'success');
        loadUsers();
      } else {
        showNotification(`Failed to delete user: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error deleting user', 'error');
    }
  };

  const handleDeleteProject = async (projectId, userId) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await deleteProject(userId, projectId);
      if (result.success) {
        showNotification('Project deleted successfully', 'success');
        loadProjects();
      } else {
        showNotification(`Failed to delete project: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error deleting project', 'error');
    }
  };

  const handleDeleteModel = async (modelId) => {
    if (!window.confirm('Are you sure you want to delete this model? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await deleteModel(modelId);
      if (result.success) {
        showNotification('Model deleted successfully', 'success');
        loadModels();
      } else {
        showNotification(`Failed to delete model: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error deleting model', 'error');
    }
  };

  const handleToggleModelActive = async (modelId, isActive) => {
    try {
      const result = await updateModel(modelId, {
        isActive,
        status: isActive ? 'active' : 'inactive',
        updatedAt: new Date()
      });
      
      if (result.success) {
        showNotification(`Model ${isActive ? 'enabled' : 'disabled'} successfully`, 'success');
        loadModels();
      } else {
        showNotification(`Failed to update model: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error updating model', 'error');
    }
  };

  const handleCreatePackage = async (packageData) => {
    try {
      const result = await createPackage(packageData);
      if (result.success) {
        showNotification('Package created successfully', 'success');
        setModals(prev => ({ ...prev, package: { open: false, editing: null } }));
        setFormData({});
        loadPackages();
      } else {
        showNotification(`Failed to create package: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error creating package', 'error');
    }
  };

  const handleUpdatePackage = async (packageData) => {
    try {
      const result = await updatePackage(modals.package.editing, packageData);
      if (result.success) {
        showNotification('Package updated successfully', 'success');
        setModals(prev => ({ ...prev, package: { open: false, editing: null } }));
        setFormData({});
        loadPackages();
      } else {
        showNotification(`Failed to update package: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error updating package', 'error');
    }
  };

  const handleDeletePackage = async (packageId) => {
    if (!window.confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await deletePackage(packageId);
      if (result.success) {
        showNotification('Package deleted successfully', 'success');
        loadPackages();
      } else {
        showNotification(`Failed to delete package: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error deleting package', 'error');
    }
  };

  const handleCreateTemplate = async (templateData) => {
    try {
      const result = await createTemplate(templateData);
      if (result.success) {
        showNotification('Template created successfully', 'success');
        setModals(prev => ({ ...prev, template: { open: false, editing: null } }));
        setFormData({});
        loadTemplates();
      } else {
        showNotification(`Failed to create template: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error creating template', 'error');
    }
  };

  const handleUpdateTemplate = async (templateData) => {
    try {
      const result = await updateTemplate(modals.template.editing, templateData);
      if (result.success) {
        showNotification('Template updated successfully', 'success');
        setModals(prev => ({ ...prev, template: { open: false, editing: null } }));
        setFormData({});
        loadTemplates();
      } else {
        showNotification(`Failed to update template: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error updating template', 'error');
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await deleteTemplate(templateId);
      if (result.success) {
        showNotification('Template deleted successfully', 'success');
        loadTemplates();
      } else {
        showNotification(`Failed to delete template: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error deleting template', 'error');
    }
  };

  const populateDefaultTemplates = async () => {
    if (!window.confirm('This will create default templates in the database. Continue?')) {
      return;
    }

    if (!isAdmin) {
      showNotification('Admin privileges required to create templates', 'error');
      return;
    }

    // Import default templates from the templates file
    const { TEMPLATES } = await import('../data/templates');
    const defaultTemplates = Object.values(TEMPLATES);

    let created = 0;
    let skipped = 0;
    let errors = [];

    for (const template of defaultTemplates) {
      try {
        const result = await createTemplate(template);
        if (result.success) {
          created++;
        } else {
          skipped++;
          errors.push(`${template.id}: ${result.error}`);
        }
      } catch (error) {
        skipped++;
        errors.push(`${template.id}: ${error.message}`);
      }
    }

    const message = `Created ${created} templates, skipped ${skipped}${errors.length > 0 ? `, ${errors.length} errors: ${errors.join(', ')}` : ''}`;
    showNotification(message, errors.length > 0 ? 'error' : 'success');
    loadTemplates();
  };

  const fetchOpenAIModels = async () => {
    // OpenAI models list
    return [
      // Text generation models
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most advanced GPT-4 model', provider: 'openai', type: 'text' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, cheaper GPT-4 model', provider: 'openai', type: 'text' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation GPT-4', provider: 'openai', type: 'text' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient model', provider: 'openai', type: 'text' },
      // Image generation models
      { id: 'dall-e-3', name: 'DALL-E 3', description: 'Latest DALL-E image generation model', provider: 'openai', type: 'image' },
      { id: 'dall-e-2', name: 'DALL-E 2', description: 'Previous generation image model', provider: 'openai', type: 'image' },
      // Video generation models
      { id: 'sora-2', name: 'Sora 2', description: 'OpenAI Sora 2 - Standard quality video generation (720p)', provider: 'openai', type: 'video' },
      { id: 'sora-2-pro', name: 'Sora 2 Pro', description: 'OpenAI Sora 2 Pro - Cinematic quality video generation (720p or 1024p)', provider: 'openai', type: 'video' },
      // Audio generation models
      { id: 'tts-1', name: 'TTS-1', description: 'Text-to-Speech model', provider: 'openai', type: 'audio' },
      { id: 'tts-1-hd', name: 'TTS-1 HD', description: 'High-definition Text-to-Speech model', provider: 'openai', type: 'audio' }
    ];
  };

  const fetchGeminiModels = async () => {
    // Gemini models list
    return [
      // Text generation models
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', description: 'Latest experimental Gemini model', provider: 'gemini', type: 'text' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable Gemini model', provider: 'gemini', type: 'text' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and efficient Gemini model', provider: 'gemini', type: 'text' },
      { id: 'gemini-pro', name: 'Gemini Pro', description: 'Standard Gemini model', provider: 'gemini', type: 'text' },
      // Image generation models
      { id: 'imagen-3', name: 'Imagen 3', description: 'Google Imagen 3 image generation', provider: 'gemini', type: 'image' }
    ];
  };

  const handleSyncOpenAIModels = async () => {
    try {
      showNotification('Syncing OpenAI models...', 'success');
      const openAIModels = await fetchOpenAIModels();
      let savedCount = 0;
      let updatedCount = 0;

      // Debug: Log video models being synced
      const videoModels = openAIModels.filter(m => m.type === 'video');
      for (const model of openAIModels) {
        const sanitizedId = model.id.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '-');
        const existingModel = adminData.models.find(m => m.id === sanitizedId);
        
        // Ensure type is explicitly set - don't default to 'text' for video/audio models
        const modelType = model.type || (model.id.includes('sora') ? 'video' : 
                                        model.id.includes('tts') ? 'audio' : 
                                        model.id.includes('dall-e') ? 'image' : 'text');
        
        const modelData = {
          id: sanitizedId,
          originalId: model.id,
          name: model.name,
          description: model.description,
          provider: 'openai',
          type: modelType, // Use explicitly determined type
          source: 'openai',
          status: existingModel?.status || 'inactive',
          isActive: existingModel?.isActive !== undefined ? existingModel.isActive : false,
          updatedAt: new Date()
        };

        if (existingModel) {
          await updateModel(sanitizedId, modelData);
          updatedCount++;
          if (modelType === 'video') {
          }
        } else {
          await createModel({ ...modelData, createdAt: new Date() });
          savedCount++;
          if (modelType === 'video') {
          }
        }
      }

      const textCount = openAIModels.filter(m => m.type === 'text').length;
      const imageCount = openAIModels.filter(m => m.type === 'image').length;
      const videoCount = openAIModels.filter(m => m.type === 'video').length;
      const audioCount = openAIModels.filter(m => m.type === 'audio').length;
      showNotification(`Synced ${openAIModels.length} OpenAI models (${savedCount} new, ${updatedCount} updated, ${textCount} text, ${imageCount} image, ${videoCount} video, ${audioCount} audio)`, 'success');
      loadModels();
    } catch (error) {
      showNotification('Failed to sync OpenAI models: ' + error.message, 'error');
    }
  };

  const handleSyncGeminiModels = async () => {
    try {
      showNotification('Syncing Gemini models...', 'success');
      const geminiModels = await fetchGeminiModels();
      let savedCount = 0;
      let updatedCount = 0;

      for (const model of geminiModels) {
        const sanitizedId = model.id.replace(/\//g, '-').replace(/[^a-zA-Z0-9-]/g, '-');
        const existingModel = adminData.models.find(m => m.id === sanitizedId);
        
        const modelData = {
          id: sanitizedId,
          originalId: model.id,
          name: model.name,
          description: model.description,
          provider: 'gemini',
          type: model.type || 'text',
          source: 'gemini',
          status: existingModel?.status || 'inactive',
          isActive: existingModel?.isActive !== undefined ? existingModel.isActive : false,
          updatedAt: new Date()
        };

        if (existingModel) {
          await updateModel(sanitizedId, modelData);
          updatedCount++;
        } else {
          await createModel({ ...modelData, createdAt: new Date() });
          savedCount++;
        }
      }

      const textCount = geminiModels.filter(m => m.type === 'text').length;
      const imageCount = geminiModels.filter(m => m.type === 'image').length;
      showNotification(`Synced ${geminiModels.length} Gemini models (${savedCount} new, ${updatedCount} updated, ${textCount} text, ${imageCount} image)`, 'success');
      loadModels();
    } catch (error) {
      showNotification('Failed to sync Gemini models: ' + error.message, 'error');
    }
  };

  const handleEditSubscription = async (subscription) => {
    const plans = await getSubscriptionPlans();
    const planNames = Object.keys(plans).join(', ');
    const newPlan = window.prompt(
      `Change subscription plan for ${subscription.userEmail}\n\nCurrent: ${subscription.plan}\n\nEnter new plan (${planNames}):`,
      subscription.plan
    );

    if (!newPlan || !plans[newPlan]) {
      return;
    }

    if (newPlan === subscription.plan) {
      showNotification('Plan is already set to ' + newPlan, 'error');
      return;
    }

    try {
      const plan = plans[newPlan] || await getPlanById(newPlan);
      const now = new Date();
      const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = await updateUser(subscription.userId, {
        subscription: newPlan,
        subscriptionStatus: 'active',
        credits: {
          current: plan.monthlyCredits,
          total: plan.monthlyCredits,
          lastReset: now,
          nextReset: nextReset
        }
      });

      if (result.success) {
        showNotification(`Subscription updated to ${plan.name}`, 'success');
        loadSubscriptions();
        loadUsers();
      } else {
        showNotification(`Failed to update subscription: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error updating subscription', 'error');
    }
  };

  const handleResetUserCredits = async (userId, planId) => {
    if (!window.confirm('Reset credits for this user? This will set credits to the monthly amount for their plan.')) {
      return;
    }

    try {
      const plan = await getPlanById(planId);
      const result = await resetMonthlyCredits(userId, planId, plan.monthlyCredits);

      if (result.success) {
        showNotification('Credits reset successfully', 'success');
        loadSubscriptions();
      } else {
        showNotification(`Failed to reset credits: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification('Error resetting credits', 'error');
    }
  };

  // Pagination helper functions
  const getPaginatedData = (data, section) => {
    const { page, perPage } = pagination[section];
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (data, section) => {
    const { perPage } = pagination[section];
    return Math.ceil(data.length / perPage) || 1;
  };

  const handlePageChange = (section, newPage) => {
    setPagination(prev => ({
      ...prev,
      [section]: { ...prev[section], page: newPage }
    }));
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePerPageChange = (section, newPerPage) => {
    setPagination(prev => ({
      ...prev,
      [section]: { page: 1, perPage: newPerPage }
    }));
  };

  // Reset pagination when filters change
  useEffect(() => {
    setPagination(prev => ({
      users: { ...prev.users, page: 1 },
      projects: { ...prev.projects, page: 1 },
      models: { ...prev.models, page: 1 },
      subscriptions: { ...prev.subscriptions, page: 1 },
      payments: { ...prev.payments, page: 1 },
      templates: { ...prev.templates, page: 1 },
      packages: { ...prev.packages, page: 1 }
    }));
  }, [filters.userSearch, filters.userStatus, filters.userRole, filters.projectSearch, filters.projectStatus, filters.modelSearch, filters.modelType, filters.modelProvider, filters.modelStatus]);

  const filteredUsers = adminData.users.filter(user => {
    const matchesSearch = !filters.userSearch || 
      user.email?.toLowerCase().includes(filters.userSearch.toLowerCase()) ||
      user.displayName?.toLowerCase().includes(filters.userSearch.toLowerCase());
    const matchesStatus = !filters.userStatus || 
      (filters.userStatus === 'active' ? user.isActive !== false : user.isActive === false);
    const matchesRole = !filters.userRole || user.role === filters.userRole;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const filteredProjects = adminData.projects.filter(project => {
    const matchesSearch = !filters.projectSearch ||
      project.name?.toLowerCase().includes(filters.projectSearch.toLowerCase()) ||
      project.userEmail?.toLowerCase().includes(filters.projectSearch.toLowerCase());
    const matchesStatus = !filters.projectStatus || project.status === filters.projectStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredModels = adminData.models.filter(model => {
    const matchesSearch = !filters.modelSearch ||
      model.id?.toLowerCase().includes(filters.modelSearch.toLowerCase()) ||
      model.name?.toLowerCase().includes(filters.modelSearch.toLowerCase());
    
    // Infer type from model ID if type is missing
    const inferredType = model.type || 
      (model.id?.includes('sora') ? 'video' :
       model.id?.includes('tts') ? 'audio' :
       model.id?.includes('dall-e') || model.id?.includes('imagen') ? 'image' : 'text');
    
    const matchesType = !filters.modelType || inferredType === filters.modelType;
    const matchesProvider = !filters.modelProvider || model.provider === filters.modelProvider;
    const matchesStatus = !filters.modelStatus || 
      (filters.modelStatus === 'active' ? (model.isActive || model.status === 'active') : 
       (model.isActive === false || model.status === 'inactive'));
    
    // Debug: Log video models that are being filtered
    if (inferredType === 'video') {
    }
    
    return matchesSearch && matchesType && matchesProvider && matchesStatus;
  });

  const filteredSubscriptions = (adminData.subscriptions || []).filter(sub => {
    const matchesSearch = !filters.subscriptionSearch || 
      sub.userEmail?.toLowerCase().includes(filters.subscriptionSearch.toLowerCase()) ||
      sub.displayName?.toLowerCase().includes(filters.subscriptionSearch.toLowerCase());
    const matchesPlan = !filters.subscriptionPlan || sub.plan === filters.subscriptionPlan;
    const matchesStatus = !filters.subscriptionStatus || sub.status === filters.subscriptionStatus;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const filteredPayments = (adminData.payments || []).filter(payment => {
    const matchesSearch = !filters.paymentSearch || 
      payment.userEmail?.toLowerCase().includes(filters.paymentSearch.toLowerCase()) ||
      payment.plan?.toLowerCase().includes(filters.paymentSearch.toLowerCase());
    const matchesStatus = !filters.paymentStatus || payment.status === filters.paymentStatus;
    return matchesSearch && matchesStatus;
  });

  const filteredTemplates = adminData.templates || [];
  const filteredPackages = adminData.packages || [];

  // Paginated data
  const paginatedUsers = getPaginatedData(filteredUsers, 'users');
  const paginatedProjects = getPaginatedData(filteredProjects, 'projects');
  
  const paginatedModels = getPaginatedData(filteredModels, 'models');
  const paginatedSubscriptions = getPaginatedData(filteredSubscriptions, 'subscriptions');
  const paginatedPayments = getPaginatedData(filteredPayments, 'payments');
  const paginatedTemplates = getPaginatedData(filteredTemplates, 'templates');
  const paginatedPackages = getPaginatedData(filteredPackages, 'packages');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400">Admin privileges required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-6 w-6 text-green-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Cellulai Management</p>
        </div>
        
        <nav className="p-4 space-y-1">
          {[
            { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'projects', icon: FolderOpen, label: 'Projects' },
            { id: 'models', icon: Brain, label: 'AI Models' },
            { id: 'templates', icon: Sparkles, label: 'Templates' },
            { id: 'packages', icon: Crown, label: 'Packages' },
            { id: 'subscriptions', icon: Crown, label: 'Subscriptions' },
            { id: 'payments', icon: CreditCard, label: 'Payments' },
            { id: 'analytics', icon: BarChart3, label: 'Analytics' },
            { id: 'settings', icon: Settings, label: 'Settings' }
          ].map(section => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                  activeSection === section.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{section.label}</span>
              </button>
            );
          })}
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-4"
          >
            <LogOut className="h-5 w-5" />
            <span>Logout</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-64">
        <div className="p-6">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {activeSection === 'dashboard' && 'Dashboard'}
                  {activeSection === 'users' && 'User Management'}
                  {activeSection === 'projects' && 'Project Management'}
                  {activeSection === 'models' && 'AI Model Management'}
                  {activeSection === 'templates' && 'Template Management'}
                  {activeSection === 'packages' && 'Package Management'}
                  {activeSection === 'subscriptions' && 'Subscription Management'}
                  {activeSection === 'payments' && 'Payment Management'}
                  {activeSection === 'analytics' && 'Analytics'}
                  {activeSection === 'settings' && 'System Settings'}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Welcome, {user?.email}
                </p>
              </div>
              <button
                onClick={loadDashboardData}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Dashboard Section */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Users</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.totalUsers}</p>
                    </div>
                    <Users className="h-12 w-12 text-blue-500" />
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Projects</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.totalProjects}</p>
                    </div>
                    <FolderOpen className="h-12 w-12 text-red-500" />
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">AI Models</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats.totalModels}</p>
                    </div>
                    <Brain className="h-12 w-12 text-yellow-500" />
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">${stats.totalRevenue.toFixed(2)}</p>
                    </div>
                    <CreditCard className="h-12 w-12 text-green-500" />
                  </div>
                </div>
              </div>

              {/* Model Usage Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Model Usage Statistics</h3>
                {modelUsage.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No usage data available
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Bar Chart */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Usage by Model (Top 20)</h4>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={modelUsage}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="model" 
                            angle={-45}
                            textAnchor="end"
                            height={120}
                            tick={{ fontSize: 12 }}
                            stroke="#6b7280"
                          />
                          <YAxis 
                            label={{ value: 'Usage Count', angle: -90, position: 'insideLeft' }}
                            stroke="#6b7280"
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#1f2937', 
                              border: '1px solid #374151',
                              borderRadius: '8px',
                              color: '#f3f4f6'
                            }}
                          />
                          <Legend />
                          <Bar dataKey="count" fill="#3b82f6" name="Generations" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Usage Table */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Detailed Breakdown</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Model</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Type</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Usage Count</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Percentage</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {modelUsage.map((item, index) => {
                              const total = modelUsage.reduce((sum, m) => sum + m.count, 0);
                              const percentage = ((item.count / total) * 100).toFixed(1);
                              return (
                                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                  <td className="px-4 py-2 text-gray-900 dark:text-white font-mono text-xs">{item.model}</td>
                                  <td className="px-4 py-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                      item.type === 'image' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                      item.type === 'video' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' :
                                      item.type === 'audio' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                    }`}>
                                      {item.type || 'text'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-right text-gray-900 dark:text-white font-semibold">{item.count.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-400">{percentage}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Recent activity will appear here
                </div>
              </div>
            </div>
          )}

          {/* Users Section */}
          {activeSection === 'users' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">User Management</h3>
                <button
                  onClick={() => setModals(prev => ({ ...prev, user: { open: true, editing: null } }))}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add User</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={filters.userSearch}
                      onChange={(e) => setFilters(prev => ({ ...prev, userSearch: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <select
                  value={filters.userStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, userStatus: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select
                  value={filters.userRole}
                  onChange={(e) => setFilters(prev => ({ ...prev, userRole: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Credits</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      paginatedUsers.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold mr-3">
                                {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {user.displayName || 'No Name'}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">ID: {user.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{user.email}</td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              user.role === 'admin' 
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {user.role || 'user'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.credits?.current || 0}
                              </span>
                              <button
                                onClick={() => handleTopupCredits(user.id, 100)}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                title="Add 100 credits"
                              >
                                <Coins className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              user.isActive !== false
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {user.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {user.createdAt?.toDate ? new Date(user.createdAt.toDate()).toLocaleDateString() : 
                             user.createdAt?.seconds ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() :
                             user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setModals(prev => ({ ...prev, user: { open: true, editing: user } }))}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Edit user"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                title="Delete user"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredUsers.length > 0 && (
                <PaginationControls
                  currentPage={pagination.users.page}
                  totalPages={getTotalPages(filteredUsers, 'users')}
                  totalItems={filteredUsers.length}
                  perPage={pagination.users.perPage}
                  onPageChange={(page) => handlePageChange('users', page)}
                  onPerPageChange={(perPage) => handlePerPageChange('users', perPage)}
                  startIndex={(pagination.users.page - 1) * pagination.users.perPage + 1}
                  endIndex={Math.min(pagination.users.page * pagination.users.perPage, filteredUsers.length)}
                />
              )}
            </div>
          )}

          {/* Projects Section */}
          {activeSection === 'projects' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Project Management</h3>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={filters.projectSearch}
                      onChange={(e) => setFilters(prev => ({ ...prev, projectSearch: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <select
                  value={filters.projectStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, projectStatus: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* Projects Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredProjects.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No projects found
                        </td>
                      </tr>
                    ) : (
                      paginatedProjects.map(project => (
                        <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{project.name || 'Unnamed Project'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">ID: {project.id}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{project.userEmail || 'Unknown'}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {project.createdAt?.toDate ? new Date(project.createdAt.toDate()).toLocaleDateString() :
                             project.createdAt?.seconds ? new Date(project.createdAt.seconds * 1000).toLocaleDateString() :
                             project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              project.status === 'archived'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            }`}>
                              {project.status || 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => handleDeleteProject(project.id, project.userId)}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredProjects.length > 0 && (
                <PaginationControls
                  currentPage={pagination.projects.page}
                  totalPages={getTotalPages(filteredProjects, 'projects')}
                  totalItems={filteredProjects.length}
                  perPage={pagination.projects.perPage}
                  onPageChange={(page) => handlePageChange('projects', page)}
                  onPerPageChange={(perPage) => handlePerPageChange('projects', perPage)}
                  startIndex={(pagination.projects.page - 1) * pagination.projects.perPage + 1}
                  endIndex={Math.min(pagination.projects.page * pagination.projects.perPage, filteredProjects.length)}
                />
              )}
            </div>
          )}

          {/* Models Section */}
          {activeSection === 'models' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Model Management</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSyncOpenAIModels}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Sync OpenAI</span>
                  </button>
                  <button
                    onClick={handleSyncGeminiModels}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Sync Gemini</span>
                  </button>
                  <button
                    onClick={() => setModals(prev => ({ ...prev, model: { open: true, editing: null } }))}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Model</span>
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search models..."
                      value={filters.modelSearch}
                      onChange={(e) => setFilters(prev => ({ ...prev, modelSearch: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <select
                  value={filters.modelType}
                  onChange={(e) => setFilters(prev => ({ ...prev, modelType: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Types</option>
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                </select>
                <select
                  value={filters.modelProvider}
                  onChange={(e) => setFilters(prev => ({ ...prev, modelProvider: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Providers</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                </select>
                <select
                  value={filters.modelStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, modelStatus: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Models Summary */}
              <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total Models: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">{filteredModels.length}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Video Models: </span>
                      <span className="font-semibold text-green-600 dark:text-green-400">
                        {filteredModels.filter(m => {
                          const type = m.type || (m.id?.includes('sora') ? 'video' : null);
                          return type === 'video';
                        }).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Showing: </span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {paginatedModels.length} of {filteredModels.length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Models Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Model ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Provider</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Active</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Source</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredModels.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No models found
                        </td>
                      </tr>
                    ) : (
                      paginatedModels.map(model => (
                        <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{model.id}</div>
                            {model.originalId && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">Original: {model.originalId}</div>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{model.name || 'Unnamed Model'}</td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {(() => {
                              // Infer type from model ID if type is missing
                              const displayType = model.type || 
                                (model.id?.includes('sora') ? 'video' :
                                 model.id?.includes('tts') ? 'audio' :
                                 model.id?.includes('dall-e') || model.id?.includes('imagen') ? 'image' : 'text');
                              return (
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                  displayType === 'text' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                  displayType === 'image' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                  displayType === 'audio' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                  displayType === 'video' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                }`}>
                                  {displayType}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{model.provider || 'Unknown'}</td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={model.isActive || model.status === 'active'}
                                onChange={(e) => handleToggleModelActive(model.id, e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                            </label>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              (model.status === 'active' || model.isActive)
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {model.status || (model.isActive ? 'active' : 'inactive')}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setModals(prev => ({ ...prev, model: { open: true, editing: model } }))}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteModel(model.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredModels.length > 0 && (
                <PaginationControls
                  currentPage={pagination.models.page}
                  totalPages={getTotalPages(filteredModels, 'models')}
                  totalItems={filteredModels.length}
                  perPage={pagination.models.perPage}
                  onPageChange={(page) => handlePageChange('models', page)}
                  onPerPageChange={(perPage) => handlePerPageChange('models', perPage)}
                  startIndex={(pagination.models.page - 1) * pagination.models.perPage + 1}
                  endIndex={Math.min(pagination.models.page * pagination.models.perPage, filteredModels.length)}
                />
              )}
            </div>
          )}

          {/* Templates Section */}
          {activeSection === 'templates' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Templates</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={populateDefaultTemplates}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    title="Create default templates in database"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Populate Default Templates
                  </button>
                  <button
                    onClick={() => {
                      setModals(prev => ({ ...prev, template: { open: true, editing: null } }));
                      setFormData({});
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Create Template
                  </button>
                </div>
              </div>

              {/* Templates Table */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Icon</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cells</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredTemplates.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                            No templates found. Click "Populate Default Templates" to create default templates.
                          </td>
                        </tr>
                      ) : (
                        paginatedTemplates.map(template => (
                          <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-4 whitespace-nowrap text-2xl">{template.icon || '📝'}</td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{template.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{template.id}</div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                template.category === 'content' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                template.category === 'marketing' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                template.category === 'business' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                template.category === 'productivity' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                template.category === 'education' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                                template.category === 'creative' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' :
                                'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                              }`}>
                                {template.category || 'uncategorized'}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {template.cells?.length || 0} cards
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                              {template.description || 'No description'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setModals(prev => ({ ...prev, template: { open: true, editing: template.id } }));
                                    setFormData(template);
                                  }}
                                  className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(template.id)}
                                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {filteredTemplates.length > 0 && (
                  <PaginationControls
                    currentPage={pagination.templates.page}
                    totalPages={getTotalPages(filteredTemplates, 'templates')}
                    totalItems={filteredTemplates.length}
                    perPage={pagination.templates.perPage}
                    onPageChange={(page) => handlePageChange('templates', page)}
                    onPerPageChange={(perPage) => handlePerPageChange('templates', perPage)}
                    startIndex={(pagination.templates.page - 1) * pagination.templates.perPage + 1}
                    endIndex={Math.min(pagination.templates.page * pagination.templates.perPage, filteredTemplates.length)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Packages Section */}
          {activeSection === 'packages' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription Packages</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={populateDefaultPackages}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    title="Create default packages (Free, Starter, Pro, Enterprise) in database"
                  >
                    <Plus className="h-4 w-4" />
                    {adminData.packages.length === 0 ? 'Populate Default Packages' : 'Re-populate Packages'}
                  </button>
                  <button
                    onClick={() => {
                      setFormData({});
                      setModals(prev => ({ ...prev, package: { open: true, editing: null } }));
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Package
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Credits</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stripe Price ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPackages.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                          No packages found. Create your first package to get started.
                        </td>
                      </tr>
                    ) : (
                      paginatedPackages.map((pkg) => (
                        <tr key={pkg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{pkg.id}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{pkg.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${pkg.price?.toFixed(2) || '0.00'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{pkg.monthlyCredits || 0}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">{pkg.priceId || 'Not set'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setFormData(pkg);
                                  setModals(prev => ({ ...prev, package: { open: true, editing: pkg.id } }));
                                }}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeletePackage(pkg.id)}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                {filteredPackages.length > 0 && (
                  <PaginationControls
                    currentPage={pagination.packages.page}
                    totalPages={getTotalPages(filteredPackages, 'packages')}
                    totalItems={filteredPackages.length}
                    perPage={pagination.packages.perPage}
                    onPageChange={(page) => handlePageChange('packages', page)}
                    onPerPageChange={(perPage) => handlePerPageChange('packages', perPage)}
                    startIndex={(pagination.packages.page - 1) * pagination.packages.perPage + 1}
                    endIndex={Math.min(pagination.packages.page * pagination.packages.perPage, filteredPackages.length)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Subscriptions Section */}
          {activeSection === 'subscriptions' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription Management</h3>
                <button
                  onClick={loadSubscriptions}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search subscriptions..."
                      value={filters.subscriptionSearch || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, subscriptionSearch: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <select
                  value={filters.subscriptionPlan || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, subscriptionPlan: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Plans</option>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <select
                  value={filters.subscriptionStatus || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, subscriptionStatus: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Subscriptions Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Credits</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Stripe ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredSubscriptions.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No subscriptions found
                        </td>
                      </tr>
                    ) : (
                      paginatedSubscriptions.map(subscription => (
                        <tr key={subscription.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{subscription.userEmail}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{subscription.displayName || 'No name'}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              subscription.plan === 'enterprise' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                              subscription.plan === 'pro' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                              subscription.plan === 'starter' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {plans[subscription.plan]?.name || subscription.plan}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {subscription.credits?.current || 0} / {subscription.credits?.total || 0}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              subscription.status === 'active'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : subscription.status === 'past_due'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {subscription.status || 'active'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {subscription.stripeSubscriptionId ? subscription.stripeSubscriptionId.substring(0, 20) + '...' : 'N/A'}
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditSubscription(subscription)}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                title="Edit Subscription"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleResetUserCredits(subscription.userId, subscription.plan)}
                                className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                title="Reset Credits"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredSubscriptions.length > 0 && (
                <PaginationControls
                  currentPage={pagination.subscriptions.page}
                  totalPages={getTotalPages(filteredSubscriptions, 'subscriptions')}
                  totalItems={filteredSubscriptions.length}
                  perPage={pagination.subscriptions.perPage}
                  onPageChange={(page) => handlePageChange('subscriptions', page)}
                  onPerPageChange={(perPage) => handlePerPageChange('subscriptions', perPage)}
                  startIndex={(pagination.subscriptions.page - 1) * pagination.subscriptions.perPage + 1}
                  endIndex={Math.min(pagination.subscriptions.page * pagination.subscriptions.perPage, filteredSubscriptions.length)}
                />
              )}
            </div>
          )}

          {/* Payments Section */}
          {activeSection === 'payments' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Management</h3>
                <button
                  onClick={loadPayments}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search payments..."
                      value={filters.paymentSearch || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, paymentSearch: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <select
                  value={filters.paymentStatus || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, paymentStatus: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="past_due">Past Due</option>
                </select>
                <input
                  type="date"
                  value={filters.paymentDateFrom || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, paymentDateFrom: e.target.value }))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="From Date"
                />
              </div>

              {/* Payments Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transaction ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No payments found
                        </td>
                      </tr>
                    ) : (
                      paginatedPayments.map(payment => (
                        <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                              {payment.id?.substring(0, 20)}...
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{payment.userEmail}</td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {plans[payment.plan]?.name || payment.plan || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                            ${payment.amount?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              payment.status === 'completed'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : payment.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {payment.date?.toDate ? new Date(payment.date.toDate()).toLocaleDateString() :
                             payment.date?.seconds ? new Date(payment.date.seconds * 1000).toLocaleDateString() :
                             payment.date ? new Date(payment.date).toLocaleDateString() : 'Unknown'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredPayments.length > 0 && (
                <PaginationControls
                  currentPage={pagination.payments.page}
                  totalPages={getTotalPages(filteredPayments, 'payments')}
                  totalItems={filteredPayments.length}
                  perPage={pagination.payments.perPage}
                  onPageChange={(page) => handlePageChange('payments', page)}
                  onPerPageChange={(perPage) => handlePerPageChange('payments', perPage)}
                  startIndex={(pagination.payments.page - 1) * pagination.payments.perPage + 1}
                  endIndex={Math.min(pagination.payments.page * pagination.payments.perPage, filteredPayments.length)}
                />
              )}
            </div>
          )}

          {/* Analytics Section */}
          {activeSection === 'analytics' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                        ${analytics.totalRevenue.toFixed(2)}
                      </p>
                    </div>
                    <CreditCard className="h-12 w-12 text-green-500" />
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Active Users</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                        {analytics.activeUsers}
                      </p>
                    </div>
                    <Users className="h-12 w-12 text-blue-500" />
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Inactive Users</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                        {analytics.inactiveUsers}
                      </p>
                    </div>
                    <Users className="h-12 w-12 text-gray-400" />
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Subscriptions</p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                        {analytics.subscriptionDistribution.reduce((sum, s) => sum + s.value, 0)}
                      </p>
                    </div>
                    <Crown className="h-12 w-12 text-yellow-500" />
                  </div>
                </div>
              </div>

              {/* User Growth Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Growth Over Time</h3>
                {analytics.userGrowth.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={analytics.userGrowth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6'
                        }}
                      />
                      <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Subscription Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subscription Distribution</h3>
                  {analytics.subscriptionDistribution.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">No data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.subscriptionDistribution}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {analytics.subscriptionDistribution.map((entry, index) => {
                            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                          })}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#1f2937', 
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#f3f4f6'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payment Status Breakdown</h3>
                  {analytics.paymentStatusBreakdown.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">No data available</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={analytics.paymentStatusBreakdown}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {analytics.paymentStatusBreakdown.map((entry, index) => {
                            const colors = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];
                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                          })}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#1f2937', 
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#f3f4f6'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Revenue Trends */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue Trends</h3>
                {analytics.paymentTrends.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.paymentTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6'
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue ($)" />
                      <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Payment Count" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Revenue by Plan */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue by Subscription Plan</h3>
                {analytics.revenueByPlan.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">No data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.revenueByPlan}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6'
                        }}
                        formatter={(value) => `$${value.toFixed(2)}`}
                      />
                      <Bar dataKey="revenue" fill="#10b981" name="Revenue ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Model Usage Chart (from dashboard) */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Model Usage Statistics</h3>
                {modelUsage.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">No usage data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={modelUsage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="model" 
                        angle={-45}
                        textAnchor="end"
                        height={120}
                        tick={{ fontSize: 12 }}
                        stroke="#6b7280"
                      />
                      <YAxis 
                        label={{ value: 'Usage Count', angle: -90, position: 'insideLeft' }}
                        stroke="#6b7280"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1f2937', 
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f3f4f6'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="count" fill="#3b82f6" name="Generations" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Settings Section */}
          {activeSection === 'settings' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Settings</h3>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                This section is coming soon
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
              notification.type === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-green-500 text-white'
            }`}
          >
            {notification.type === 'error' ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            <span>{notification.message}</span>
            <button
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
              className="ml-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* User Modal */}
      {modals.user.open && (
        <UserModal
          user={modals.user.editing}
          onClose={() => setModals(prev => ({ ...prev, user: { open: false, editing: null } }))}
          onSave={async (userData) => {
            if (modals.user.editing) {
              const result = await updateUser(modals.user.editing.id, userData);
              if (result.success) {
                showNotification('User updated successfully', 'success');
                loadUsers();
              } else {
                showNotification(`Failed to update user: ${result.error}`, 'error');
              }
            }
            setModals(prev => ({ ...prev, user: { open: false, editing: null } }));
          }}
        />
      )}

      {/* Model Modal */}
      {modals.model.open && (
        <ModelModal
          model={modals.model.editing}
          onClose={() => setModals(prev => ({ ...prev, model: { open: false, editing: null } }))}
          onSave={async (modelData) => {
            if (modals.model.editing) {
              const result = await updateModel(modals.model.editing.id, modelData);
              if (result.success) {
                showNotification('Model updated successfully', 'success');
                loadModels();
              } else {
                showNotification(`Failed to update model: ${result.error}`, 'error');
              }
            } else {
              const result = await createModel(modelData);
              if (result.success) {
                showNotification('Model created successfully', 'success');
                loadModels();
              } else {
                showNotification(`Failed to create model: ${result.error}`, 'error');
              }
            }
            setModals(prev => ({ ...prev, model: { open: false, editing: null } }));
          }}
        />
      )}

      {/* Package Modal */}
      {modals.package.open && (
        <PackageModal
          package={modals.package.editing ? adminData.packages.find(p => p.id === modals.package.editing) : null}
          onClose={() => {
            setModals(prev => ({ ...prev, package: { open: false, editing: null } }));
            setFormData({});
          }}
          onSave={async (packageData) => {
            if (modals.package.editing) {
              await handleUpdatePackage(packageData);
            } else {
              await handleCreatePackage(packageData);
            }
          }}
          formData={formData}
          setFormData={setFormData}
        />
      )}

      {/* Template Modal */}
      {modals.template.open && (
        <TemplateModal
          template={modals.template.editing ? adminData.templates.find(t => t.id === modals.template.editing) : null}
          onClose={() => {
            setModals(prev => ({ ...prev, template: { open: false, editing: null } }));
            setFormData({});
          }}
          onSave={async (templateData) => {
            if (modals.template.editing) {
              await handleUpdateTemplate(templateData);
            } else {
              await handleCreateTemplate(templateData);
            }
          }}
          formData={formData}
          setFormData={setFormData}
        />
      )}
    </div>
  );
};

// User Modal Component
const UserModal = ({ user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    displayName: user?.displayName || '',
    role: user?.role || 'user',
    subscription: user?.subscription || 'free',
    isActive: user?.isActive !== false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {user ? 'Edit User' : 'Add User'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subscription</label>
            <select
              value={formData.subscription}
              onChange={(e) => setFormData(prev => ({ ...prev, subscription: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="free">Free</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Model Modal Component
const ModelModal = ({ model, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    id: model?.id || '',
    originalId: model?.originalId || '',
    name: model?.name || '',
    type: model?.type || 'text',
    provider: model?.provider || 'openai',
    description: model?.description || '',
    isActive: model?.isActive !== false,
    status: model?.status || 'active'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {model ? 'Edit Model' : 'Add Model'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model ID</label>
            <input
              type="text"
              value={formData.id}
              onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
              disabled={!!model}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Original ID</label>
            <input
              type="text"
              value={formData.originalId}
              onChange={(e) => setFormData(prev => ({ ...prev, originalId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="e.g., openai/gpt-4"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData(prev => ({ ...prev, provider: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked, status: e.target.checked ? 'active' : 'inactive' }))}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Template Modal Component (for Admin)
const TemplateModal = ({ template, onClose, onSave, formData, setFormData }) => {
  const [localFormData, setLocalFormData] = useState({
    id: formData?.id || template?.id || '',
    name: formData?.name || template?.name || '',
    description: formData?.description || template?.description || '',
    category: formData?.category || template?.category || 'content',
    icon: formData?.icon || template?.icon || '📝',
    cells: formData?.cells || template?.cells || []
  });

  useEffect(() => {
    setFormData(localFormData);
  }, [localFormData, setFormData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(localFormData);
  };

  const addCell = () => {
    // Generate cell reference like A1, B1, C1, A2, B2, etc.
    const col = String.fromCharCode(65 + (localFormData.cells.length % 26)); // A-Z
    const row = Math.floor(localFormData.cells.length / 26) + 1; // 1, 2, 3, etc.
    const nextCellId = `${col}${row}`;
    
    setLocalFormData(prev => ({
      ...prev,
      cells: [...prev.cells, {
        cellId: nextCellId,
        cellReference: nextCellId,
        name: '',
        prompt: '',
        modelType: 'text',
        preferredModel: '',
        temperature: 0.7,
        x: 100,
        y: 100
      }]
    }));
  };

  const updateCell = (index, field, value) => {
    const newCells = [...localFormData.cells];
    newCells[index] = { ...newCells[index], [field]: value };
    setLocalFormData(prev => ({ ...prev, cells: newCells }));
  };

  const removeCell = (index) => {
    setLocalFormData(prev => ({
      ...prev,
      cells: prev.cells.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {template ? 'Edit Template' : 'Add Template'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template ID</label>
              <input
                type="text"
                value={localFormData.id}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                placeholder="e.g., blog-post, social-media-post"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
              <input
                type="text"
                value={localFormData.icon}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, icon: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="📝"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={localFormData.name}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={localFormData.description}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <select
              value={localFormData.category}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="content">Content Creation</option>
              <option value="marketing">Marketing</option>
              <option value="business">Business</option>
              <option value="productivity">Productivity</option>
              <option value="education">Education</option>
              <option value="creative">Creative</option>
              <option value="personal">Personal</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cells</label>
              <button
                type="button"
                onClick={addCell}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
              >
                <Plus className="h-4 w-4 inline mr-1" />
                Add Cell
              </button>
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              {localFormData.cells.map((cell, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cell {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeCell(index)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Cell Reference (e.g., A1, B1)"
                      value={cell.cellId || cell.cellReference || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        updateCell(index, 'cellId', value);
                        updateCell(index, 'cellReference', value);
                      }}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Cell name"
                      value={cell.name}
                      onChange={(e) => updateCell(index, 'name', e.target.value)}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <select
                      value={cell.modelType || 'text'}
                      onChange={(e) => updateCell(index, 'modelType', e.target.value)}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                    </select>
                  </div>
                  <textarea
                    placeholder="Prompt"
                    value={cell.prompt}
                    onChange={(e) => updateCell(index, 'prompt', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {template ? 'Update' : 'Create'} Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Package Modal Component
const PackageModal = ({ package: pkg, onClose, onSave, formData, setFormData }) => {
  const [localFormData, setLocalFormData] = useState({
    id: formData?.id || pkg?.id || '',
    name: formData?.name || pkg?.name || '',
    price: formData?.price || pkg?.price || 0,
    priceId: formData?.priceId || pkg?.priceId || '',
    monthlyCredits: formData?.monthlyCredits || pkg?.monthlyCredits || 0,
    features: formData?.features || pkg?.features || [],
    limits: formData?.limits || pkg?.limits || {
      maxProjects: -1,
      maxSheets: -1,
      maxCells: -1
    }
  });

  useEffect(() => {
    setFormData(localFormData);
  }, [localFormData, setFormData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(localFormData);
  };

  const handleFeatureChange = (index, value) => {
    const newFeatures = [...localFormData.features];
    newFeatures[index] = value;
    setLocalFormData(prev => ({ ...prev, features: newFeatures }));
  };

  const addFeature = () => {
    setLocalFormData(prev => ({ ...prev, features: [...prev.features, ''] }));
  };

  const removeFeature = (index) => {
    const newFeatures = localFormData.features.filter((_, i) => i !== index);
    setLocalFormData(prev => ({ ...prev, features: newFeatures }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {pkg ? 'Edit Package' : 'Add Package'}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Package ID</label>
            <input
              type="text"
              value={localFormData.id}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
              placeholder="e.g., starter, pro, enterprise"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              type="text"
              value={localFormData.name}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={localFormData.price}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Credits</label>
              <input
                type="number"
                min="0"
                value={localFormData.monthlyCredits}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, monthlyCredits: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Stripe Price ID</label>
            <input
              type="text"
              value={localFormData.priceId}
              onChange={(e) => setLocalFormData(prev => ({ ...prev, priceId: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="price_..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Features</label>
            <div className="space-y-2">
              {localFormData.features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={feature}
                    onChange={(e) => handleFeatureChange(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Feature description"
                  />
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addFeature}
                className="text-sm text-blue-600 hover:text-blue-900 dark:text-blue-400"
              >
                + Add Feature
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Projects</label>
              <input
                type="number"
                value={localFormData.limits.maxProjects === -1 ? '' : localFormData.limits.maxProjects}
                onChange={(e) => setLocalFormData(prev => ({ 
                  ...prev, 
                  limits: { ...prev.limits, maxProjects: e.target.value === '' ? -1 : parseInt(e.target.value) }
                }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Sheets</label>
              <input
                type="number"
                value={localFormData.limits.maxSheets === -1 ? '' : localFormData.limits.maxSheets}
                onChange={(e) => setLocalFormData(prev => ({ 
                  ...prev, 
                  limits: { ...prev.limits, maxSheets: e.target.value === '' ? -1 : parseInt(e.target.value) }
                }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Cells</label>
              <input
                type="number"
                value={localFormData.limits.maxCells === -1 ? '' : localFormData.limits.maxCells}
                onChange={(e) => setLocalFormData(prev => ({ 
                  ...prev, 
                  limits: { ...prev.limits, maxCells: e.target.value === '' ? -1 : parseInt(e.target.value) }
                }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Unlimited"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {pkg ? 'Update' : 'Create'} Package
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Pagination Controls Component
const PaginationControls = ({ 
  currentPage, 
  totalPages, 
  totalItems, 
  perPage, 
  onPageChange, 
  onPerPageChange,
  startIndex,
  endIndex
}) => {
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="flex items-center justify-between mt-4 px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Showing <span className="font-medium">{startIndex}</span> to <span className="font-medium">{endIndex}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </span>
        <select
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value={10}>10 per page</option>
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-gray-500 dark:text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
                  currentPage === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                {page}
              </button>
            )
          ))}
        </div>
        
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;

