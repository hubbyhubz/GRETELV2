import React from 'react';
import AppIcon from './AppIcon';

const AnalyticsDashboardPage: React.FC = () => {
  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#DC143C]">Analytics Dashboard</h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Charts and graphs will be displayed here in a future update.</p>
        <div className="mt-6 sm:mt-8 bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow p-4 sm:p-6 border border-gray-200 dark:border-gray-700 h-96 flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-16 w-16 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-[#DC143C] animate-spin" />
            <AppIcon name="bulldozer" className="h-8 w-8 text-[#DC143C]" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-gray-800 dark:text-gray-200">Under Construction</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Analytics animations and insights are on the way.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboardPage;