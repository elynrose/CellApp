import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '../firebase/auth';
import { getUserSubscription } from '../firebase/firestore';

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const user = getCurrentUser();
        if (user) {
          const result = await getUserSubscription(user.uid);
          if (result.success) {
            setSubscriptionInfo(result.data);
          }
        }
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    loadSubscription();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="glass-panel p-8 rounded-2xl max-w-md w-full">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription Successful!</h1>
          <p className="text-gray-400 mb-6">
            Your subscription has been activated. You can now enjoy all the features of your plan.
          </p>
          
          {!loading && subscriptionInfo && (
            <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Current Plan:</span>
                <span className="text-white font-semibold capitalize">
                  {subscriptionInfo.subscription || 'free'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Credits:</span>
                <span className="text-white font-semibold">
                  {subscriptionInfo.credits?.current || 0} / {subscriptionInfo.credits?.total || 0}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-5 w-5" />
            Return to App
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;


