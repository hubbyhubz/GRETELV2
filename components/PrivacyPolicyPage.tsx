import React from 'react';

interface PrivacyPolicyPageProps {
  onBack: () => void;
  source: 'login' | 'dashboard' | 'createAccount';
}

const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onBack, source }) => {
  const getButtonText = (source: 'login' | 'dashboard' | 'createAccount') => {
    switch (source) {
      case 'dashboard':
        return 'Back to Dashboard';
      case 'createAccount':
        return 'Back to Account Creation';
      case 'login':
      default:
        return 'Back to Login';
    }
  };

  return (
    <div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate-fade-in">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">
            G.R.E.T.E.L
          </h1>
          <h2 className="mt-4 text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-200">Privacy Policy</h2>
          <p className="mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">Last Updated: October 26, 2025</p>
        </div>
        
        <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 space-y-4">
          <p>Welcome to G.R.E.T.E.L (General Response Engine & Task Execution Logic). This Privacy Policy explains how we collect, use, and protect your information when you use our application. Your privacy is a top priority in how we build and operate our service.</p>
          
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">1. Information We Collect</h3>
          <p>We collect the following types of information to provide and personalize our service:</p>
          <ul>
            <li><strong>Account Information:</strong> When you create an account, we collect your name, username, email, and company ID.</li>
            <li><strong>Setup Wizard Data:</strong> The answers you provide during the setup wizard are collected to personalize your AI assistant. This includes your role, responsibilities, challenges, and preferences.</li>
            <li><strong>Chat History:</strong> Your conversations with the AI assistant are stored to maintain context for ongoing interactions.</li>
          </ul>

          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">2. How We Use Your Information</h3>
          <p>Your information is used for the following purposes:</p>
          <ul>
            <li>To create and manage your account.</li>
            <li>To personalize the AI assistant's behavior, responses, and suggestions based on your unique professional context.</li>
            <li>To provide a continuous and context-aware chat experience.</li>
          </ul>

          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">3. Data Storage and Security</h3>
          <p>G.R.E.T.E.L is designed with a "local-first" approach to privacy. Your profile information, setup answers, and chat history are stored securely in your web browser's local storage. This means your data remains on your device. Future features may offer optional, secure cloud synchronization to provide a seamless experience across multiple devices.</p>
          <p>We implement industry-standard security measures to protect your information. However, please be aware that no method of transmission over the Internet or method of electronic storage is 100% secure.</p>
          
          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">4. Third-Party Services</h3>
          <p>To provide its conversational AI capabilities, G.R.E.T.E.L uses the OpenAI API. Your prompts and conversation history are sent to OpenAI to generate responses. Your use of this application is also subject to OpenAI's Privacy Policy, which you can review <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#DC143C] hover:underline">here</a>. We do not send any personally identifiable information (like your name or email) to the OpenAI API beyond the content of your chat messages.</p>

          <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">5. Changes to This Policy</h3>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
          
        </div>

        <div className="text-center pt-6">
          <button
            onClick={onBack}
            className="w-full sm:w-auto bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105"
          >
            {getButtonText(source)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;