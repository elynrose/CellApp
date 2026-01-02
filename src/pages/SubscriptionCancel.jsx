import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft } from 'lucide-react';

const SubscriptionCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4">
      <div className="glass-panel p-8 rounded-2xl max-w-md w-full">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-yellow-500 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription Cancelled</h1>
          <p className="text-gray-400 mb-6">
            Your subscription was not completed. No charges were made. You can try again anytime.
          </p>

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

export default SubscriptionCancel;


