/**
 * Storage Permissions and Limits
 * Handles subscription-based storage restrictions
 */

import { getUserSubscription } from '../firebase/firestore';

// Storage limits in bytes
const STORAGE_LIMITS = {
  free: 0, // No storage allowed
  starter: 0, // No storage allowed (same as free)
  pro: 5 * 1024 * 1024 * 1024, // 5GB for Pro
  enterprise: -1 // Unlimited (-1 means unlimited)
};

/**
 * Check if user can upload to storage
 * @param {string} userId - User ID
 * @param {number} fileSize - File size in bytes (optional, for checking limits)
 * @returns {Promise<{allowed: boolean, reason?: string, limit?: number, used?: number}>}
 */
export async function checkStoragePermission(userId, fileSize = 0) {
  try {
    const subscriptionResult = await getUserSubscription(userId);
    if (!subscriptionResult.success) {
      return {
        allowed: false,
        reason: 'Unable to verify subscription status'
      };
    }

    const subscription = subscriptionResult.data.subscription || 'free';
    const limit = STORAGE_LIMITS[subscription] || 0;

    // Free and Starter users cannot save
    if (subscription === 'free' || subscription === 'starter') {
      return {
        allowed: false,
        reason: 'Storage not available on Free/Starter plan',
        subscription,
        limit: 0
      };
    }

    // Enterprise has unlimited storage
    if (subscription === 'enterprise') {
      return {
        allowed: true,
        subscription,
        limit: -1, // Unlimited
        used: 0 // Not tracking for enterprise
      };
    }

    // Pro users have limits - check if they're within limit
    if (subscription === 'pro') {
      // TODO: Get actual storage usage from Firestore
      // For now, we'll allow uploads but should track usage
      const used = 0; // Placeholder - should get from user's storageUsage field
      
      if (limit > 0 && used + fileSize > limit) {
        const usedGB = (used / (1024 * 1024 * 1024)).toFixed(2);
        const limitGB = (limit / (1024 * 1024 * 1024)).toFixed(0);
        return {
          allowed: false,
          reason: `Storage limit exceeded. You've used ${usedGB}GB of ${limitGB}GB. Please delete some files or upgrade to Enterprise for unlimited storage.`,
          subscription,
          limit,
          used
        };
      }

      return {
        allowed: true,
        subscription,
        limit,
        used
      };
    }

    // Default: not allowed
    return {
      allowed: false,
      reason: 'Storage not available for your subscription plan',
      subscription
    };
  } catch (error) {
    console.error('Error checking storage permission:', error);
    return {
      allowed: false,
      reason: 'Error checking storage permissions'
    };
  }
}

/**
 * Get storage limit message for user
 * @param {string} subscription - Subscription tier
 * @returns {string} Message about storage limits
 */
export function getStorageLimitMessage(subscription) {
  const limit = STORAGE_LIMITS[subscription] || 0;
  
  if (subscription === 'free' || subscription === 'starter') {
    return 'Free/Starter users cannot save media to Firebase Storage. Please download copies of your images and videos.';
  }
  
  if (subscription === 'pro') {
    const limitGB = (limit / (1024 * 1024 * 1024)).toFixed(0);
    return `Pro users have ${limitGB}GB storage limit. Upgrade to Enterprise for unlimited storage.`;
  }
  
  if (subscription === 'enterprise') {
    return 'Enterprise users have unlimited storage.';
  }
  
  return 'Storage limits vary by subscription plan.';
}

