import React, { useState, useEffect } from 'react';
import { X, Check, Crown, Zap, Rocket, Sparkles } from 'lucide-react';
import { getSubscriptionPlans, createCheckoutSession, createPortalSession } from '../services/subscriptions';
import { getUserSubscription } from '../firebase/firestore';
import { getCurrentUser } from '../firebase/auth';

const SubscriptionModal = ({ isOpen, onClose, user }) => {
  const [loading, setLoading] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [plans, setPlans] = useState({});

  useEffect(() => {
    if (isOpen && user) {
      loadPlans();
      loadSubscriptionInfo();
    }
  }, [isOpen, user]);

  const loadPlans = async () => {
    try {
      const plansData = await getSubscriptionPlans();
      setPlans(plansData);
    } catch (error) {
    }
  };

  const loadSubscriptionInfo = async () => {
    try {
      const result = await getUserSubscription(user.uid);
      if (result.success) {
        setSubscriptionInfo(result.data);
      }
    } catch (error) {
    }
  };

  const handleSubscribe = async (planId) => {
    if (!user) return;

    const plan = plans[planId];
    if (!plan) {
      alert('Invalid plan selected.');
      return;
    }
    
    if (plan.price === 0) {
      alert('You are already on the free plan.');
      return;
    }
    
    if (!plan.priceId) {
      alert('This plan is not configured yet. Please contact support or set up Stripe price IDs in the admin panel.');
      return;
    }

    setLoading(true);
    try {
      const result = await createCheckoutSession(plan.priceId, user.uid);
      if (result.success) {
        // Redirect to Stripe checkout
        window.location.href = result.url;
      } else {
        alert(`Error: ${result.error}`);
        setLoading(false);
      }
    } catch (error) {
      alert('Failed to start checkout. Please try again.');
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!subscriptionInfo?.stripeCustomerId) {
      alert('No active subscription found.');
      return;
    }

    setLoading(true);
    try {
      const result = await createPortalSession(subscriptionInfo.stripeCustomerId);
      if (result.success) {
        window.location.href = result.url;
      } else {
        alert(`Error: ${result.error}`);
        setLoading(false);
      }
    } catch (error) {
      alert('Failed to open customer portal. Please try again.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentPlan = subscriptionInfo?.subscription || 'free';
  const currentCredits = subscriptionInfo?.credits?.current || 0;
  const totalCredits = subscriptionInfo?.credits?.total || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Subscription Plans</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Choose a plan that fits your needs
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Current Subscription Info */}
        {subscriptionInfo && (
          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Current Plan</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                  {plans[currentPlan]?.name || currentPlan}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 dark:text-gray-400">Credits</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {currentCredits} / {totalCredits}
                </p>
              </div>
              {currentPlan !== 'free' && (
                <button
                  onClick={handleManageSubscription}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Manage Subscription'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Plans Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.values(plans).length > 0 ? Object.values(plans).map(plan => {
              const isCurrentPlan = currentPlan === plan.id;
              const isPopular = plan.id === 'pro';
              
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-lg border-2 p-6 transition-all ${
                    isCurrentPlan
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : isPopular
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-4">
                    {plan.id === 'free' && <Sparkles className="h-8 w-8 text-gray-400 mx-auto mb-2" />}
                    {plan.id === 'starter' && <Zap className="h-8 w-8 text-yellow-500 mx-auto mb-2" />}
                    {plan.id === 'pro' && <Rocket className="h-8 w-8 text-purple-500 mx-auto mb-2" />}
                    {plan.id === 'enterprise' && <Crown className="h-8 w-8 text-yellow-500 mx-auto mb-2" />}
                    
                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                    <div className="mt-2">
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                      {plan.price > 0 && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm">/month</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {plan.monthlyCredits.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Credits/month</p>
                    </div>

                    <ul className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => {
                      if (isCurrentPlan) {
                        alert('This is your current plan');
                      } else if (plan.price === 0) {
                        alert('You are already on the free plan');
                      } else {
                        handleSubscribe(plan.id);
                      }
                    }}
                    disabled={loading || isCurrentPlan || plan.price === 0}
                    className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
                      isCurrentPlan
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : isPopular
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isCurrentPlan ? 'Current Plan' : plan.price === 0 ? 'Free Forever' : 'Subscribe'}
                  </button>
                </div>
              );
            }) : (
              <div className="col-span-4 text-center py-8 text-gray-500 dark:text-gray-400">
                Loading plans...
              </div>
            )}
          </div>
        </div>

        {/* Credit Cost Info */}
        <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Credit Costs</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600 dark:text-gray-400">Text Generation</p>
              <p className="font-semibold text-gray-900 dark:text-white">1 credit</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Image Generation</p>
              <p className="font-semibold text-gray-900 dark:text-white">3-5 credits</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Video Generation</p>
              <p className="font-semibold text-gray-900 dark:text-white">15-20 credits</p>
            </div>
            <div>
              <p className="text-gray-600 dark:text-gray-400">Audio Generation</p>
              <p className="font-semibold text-gray-900 dark:text-white">2 credits</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionModal;

