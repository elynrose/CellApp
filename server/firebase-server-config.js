/**
 * Firebase Server Configuration
 * Handles Firebase Admin SDK initialization and API key retrieval
 */

const admin = require('firebase-admin');

let firestore = null;

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebase() {
  try {
    if (firestore) {
      return firestore;
    }

    // Check if we're in production (Railway/Heroku) or development
    if (process.env.NODE_ENV === 'production') {
      // Production: Use environment variables for service account
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          // Check if the environment variable is empty or invalid
          if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim() === '') {
            console.log('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY is empty, skipping Firebase Admin SDK');
            return null;
          }
          
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          // Check if the service account has a valid private_key
          if (serviceAccount.private_key && serviceAccount.private_key !== '' && serviceAccount.private_key !== '""' && !serviceAccount.private_key.includes('""')) {
            console.log('✅ Using Firebase service account credentials');
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
              projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai',
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app'
            });
          } else {
            // Invalid service account, skip Firebase Admin SDK initialization
            console.log('⚠️ Invalid Firebase service account (no private_key), skipping Firebase Admin SDK');
            console.log('⚠️ Firebase client config will still work via /firebase-config.js endpoint');
            return null; // Return null to indicate no Firebase Admin SDK
          }
        } catch (error) {
          // Invalid JSON, skip Firebase Admin SDK initialization
          console.log('⚠️ Invalid Firebase service account JSON, skipping Firebase Admin SDK');
          console.log('⚠️ Error details:', error.message);
          console.log('⚠️ Firebase client config will still work via /firebase-config.js endpoint');
          return null; // Return null to indicate no Firebase Admin SDK
        }
      } else {
        // Fallback: Use default credentials (for Railway/Heroku)
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai',
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app'
        });
      }
    } else {
      // Development: Use environment variables or service account file
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          // Check if the service account has a valid private_key
          if (serviceAccount.private_key && serviceAccount.private_key !== '') {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
              projectId: process.env.FIREBASE_PROJECT_ID || 'cellulai',
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app'
            });
          } else {
            // Invalid service account, try local file or default
            console.log('⚠️ Invalid Firebase service account, trying local file');
            try {
              const serviceAccount = require('./cellulai-firebase-adminsdk-fbsvc-ec0b26e7de.json');
              admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: 'cellulai',
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app'
              });
            } catch (error) {
              admin.initializeApp({
                projectId: 'cellulai'
              });
            }
          }
        } catch (error) {
          // Invalid JSON, try local file or default
          console.log('⚠️ Invalid Firebase service account JSON, trying local file');
          try {
            const serviceAccount = require('./cellulai-firebase-adminsdk-fbsvc-ec0b26e7de.json');
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
              projectId: 'cellulai'
            });
          } catch (error) {
            admin.initializeApp({
              projectId: 'cellulai',
              storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'cellulai.firebasestorage.app'
            });
          }
        }
      } else {
        // Fallback: Use service account file (if available)
        try {
          const serviceAccount = require('./cellulai-firebase-adminsdk-fbsvc-ec0b26e7de.json');
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: 'cellulai'
          });
        } catch (error) {
          // No service account file, use default credentials
          admin.initializeApp({
            projectId: 'cellulai'
          });
        }
      }
    }

    firestore = admin.firestore();
    console.log('✅ Firebase Admin SDK initialized');
    return firestore;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    return null;
  }
}

/**
 * Get OpenAI API key from Firebase
 */
async function getOpenAIApiKey() {
  try {
    if (!firestore) {
      await initializeFirebase();
    }

    if (!firestore) {
      console.log('⚠️ Firebase not available, using environment fallback');
      return process.env.OPENAI_API_KEY;
    }

    // Get OpenAI configuration from Firebase
    const doc = await firestore.collection('settings').doc('openai').get();
    
    if (doc.exists) {
      const data = doc.data();
      const apiKey = data.apiKey;
      
      if (apiKey) {
        console.log('✅ OpenAI API key retrieved from Firebase');
        return apiKey;
      }
    }

    console.log('⚠️ OpenAI API key not found in Firebase');
    return process.env.OPENAI_API_KEY;
    
  } catch (error) {
    console.error('❌ Error getting OpenAI API key from Firebase:', error);
    return process.env.OPENAI_API_KEY;
  }
}

/**
 * Get Gemini API key from Firebase
 */
async function getGeminiApiKey() {
  try {
    if (!firestore) {
      await initializeFirebase();
    }

    if (!firestore) {
      console.log('⚠️ Firebase not available, using environment fallback');
      return process.env.GEMINI_API_KEY;
    }

    // Get Gemini configuration from Firebase
    const doc = await firestore.collection('settings').doc('gemini').get();
    
    if (doc.exists) {
      const data = doc.data();
      const apiKey = data.apiKey;
      
      if (apiKey) {
        console.log('✅ Gemini API key retrieved from Firebase');
        return apiKey;
      }
    }

    console.log('⚠️ Gemini API key not found in Firebase');
    return process.env.GEMINI_API_KEY;
    
  } catch (error) {
    console.error('❌ Error getting Gemini API key from Firebase:', error);
    return process.env.GEMINI_API_KEY;
  }
}

/**
 * Get active models from Firebase
 */
