// Firestore Service for Projects, Sheets, and Cells
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  where,
  writeBatch,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { db } from './config';

/**
 * Get API base URL based on environment
 */
function getApiBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  return 'https://gpt-cells-app-production.up.railway.app';
}

/**
 * Projects
 */
export async function createProject(userId, projectData) {
  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'projects'), {
      ...projectData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, projectId: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getProjects(userId) {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'users', userId, 'projects'), orderBy('createdAt', 'desc'))
    );
    const projects = [];
    snapshot.forEach(doc => {
      projects.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateProject(userId, projectId, projectData) {
  try {
    await updateDoc(doc(db, 'users', userId, 'projects', projectId), {
      ...projectData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteProject(userId, projectId) {
  try {
    // Get all sheets in the project first
    const sheetsSnapshot = await getDocs(
      collection(db, 'users', userId, 'projects', projectId, 'sheets')
    );

    // Delete each sheet (this will cascade delete all cells, generations, and assets)
    for (const sheetDoc of sheetsSnapshot.docs) {
      const sheetId = sheetDoc.id;
      const deleteSheetResult = await deleteSheet(userId, projectId, sheetId);
      if (!deleteSheetResult.success) {
        console.warn(`⚠️ Failed to delete sheet ${sheetId}:`, deleteSheetResult.error);
        // Continue with other sheets even if one fails
      }
    }

    // Delete the project itself
    await deleteDoc(doc(db, 'users', userId, 'projects', projectId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sheets
 */
export async function createSheet(userId, projectId, sheetData) {
  try {
    const docRef = await addDoc(
      collection(db, 'users', userId, 'projects', projectId, 'sheets'),
      {
        ...sheetData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );
    return { success: true, sheetId: docRef.id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getSheets(userId, projectId) {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'users', userId, 'projects', projectId, 'sheets'),
        orderBy('order', 'asc')
      )
    );
    const sheets = [];
    snapshot.forEach(doc => {
      sheets.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, sheets };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateSheet(userId, projectId, sheetId, sheetData) {
  try {
    await updateDoc(
      doc(db, 'users', userId, 'projects', projectId, 'sheets', sheetId),
      {
        ...sheetData,
        updatedAt: serverTimestamp()
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteSheet(userId, projectId, sheetId) {
  try {
    // Get all cells in the sheet first to collect their IDs
    const cellsSnapshot = await getDocs(
      collection(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells')
    );
    
    const cellIds = [];
    cellsSnapshot.forEach(cellDoc => {
      cellIds.push(cellDoc.id);
    });

    // Delete all generations for all cells
    for (const cellId of cellIds) {
      const deleteGenResult = await deleteAllGenerations(userId, projectId, sheetId, cellId);
      if (!deleteGenResult.success) {
        console.warn(`⚠️ Failed to delete generations for cell ${cellId}:`, deleteGenResult.error);
      }
    }

    // Delete all assets from Firebase Storage for all cells in the sheet
    const { deleteSheetAssets } = await import('./storage');
    const deleteAssetsResult = await deleteSheetAssets(userId, projectId, sheetId, cellIds);
    if (!deleteAssetsResult.success) {
      console.warn(`⚠️ Failed to delete assets for sheet ${sheetId}:`, deleteAssetsResult.error);
    } else {
      console.log(`✅ Deleted ${deleteAssetsResult.deletedCount || 0} assets for sheet ${sheetId}`);
    }

    // Delete all cells from Firestore
    const batch = writeBatch(db);
    cellsSnapshot.forEach(cellDoc => {
      batch.delete(cellDoc.ref);
    });

    // Delete the sheet itself
    batch.delete(
      doc(db, 'users', userId, 'projects', projectId, 'sheets', sheetId)
    );
    await batch.commit();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cells
 */
export async function saveCell(userId, projectId, sheetId, cellId, cellData) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells', cellId),
      {
        ...cellData,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getCell(userId, projectId, sheetId, cellId) {
  try {
    const cellDoc = await getDoc(
      doc(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells', cellId)
    );
    if (cellDoc.exists()) {
      return { success: true, data: cellDoc.data() };
    }
    return { success: false, error: 'Cell not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getSheetCells(userId, projectId, sheetId) {
  try {
    const snapshot = await getDocs(
      collection(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells')
    );
    const cells = [];
    snapshot.forEach(doc => {
      cells.push({ cell_id: doc.id, ...doc.data() });
    });
    return { success: true, cells };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteCell(userId, projectId, sheetId, cellId) {
  try {
    // Delete all generations first (they might reference assets)
    const deleteGenResult = await deleteAllGenerations(userId, projectId, sheetId, cellId);
    if (!deleteGenResult.success) {
      console.warn(`⚠️ Failed to delete generations for cell ${cellId}:`, deleteGenResult.error);
    }

    // Delete all assets from Firebase Storage
    const { deleteCellAssets } = await import('./storage');
    const deleteAssetsResult = await deleteCellAssets(userId, projectId, sheetId, cellId);
    if (!deleteAssetsResult.success) {
      console.warn(`⚠️ Failed to delete assets for cell ${cellId}:`, deleteAssetsResult.error);
    } else {
      console.log(`✅ Deleted ${deleteAssetsResult.deletedCount || 0} assets for cell ${cellId}`);
    }

    // Delete the cell document from Firestore
    await deleteDoc(
      doc(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells', cellId)
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Generations (History)
 */
export async function saveGeneration(userId, projectId, sheetId, cellId, generation) {
  try {
    await addDoc(
      collection(
        db,
        'users',
        userId,
        'projects',
        projectId,
        'sheets',
        sheetId,
        'cells',
        cellId,
        'generations'
      ),
      {
        ...generation,
        timestamp: serverTimestamp()
      }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getGenerations(userId, projectId, sheetId, cellId) {
  try {
    const snapshot = await getDocs(
      query(
        collection(
          db,
          'users',
          userId,
          'projects',
          projectId,
          'sheets',
          sheetId,
          'cells',
          cellId,
          'generations'
        ),
        orderBy('timestamp', 'desc')
      )
    );
    const generations = [];
    snapshot.forEach(doc => {
      generations.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, generations };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteGeneration(userId, projectId, sheetId, cellId, generationId) {
  try {
    await deleteDoc(
      doc(
        db,
        'users',
        userId,
        'projects',
        projectId,
        'sheets',
        sheetId,
        'cells',
        cellId,
        'generations',
        generationId
      )
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete all generations for a cell
 */
export async function deleteAllGenerations(userId, projectId, sheetId, cellId) {
  try {
    const generationsRef = collection(
      db,
      'users',
      userId,
      'projects',
      projectId,
      'sheets',
      sheetId,
      'cells',
      cellId,
      'generations'
    );
    
    const snapshot = await getDocs(generationsRef);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return { success: true, count: snapshot.docs.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all generations across all users (admin only)
 * Used for analytics and usage tracking
 */
export async function getAllGenerations() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const allGenerations = [];

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const projectsSnapshot = await getDocs(
        collection(db, 'users', userId, 'projects')
      );

      for (const projectDoc of projectsSnapshot.docs) {
        const projectId = projectDoc.id;
        const sheetsSnapshot = await getDocs(
          collection(db, 'users', userId, 'projects', projectId, 'sheets')
        );

        for (const sheetDoc of sheetsSnapshot.docs) {
          const sheetId = sheetDoc.id;
          const cellsSnapshot = await getDocs(
            collection(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells')
          );

          for (const cellDoc of cellsSnapshot.docs) {
            const cellId = cellDoc.id;
            const generationsSnapshot = await getDocs(
              collection(db, 'users', userId, 'projects', projectId, 'sheets', sheetId, 'cells', cellId, 'generations')
            );

            generationsSnapshot.forEach(genDoc => {
              allGenerations.push({
                id: genDoc.id,
                userId,
                projectId,
                sheetId,
                cellId,
                ...genDoc.data()
              });
            });
          }
        }
      }
    }

    return { success: true, data: allGenerations };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Models - Get active models from Firebase
 */
export async function getActiveModels() {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'models'), where('isActive', '==', true))
    );
    const models = [];
    snapshot.forEach(doc => {
      const modelData = doc.data();
      models.push({
        id: doc.id,
        name: modelData.name || doc.id,
        type: modelData.type || 'text',
        provider: modelData.provider || 'unknown',
        active: true,
        description: modelData.description || '',
        originalId: modelData.originalId || doc.id
      });
    });
    return { success: true, models };
  } catch (error) {
    // Fallback to API if Firebase fails
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/models`);
      const data = await response.json();
      return { success: true, models: data.models || [] };
    } catch (apiError) {
      return { success: false, error: error.message };
    }
  }
}

// Alias for backward compatibility
export const getAvailableModels = getActiveModels;

/**
 * Admin Functions
 */

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, data: users };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update user (admin only)
 */
export async function updateUser(userId, userData) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...userData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete user (admin only)
 */
export async function deleteUser(userId) {
  try {
    // Get all projects for this user
    const projectsSnapshot = await getDocs(
      collection(db, 'users', userId, 'projects')
    );
    
    const batch = writeBatch(db);
    
    // Delete all projects and their nested data
    projectsSnapshot.forEach(projectDoc => {
      batch.delete(projectDoc.ref);
    });
    
    // Delete user document
    batch.delete(doc(db, 'users', userId));
    await batch.commit();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all projects across all users (admin only)
 */
export async function getAllProjects() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const projects = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userProjectsSnapshot = await getDocs(
        collection(db, 'users', userDoc.id, 'projects')
      );
      
      userProjectsSnapshot.forEach(projectDoc => {
        projects.push({
          id: projectDoc.id,
          userId: userDoc.id,
          userEmail: userDoc.data().email,
          ...projectDoc.data()
        });
      });
    }
    
    return { success: true, data: projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get all models (admin only)
 */
export async function getAllModels() {
  try {
    const snapshot = await getDocs(collection(db, 'models'));
    const models = [];
    snapshot.forEach(doc => {
      models.push({ id: doc.id, ...doc.data() });
    });
    return { success: true, data: models };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update model (admin only)
 */
export async function updateModel(modelId, modelData) {
  try {
    await updateDoc(doc(db, 'models', modelId), {
      ...modelData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create model (admin only)
 */
export async function createModel(modelData) {
  try {
    const modelId = modelData.id || modelData.originalId?.replace(/\//g, '-') || `model-${Date.now()}`;
    await setDoc(doc(db, 'models', modelId), {
      ...modelData,
      id: modelId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { success: true, modelId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete model (admin only)
 */
export async function deleteModel(modelId) {
  try {
    await deleteDoc(doc(db, 'models', modelId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get admin configuration
 */
export async function getAdminConfig(configKey) {
  try {
    const configDoc = await getDoc(doc(db, 'admin', configKey));
    if (configDoc.exists()) {
      return { success: true, data: configDoc.data() };
    }
    return { success: false, error: 'Config not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Set admin configuration
 */
export async function setAdminConfig(configKey, configData) {
  try {
    await setDoc(doc(db, 'admin', configKey), {
      ...configData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Subscription Functions
 */

/**
 * Update user subscription
 */
export async function updateUserSubscription(userId, subscriptionData) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...subscriptionData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update user credits
 */
export async function updateUserCredits(userId, credits) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      credits: {
        ...credits,
        updatedAt: serverTimestamp()
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user profile
 */
export async function getUserProfile(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return { success: true, data: userDoc.data() };
    }
    return { success: false, error: 'User not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, profileData) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      ...profileData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Add credits to user (topup)
 */
export async function addCredits(userId, amount) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const currentCredits = userData.credits?.current || 0;
    const totalCredits = userData.credits?.total || 0;

    const newCredits = currentCredits + amount;
    const newTotal = totalCredits + amount;

    await updateDoc(doc(db, 'users', userId), {
      'credits.current': newCredits,
      'credits.total': newTotal,
      updatedAt: serverTimestamp()
    });

    return { success: true, newCredits, newTotal };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Deduct credits from user
 */
export async function deductCredits(userId, amount) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const currentCredits = userData.credits?.current || 0;

    if (currentCredits < amount) {
      return { success: false, error: 'Insufficient credits' };
    }

    await updateDoc(doc(db, 'users', userId), {
      'credits.current': currentCredits - amount,
      updatedAt: serverTimestamp()
    });

    return { success: true, remainingCredits: currentCredits - amount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Reset monthly credits for a user
 */
export async function resetMonthlyCredits(userId, planId, monthlyCredits) {
  try {
    const now = new Date();
    const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    // Use setDoc with merge to handle nested credits object
    await setDoc(doc(db, 'users', userId), {
      'credits.current': monthlyCredits,
      'credits.total': monthlyCredits,
      'credits.lastReset': now,
      'credits.nextReset': nextReset,
      updatedAt: serverTimestamp()
    }, { merge: true });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get user subscription info
 */
export async function getUserSubscription(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    return {
      success: true,
      data: {
        subscription: userData.subscription || 'free',
        subscriptionStatus: userData.subscriptionStatus || 'active',
        credits: userData.credits || { current: 0, total: 0 },
        stripeCustomerId: userData.stripeCustomerId,
        stripeSubscriptionId: userData.stripeSubscriptionId
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Package Management Functions
 */

/**
 * Get all subscription packages
 */
export async function getAllPackages() {
  try {
    const packagesRef = collection(db, 'packages');
    // Try to order by price, but if it fails (no index or missing field), get all without ordering
    let packagesSnapshot;
    try {
      packagesSnapshot = await getDocs(query(packagesRef, orderBy('price', 'asc')));
    } catch (orderError) {
      // If ordering fails, just get all packages
      console.warn('Could not order packages by price, fetching without order:', orderError);
      packagesSnapshot = await getDocs(packagesRef);
    }
    
    const packages = [];
    packagesSnapshot.forEach((doc) => {
      const data = doc.data();
      packages.push({
        ...data,
        // Use document ID as primary id (overrides data.id if different)
        id: doc.id
      });
    });
    
    // Sort manually by price if ordering failed
    packages.sort((a, b) => (a.price || 0) - (b.price || 0));
    
    return { success: true, data: packages };
  } catch (error) {
    console.error('Error getting packages:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new subscription package
 */
export async function createPackage(packageData) {
  try {
    // Use package id as document ID if provided, otherwise let Firestore generate one
    const packageId = packageData.id;
    if (packageId) {
      const packageRef = doc(db, 'packages', packageId);
      const newPackage = {
        ...packageData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(packageRef, newPackage);
      return { success: true, id: packageId };
    } else {
      const packagesRef = collection(db, 'packages');
      const newPackage = {
        ...packageData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(packagesRef, newPackage);
      return { success: true, id: docRef.id };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update a subscription package
 */
export async function updatePackage(packageId, packageData) {
  try {
    const packageRef = doc(db, 'packages', packageId);
    await updateDoc(packageRef, {
      ...packageData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a subscription package
 */
export async function deletePackage(packageId) {
  try {
    const packageRef = doc(db, 'packages', packageId);
    await deleteDoc(packageRef);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Template Management Functions
 */

/**
 * Get all templates
 */
export async function getAllTemplates() {
  try {
    const templatesRef = collection(db, 'templates');
    const templatesSnapshot = await getDocs(query(templatesRef, orderBy('createdAt', 'desc')));
    
    const templates = [];
    templatesSnapshot.forEach((doc) => {
      const data = doc.data();
      templates.push({
        ...data,
        id: doc.id
      });
    });
    
    return { success: true, data: templates };
  } catch (error) {
    console.error('Error getting templates:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get a template by ID
 */
export async function getTemplateById(templateId) {
  try {
    const templateRef = doc(db, 'templates', templateId);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      return { success: false, error: 'Template not found' };
    }
    
    return { success: true, data: { id: templateDoc.id, ...templateDoc.data() } };
  } catch (error) {
    console.error('Error getting template:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a new template
 */
export async function createTemplate(templateData) {
  try {
    const templateId = templateData.id;
    if (templateId) {
      const templateRef = doc(db, 'templates', templateId);
      const newTemplate = {
        ...templateData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(templateRef, newTemplate);
      return { success: true, id: templateId };
    } else {
      const templatesRef = collection(db, 'templates');
      const newTemplate = {
        ...templateData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(templatesRef, newTemplate);
      return { success: true, id: docRef.id };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Update a template
 */
export async function updateTemplate(templateId, templateData) {
  try {
    const templateRef = doc(db, 'templates', templateId);
    await updateDoc(templateRef, {
      ...templateData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(templateId) {
  try {
    const templateRef = doc(db, 'templates', templateId);
    await deleteDoc(templateRef);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

