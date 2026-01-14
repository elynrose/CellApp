// Credit Reset Utility
// Handles monthly credit resets for all users

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { resetMonthlyCredits } from '../firebase/firestore';
import { getPlanById } from '../services/subscriptions';

/**
 * Check and reset credits for a single user if needed
 */
export async function checkAndResetUserCredits(userId, userData) {
  try {
    const credits = userData.credits;
    if (!credits || !credits.nextReset) {
      return { success: false, error: 'No credit reset date found' };
    }

    let nextResetDate;
    if (credits.nextReset.toDate) {
      nextResetDate = credits.nextReset.toDate();
    } else if (credits.nextReset.seconds) {
      nextResetDate = new Date(credits.nextReset.seconds * 1000);
    } else if (credits.nextReset instanceof Date) {
      nextResetDate = credits.nextReset;
    } else {
      nextResetDate = new Date(credits.nextReset);
    }

    const now = new Date();
    
    if (now >= nextResetDate) {
      const planId = userData.subscription || 'free';
      const plan = await getPlanById(planId);
      
      const result = await resetMonthlyCredits(userId, planId, plan.monthlyCredits);
      return result;
    }

    return { success: false, error: 'Not time to reset yet' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check and reset credits for all users (admin function)
 * This should be run periodically (e.g., daily via cron job or scheduled function)
 */
export async function checkAndResetAllUserCredits() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let resetCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const result = await checkAndResetUserCredits(userDoc.id, userData);
        
        if (result.success) {
          resetCount++;
        }
      } catch (error) {
        errorCount++;
      }
    }

    return {
      success: true,
      resetCount,
      errorCount,
      totalUsers: usersSnapshot.size
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