async function getActiveModelsFromFirebase() {
  try {
    if (!firestore) {
      console.log('🔄 Initializing Firebase for models...');
      const initResult = await initializeFirebase();
      if (!initResult) {
        console.log('⚠️ Firebase initialization returned null - Firestore not available');
        return [];
      }
      firestore = initResult;
    }

    if (!firestore) {
      console.log('⚠️ Firebase not available for models - firestore is null after initialization');
      return [];
    }

    // Verify Firestore is actually working by testing a simple operation
    try {
      console.log('🔍 Testing Firestore connection...');
      // Try to get a count of models collection (this will fail if credentials are wrong)
      const testSnapshot = await firestore.collection('models').limit(1).get();
      console.log('✅ Firestore connection test successful');
    } catch (testError) {
      console.error('❌ Firestore connection test failed:', testError.message);
      console.error('❌ This usually means Firebase credentials are invalid or missing');
      return [];
    }

    console.log('🔍 Querying Firestore for active models...');
    
    // Try querying by isActive first
    let modelsSnapshot;
    try {
      modelsSnapshot = await firestore.collection('models').where('isActive', '==', true).get();
      console.log(`📊 Query by isActive returned ${modelsSnapshot.size} documents`);
    } catch (queryError) {
      console.log('⚠️ Query by isActive failed, trying alternative query:', queryError.message);
      console.log('⚠️ Error details:', {
        code: queryError.code,
        name: queryError.name,
        message: queryError.message
      });
      // Fallback: try querying by status
      try {
        modelsSnapshot = await firestore.collection('models').where('status', '==', 'active').get();
        console.log(`📊 Query by status returned ${modelsSnapshot.size} documents`);
      } catch (statusError) {
        console.log('⚠️ Query by status also failed, getting all models and filtering:', statusError.message);
        console.log('⚠️ Status error details:', {
          code: statusError.code,
          name: statusError.name,
          message: statusError.message
        });
        // Last resort: get all models and filter in memory
        try {
          modelsSnapshot = await firestore.collection('models').get();
          console.log(`📊 Retrieved all ${modelsSnapshot.size} models, filtering for active ones`);
        } catch (allError) {
          console.error('❌ Failed to get all models from Firestore:', allError.message);
          throw allError; // Re-throw to be caught by outer catch
        }
      }
    }
    
    const models = [];
    
    modelsSnapshot.forEach(doc => {
      const modelData = doc.data();
      
      // Check if model is active (support both isActive and status fields)
      const isActive = modelData.isActive === true || modelData.status === 'active';
      
      if (isActive) {
        // Map all fields from Firebase, including originalId if present
        const model = {
          id: doc.id,
          name: modelData.name || doc.id,
          type: modelData.type || 'text',
          provider: modelData.provider || 'unknown',
          active: true,
          description: modelData.description || ''
        };
        
        // Include originalId if present (for API calls)
        if (modelData.originalId) {
          model.originalId = modelData.originalId;
        }
        
        // Include any other fields that might be useful
        if (modelData.temperature !== undefined) {
          model.temperature = modelData.temperature;
        }
        if (modelData.maxTokens !== undefined) {
          model.maxTokens = modelData.maxTokens;
        }
        
        models.push(model);
      }
    });

    console.log(`✅ Retrieved ${models.length} active models from Firebase (out of ${modelsSnapshot.size} total)`);
    
    if (models.length === 0 && modelsSnapshot.size > 0) {
      console.log('⚠️ No active models found, but models exist in collection. Check isActive/status fields.');
      // Log first model structure for debugging
      const firstDoc = modelsSnapshot.docs[0];
      if (firstDoc) {
        console.log('📋 Sample model structure:', JSON.stringify(firstDoc.data(), null, 2));
      }
    }
    
    return models;
    
  } catch (error) {
    console.error('❌ Error getting models from Firebase:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    return [];
  }
}

/**
 * Save generation to Firebase
 */
async function saveGenerationToFirebase(userId, projectId, sheetId, cellId, generation) {
  try {
    if (!firestore) {
      await initializeFirebase();
    }

    if (!firestore) {
      console.log('⚠️ Firebase not available for saving generation');
      return false;
    }

    await firestore
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId)
      .collection('sheets')
      .doc(sheetId)
      .collection('cells')
      .doc(cellId)
      .collection('generations')
      .add({
        ...generation,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

    console.log('✅ Generation saved to Firebase');
    return true;
    
  } catch (error) {
    console.error('❌ Error saving generation to Firebase:', error);
    return false;
  }
}

/**
 * Diagnostic function to check Firebase connection and models collection
 */
async function diagnoseFirebaseModels() {
  try {
    console.log('🔍 Diagnosing Firebase models connection...');
    
    if (!firestore) {
      console.log('⚠️ Firestore not initialized, attempting initialization...');
      await initializeFirebase();
    }
    
    if (!firestore) {
      return {
        initialized: false,
        error: 'Firestore could not be initialized',
        modelsCount: 0
      };
    }
    
    console.log('✅ Firestore is initialized');
    
    // Try to get all models (no filter) to see if collection exists
    const allModelsSnapshot = await firestore.collection('models').get();
    const allModels = [];
    
    allModelsSnapshot.forEach(doc => {
      allModels.push({
        id: doc.id,
        data: doc.data()
      });
    });
    
    console.log(`📊 Total models in collection: ${allModels.length}`);
    
    if (allModels.length > 0) {
      console.log('📋 Sample model:', JSON.stringify(allModels[0], null, 2));
    }
    
    return {
      initialized: true,
      modelsCount: allModels.length,
      models: allModels,
      sampleModel: allModels.length > 0 ? allModels[0] : null
    };
    
  } catch (error) {
    console.error('❌ Diagnostic error:', error);
    return {
      initialized: false,
      error: error.message,
      modelsCount: 0
    };
  }
}

module.exports = {
  initializeFirebase,
  getOpenAIApiKey,
  getGeminiApiKey,
  getActiveModelsFromFirebase,
  saveGenerationToFirebase,
  diagnoseFirebaseModels
};