import React from 'react';

interface SimulationIntroPageProps {
  onStartSimulation: () => void;
}

const SimulationIntroPage: React.FC<SimulationIntroPageProps> = ({ onStartSimulation }) => {
  return (
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 text-center animate-fade-in">
      <div className="space-y-4 sm:space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">
            G.R.E.T.E.L
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Executive Assistant AI</p>
        </div>
        
        <div className="pt-4 pb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-200">Welcome to the Live Preview</h2>
            <p className="mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                Click the button below to watch an automated simulation of the entire user onboarding process, from account creation to the main dashboard.
            </p>
        </div>
        
        <div>
          <button
            onClick={onStartSimulation}
            className="w-full bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC143C]"
          >
            Start Live Preview
          </button>
        </div>
      </div>
      <div className="pt-6 mt-6 sm:pt-8 sm:mt-8 border-t border-gray-200 dark:border-gray-700 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Copyright © 2025 | G.R.E.T.E.L by Hanzel
        </p>
      </div>
    </div>
  );
};

export default SimulationIntroPage;
