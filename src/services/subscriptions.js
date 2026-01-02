// Subscription Service
// Credit costs based on OpenAI and Gemini API pricing

import { getAllPackages } from '../firebase/firestore';

// Default/fallback plans (used if Firestore is unavailable)
const DEFAULT_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceId: null, // No Stripe price ID for free
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
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 9.99,
    priceId: null, // Will be set from Stripe dashboard
    monthlyCredits: 500,
    features: [
      '500 credits per month',
      'All AI models',
      'Priority support',
      'Unlimited projects',
      'Unlimited sheets'
    ],
    limits: {
      maxProjects: -1, // Unlimited
      maxSheets: -1,
      maxCells: -1
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    priceId: null, // Will be set from Stripe dashboard
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
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99.99,
    priceId: null, // Will be set from Stripe dashboard
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
};

/**
 * Get subscription plans from Firestore or return defaults
 */
export async function getSubscriptionPlans() {
  try {
    const result = await getAllPackages();
    if (result.success && result.data && result.data.length > 0) {
      // Convert array to object keyed by id
      const plansObj = {};
      result.data.forEach(plan => {
        plansObj[plan.id] = plan;
      });
      return plansObj;
    }
  } catch (error) {
  }
  // Fallback to default plans
  return DEFAULT_PLANS;
}

/**
 * Get subscription plan by ID (async, fetches from Firestore)
 */
export async function getPlanById(planId) {
  const plans = await getSubscriptionPlans();
  return plans[planId] || plans.free || DEFAULT_PLANS.free;
}

// Legacy export for backward compatibility (will be populated from Firestore)
export let SUBSCRIPTION_PLANS = DEFAULT_PLANS;

// Initialize plans from Firestore on module load
getSubscriptionPlans().then(plans => {
  SUBSCRIPTION_PLANS = plans;
});

/**
 * Get API base URL
 */
function getApiBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  return 'https://gpt-cells-app-production.up.railway.app';
}

/**
 * Create Stripe checkout session
 */
export async function createCheckoutSession(priceId, userId) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/stripe/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        userId
      })
    });

    const data = await response.json();
    if (data.success) {
      return { success: true, sessionId: data.sessionId, url: data.url };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Create Stripe customer portal session
 */
export async function createPortalSession(customerId) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/stripe/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId
      })
    });

    const data = await response.json();
    if (data.success) {
      return { success: true, url: data.url };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}


/**
 * Calculate credit cost for different model types
 * Based on OpenAI and Gemini API pricing
 */
export function getCreditCost(modelType, modelId = '') {
  // Text generation - cheaper
  if (modelType === 'text') {
    // GPT-4o and Gemini Pro cost more
    if (modelId.includes('gpt-4o') || modelId.includes('gemini-1.5-pro')) {
      return 2; // 2 credits for advanced models
    }
    return 1; // 1 credit per text generation
  }
  
  // Image generation - moderate
  if (modelType === 'image') {
    // DALL-E 3 costs more than DALL-E 2
    if (modelId.includes('dall-e-3') || modelId.includes('imagen-3')) {
      return 5; // 5 credits for high-quality images
    }
    return 3; // 3 credits for standard images
  }
  
  // Video generation - expensive (Sora 2)
  if (modelType === 'video') {
    return 20; // 20 credits for video generation
  }
  
  // Audio generation (TTS)
  if (modelType === 'audio') {
    // HD TTS costs more
    if (modelId.includes('hd')) {
      return 3; // 3 credits for HD audio
    }
    return 2; // 2 credits for standard audio
  }
  
  // Default
  return 1;
}

/**
 * Check if user has enough credits
 */
export function hasEnoughCredits(userCredits, creditCost) {
  return userCredits >= creditCost;
}


