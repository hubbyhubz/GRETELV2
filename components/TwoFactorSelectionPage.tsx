import React from 'react';
import AppIcon from './AppIcon';

interface TwoFactorSelectionPageProps {
  onSelection: (method: 'totp') => void;
  onBack: () => void;
}

const TwoFactorSelectionPage: React.FC<TwoFactorSelectionPageProps> = ({ onSelection, onBack }) => {
  return (
    <div className="space-y-8 animate-fade-in">
        <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">Set Up Two-Factor Authentication</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Choose your preferred method for an extra layer of security on your account.</p>
        </div>

        <div className="space-y-4">
            <button
                onClick={() => onSelection('totp')}
                className="w-full text-left p-4 sm:p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-600"
            >
                <div className="flex items-center">
                    <AppIcon name="authenticator" className="h-8 w-8 sm:h-10 sm:w-10 mb-4 text-primary-600" />
                    <div className="ml-3 sm:ml-4">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200">Authenticator App</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Use an app like Google Authenticator or Authy. (Recommended)</p>
                    </div>
                    <AppIcon name="play" className="h-6 w-6 ml-auto text-gray-400" />
                </div>
            </button>
            <div
                className="w-full text-left p-4 sm:p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-not-allowed opacity-60"
            >
                 <div className="flex items-center">
                    <AppIcon name="phone" className="h-8 w-8 sm:h-10 sm:w-10 mb-4 text-gray-400" />
                    <div className="ml-3 sm:ml-4">
                        <h4 className="font-bold text-gray-800 dark:text-gray-200">SMS Verification</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Receive codes via text message. (Coming Soon)</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="pt-4 text-right">
             <button onClick={onBack} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-300 ease-in-out">
                Back
            </button>
        </div>
    </div>
  );
};

export default TwoFactorSelectionPage;
