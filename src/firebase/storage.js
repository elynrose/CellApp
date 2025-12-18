// Firebase Storage Service for uploading and managing images
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage, auth } from './config';

/**
 * Upload profile photo
 */
export async function uploadProfilePhoto(file, userId) {
  try {
    const fileRef = ref(storage, `users/${userId}/profile/${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Upload an image from a URL to Firebase Storage
 * @param {string} imageUrl - The URL of the image to download and upload
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} sheetId - Sheet ID
 * @param {string} cellId - Cell ID
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadImageFromUrl(imageUrl, userId, projectId, sheetId, cellId) {
  try {
    console.log(`📸 Starting image upload from URL: ${imageUrl.substring(0, 100)}...`);
    // Use proxy endpoint to bypass CORS (especially for Azure blob storage)
    const proxyResponse = await fetch('/api/proxy-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: imageUrl }),
    });

    if (!proxyResponse.ok) {
      let errorMessage = `Failed to proxy image: ${proxyResponse.statusText} (${proxyResponse.status})`;
      try {
        const errorData = await proxyResponse.json();
        errorMessage = errorData.error || errorData.message || errorData.details || errorMessage;
        console.error('❌ Proxy error response:', errorData);
      } catch (e) {
        const text = await proxyResponse.text().catch(() => '');
        errorMessage = text || errorMessage;
        console.error('❌ Proxy error (non-JSON):', text);
      }
      
      // Check if server is reachable
      if (proxyResponse.status === 500 && errorMessage.includes('Unknown error')) {
        errorMessage = 'Server error: The backend server may not be running. Please ensure the Node.js server is running on port 3000.';
      }
      
      throw new Error(errorMessage);
    }

    const proxyData = await proxyResponse.json();
    if (!proxyData.success || !proxyData.dataUrl) {
      console.error('❌ Invalid proxy response:', proxyData);
      throw new Error(proxyData.error || 'Invalid response from proxy endpoint');
    }

    // Convert data URL to blob
    const response = await fetch(proxyData.dataUrl);
    const blob = await response.blob();
    
    // Determine file extension from URL or blob type
    let extension = 'jpg';
    const urlLower = imageUrl.toLowerCase();
    if (urlLower.includes('.png')) extension = 'png';
    else if (urlLower.includes('.gif')) extension = 'gif';
    else if (urlLower.includes('.webp')) extension = 'webp';
    else if (blob.type === 'image/png') extension = 'png';
    else if (blob.type === 'image/gif') extension = 'gif';
    else if (blob.type === 'image/webp') extension = 'webp';

    // Create a unique filename with timestamp
    const timestamp = Date.now();
    const filename = `images/${userId}/${projectId}/${sheetId}/${cellId}/${timestamp}.${extension}`;
    
    // Create a reference to the file location in Storage
    const storageRef = ref(storage, filename);

    // Upload the blob to Firebase Storage with metadata
    const metadata = {
      contentType: blob.type || 'image/jpeg',
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    };
    await uploadBytes(storageRef, blob, metadata);

    // Get the download URL (includes auth token for authenticated access)
    const downloadURL = await getDownloadURL(storageRef);
    console.log(`📸 Image uploaded, download URL: ${downloadURL}`);

    return { success: true, url: downloadURL };
  } catch (error) {
    console.error('Error uploading image to Firebase Storage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload a video from a URL to Firebase Storage
 * @param {string} videoUrl - The URL of the video to download and upload
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} sheetId - Sheet ID
 * @param {string} cellId - Cell ID
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadVideoFromUrl(videoUrl, userId, projectId, sheetId, cellId) {
  try {
    console.log(`📹 Starting video upload:`, { videoUrl: videoUrl.substring(0, 100), userId, projectId, sheetId, cellId });
    
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const errorMsg = 'User not authenticated. Cannot upload video to Firebase Storage.';
      console.error(`❌ ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    if (currentUser.uid !== userId) {
      const errorMsg = `User ID mismatch. Authenticated as ${currentUser.uid}, but trying to upload for ${userId}`;
      console.error(`❌ ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
    
    console.log(`✅ User authenticated: ${currentUser.uid}`);
    
    // Use server-side upload endpoint (streams directly from OpenAI to Firebase, no base64 conversion)
    console.log(`📡 Uploading video via server-side endpoint (streaming, no base64 conversion)...`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error('❌ Upload request timed out after 120 seconds');
    }, 120000); // 120 second timeout for larger videos
    
    let uploadResponse;
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : 'https://gpt-cells-app-production.up.railway.app';
      
      console.log(`📡 Calling upload-video endpoint: ${API_BASE_URL}/api/upload-video`);
      uploadResponse = await fetch(`${API_BASE_URL}/api/upload-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          videoUrl, 
          userId, 
          projectId, 
          sheetId, 
          cellId 
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Upload request timed out. The video may be too large or the server is slow.');
      }
      throw error;
    }

    if (!uploadResponse.ok) {
      let errorMsg = `Failed to upload video: ${uploadResponse.statusText} (${uploadResponse.status})`;
      try {
        const errorData = await uploadResponse.json();
        errorMsg = errorData.error || errorData.message || errorMsg;
        console.error(`❌ Upload error response:`, errorData);
      } catch (e) {
        const text = await uploadResponse.text().catch(() => '');
        errorMsg = text || errorMsg;
        console.error(`❌ Upload error (non-JSON):`, text);
      }
      
      // Check for expired video URL
      if (errorMsg.includes('no longer available') || errorMsg.includes('expire') || errorMsg.includes('1 hours')) {
        errorMsg = 'Video URL expired. OpenAI video URLs expire after 1 hour. The video must be saved immediately after generation. Please regenerate the video.';
      }
      
      console.error(`❌ Upload error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const uploadData = await uploadResponse.json();
    if (!uploadData.success || !uploadData.url) {
      const errorMsg = 'Invalid response from upload endpoint';
      console.error(`❌ ${errorMsg}:`, uploadData);
      throw new Error(errorMsg);
    }

    console.log(`🎬 Video uploaded successfully! Firebase URL: ${uploadData.url.substring(0, 100)}...`);

    return { success: true, url: uploadData.url };
  } catch (error) {
    console.error('❌ Error uploading video to Firebase Storage:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

/**
 * Upload an audio file from a URL or data URL to Firebase Storage
 * @param {string} audioUrl - The URL or data URL of the audio to upload
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} sheetId - Sheet ID
 * @param {string} cellId - Cell ID
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadAudioFromUrl(audioUrl, userId, projectId, sheetId, cellId) {
  try {
    let blob;
    
    // Handle data URLs (base64 audio from TTS)
    if (audioUrl.startsWith('data:audio')) {
      console.log('📢 Uploading audio from data URL...');
      // Convert data URL to blob
      const response = await fetch(audioUrl);
      blob = await response.blob();
    } else {
      // Handle regular URLs - use proxy endpoint to bypass CORS
      console.log(`📢 Starting audio upload from URL: ${audioUrl.substring(0, 100)}...`);
      const proxyResponse = await fetch('/api/proxy-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      });

      if (!proxyResponse.ok) {
        let errorMessage = `Failed to proxy audio: ${proxyResponse.statusText} (${proxyResponse.status})`;
        try {
          const errorData = await proxyResponse.json();
          errorMessage = errorData.error || errorData.message || errorData.details || errorMessage;
          console.error('❌ Proxy error response:', errorData);
        } catch (e) {
          const text = await proxyResponse.text().catch(() => '');
          errorMessage = text || errorMessage;
          console.error('❌ Proxy error (non-JSON):', text);
        }
        
        // Check if server is reachable
        if (proxyResponse.status === 500 && errorMessage.includes('Unknown error')) {
          errorMessage = 'Server error: The backend server may not be running. Please ensure the Node.js server is running on port 3000.';
        }
        
        throw new Error(errorMessage);
      }

      const proxyData = await proxyResponse.json();
      if (!proxyData.success || !proxyData.dataUrl) {
        throw new Error('Invalid response from proxy endpoint');
      }

      // Convert data URL to blob
      const response = await fetch(proxyData.dataUrl);
      blob = await response.blob();
    }
    
    // Determine file extension from URL or blob type
    let extension = 'mp3';
    const urlLower = audioUrl.toLowerCase();
    if (urlLower.includes('.wav') || urlLower.includes('audio/wav')) extension = 'wav';
    else if (urlLower.includes('.ogg') || urlLower.includes('audio/ogg')) extension = 'ogg';
    else if (blob.type === 'audio/wav' || blob.type === 'audio/wave') extension = 'wav';
    else if (blob.type === 'audio/ogg') extension = 'ogg';
    else if (blob.type === 'audio/mpeg' || blob.type === 'audio/mp3') extension = 'mp3';

    // Create a unique filename with timestamp
    const timestamp = Date.now();
    const filename = `audio/${userId}/${projectId}/${sheetId}/${cellId}/${timestamp}.${extension}`;
    
    // Create a reference to the file location in Storage
    const storageRef = ref(storage, filename);

    // Upload the blob to Firebase Storage with metadata
    const metadata = {
      contentType: blob.type || 'audio/mpeg',
      cacheControl: 'public, max-age=31536000', // Cache for 1 year
    };
    await uploadBytes(storageRef, blob, metadata);

    // Get the download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log(`🎵 Audio uploaded, download URL: ${downloadURL.substring(0, 100)}...`);

    return { success: true, url: downloadURL };
  } catch (error) {
    console.error('Error uploading audio to Firebase Storage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a file from Firebase Storage
 * @param {string} fileUrl - The download URL of the file to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteFileFromStorage(fileUrl) {
  try {
    // Extract the file path from the URL
    // Firebase Storage URLs are in format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
    const url = new URL(fileUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+)\?/);
    
    if (!pathMatch) {
      throw new Error('Invalid Firebase Storage URL');
    }

    // Decode the path (it's URL encoded)
    const filePath = decodeURIComponent(pathMatch[1]);
    const storageRef = ref(storage, filePath);

    await deleteObject(storageRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting file from Firebase Storage:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all assets (images, videos, audio) for a cell from Firebase Storage
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} sheetId - Sheet ID
 * @param {string} cellId - Cell ID
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
 */
export async function deleteCellAssets(userId, projectId, sheetId, cellId) {
  try {
    console.log(`🗑️ Deleting all assets for cell: ${cellId}`);
    let deletedCount = 0;
    const errors = [];

    // Asset types to delete
    const assetTypes = ['images', 'videos', 'audio'];

    for (const assetType of assetTypes) {
      try {
        const assetPath = `${assetType}/${userId}/${projectId}/${sheetId}/${cellId}`;
        const assetRef = ref(storage, assetPath);
        
        // List all files in the directory
        const listResult = await listAll(assetRef);
        
        // Delete all files
        const deletePromises = listResult.items.map(async (itemRef) => {
          try {
            await deleteObject(itemRef);
            deletedCount++;
            console.log(`✅ Deleted ${assetType}: ${itemRef.fullPath}`);
          } catch (error) {
            console.error(`❌ Error deleting ${itemRef.fullPath}:`, error);
            errors.push(`${itemRef.fullPath}: ${error.message}`);
          }
        });

        await Promise.all(deletePromises);
      } catch (error) {
        // If directory doesn't exist, that's okay - just log and continue
        if (error.code === 'storage/object-not-found' || error.code === 'storage/not-found') {
          console.log(`ℹ️ No ${assetType} directory found for cell ${cellId}`);
        } else {
          console.error(`❌ Error deleting ${assetType} for cell ${cellId}:`, error);
          errors.push(`${assetType}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ Some errors occurred while deleting assets:`, errors);
      return { 
        success: true, 
        deletedCount, 
        warnings: errors,
        error: `Some files could not be deleted: ${errors.join('; ')}` 
      };
    }

    console.log(`✅ Deleted ${deletedCount} assets for cell ${cellId}`);
    return { success: true, deletedCount };
  } catch (error) {
    console.error('Error deleting cell assets:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete all assets for all cells in a sheet from Firebase Storage
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {string} sheetId - Sheet ID
 * @param {string[]} cellIds - Array of cell IDs in the sheet
 * @returns {Promise<{success: boolean, deletedCount?: number, error?: string}>}
 */
export async function deleteSheetAssets(userId, projectId, sheetId, cellIds = []) {
  try {
    console.log(`🗑️ Deleting all assets for sheet: ${sheetId} (${cellIds.length} cells)`);
    let totalDeletedCount = 0;
    const errors = [];

    // If cellIds are provided, delete assets for each cell
    if (cellIds.length > 0) {
      for (const cellId of cellIds) {
        const result = await deleteCellAssets(userId, projectId, sheetId, cellId);
        if (result.success) {
          totalDeletedCount += result.deletedCount || 0;
        } else {
          errors.push(`Cell ${cellId}: ${result.error}`);
        }
      }
    } else {
      // If no cellIds provided, try to delete all assets under the sheet path
      // This is a fallback in case we need to clean up orphaned files
      const assetTypes = ['images', 'videos', 'audio'];
      
      for (const assetType of assetTypes) {
        try {
          const sheetPath = `${assetType}/${userId}/${projectId}/${sheetId}`;
          const sheetRef = ref(storage, sheetPath);
          
          // List all items (cells) in the sheet directory
          const listResult = await listAll(sheetRef);
          
          // For each cell directory, list and delete all files
          for (const cellRef of listResult.prefixes) {
            const cellListResult = await listAll(cellRef);
            const deletePromises = cellListResult.items.map(async (itemRef) => {
              try {
                await deleteObject(itemRef);
                totalDeletedCount++;
                console.log(`✅ Deleted ${assetType}: ${itemRef.fullPath}`);
              } catch (error) {
                console.error(`❌ Error deleting ${itemRef.fullPath}:`, error);
                errors.push(`${itemRef.fullPath}: ${error.message}`);
              }
            });
            await Promise.all(deletePromises);
          }
        } catch (error) {
          if (error.code === 'storage/object-not-found' || error.code === 'storage/not-found') {
            console.log(`ℹ️ No ${assetType} directory found for sheet ${sheetId}`);
          } else {
            console.error(`❌ Error deleting ${assetType} for sheet ${sheetId}:`, error);
            errors.push(`${assetType}: ${error.message}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      console.warn(`⚠️ Some errors occurred while deleting sheet assets:`, errors);
      return { 
        success: true, 
        deletedCount: totalDeletedCount, 
        warnings: errors,
        error: `Some files could not be deleted: ${errors.join('; ')}` 
      };
    }

    console.log(`✅ Deleted ${totalDeletedCount} assets for sheet ${sheetId}`);
    return { success: true, deletedCount: totalDeletedCount };
  } catch (error) {
    console.error('Error deleting sheet assets:', error);
    return { success: false, error: error.message };
  }
}


