
import React, { useState } from 'react';
import LoginPage from './LoginPage';
import SetupWizardPage from './SetupWizardPage';
import { MainDashboardPage } from './MainDashboardPage';
import ThemeToggleButton from './ThemeToggleButton';
import type { UserProfile, WizardData } from './types';
import type { Session } from '@supabase/supabase-js';

interface TestPageProps {
  onExit: () => void;
}

const mockSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'test-user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { full_name: 'Test User' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
};

const initialMockProfile: UserProfile = {
  id: 'test-user-id',
  name: 'Alex Sterling',
  nickname: 'Alex',
  email: 'alex@example.com',
  companyId: 'CRM0099',
  mobileNumber: '555-0199',
  avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=2070&auto=format&fit=crop',
  assistantAvatar: 'https://static.thenounproject.com/png/1132733-200.png',
  assistantName: 'G.R.E.T.E.L',
  role: 'Regional Director',
  responsibilities: 'Strategic Planning, Team Leadership, Revenue Growth',
  dailyTasks: 'Review KPIs, Team Sync, Client Calls',
  deepFocusProjects: 'Q4 Expansion Strategy',
  metrics: 'Revenue, Churn Rate, NPS',
  meetings: 'Monday Sync, Friday Review',
  timeChallenge: 'Context Switching',
  commStyle: 'Direct and Data-Driven',
  successDefinition: 'Exceeding Quarterly Targets',
  setup_complete: true,
  assistantMemory: '- Prefers morning briefings at 8 AM\n- Allergies: Peanuts',
  team: [
    { id: 't1', name: 'Sarah Connor', role: 'Ops Manager', email: 'sarah@example.com' },
    { id: 't2', name: 'John Doe', role: 'Sales Lead', email: 'john@example.com' }
  ]
};

// Wrapper to inject a "Back to Preview" button on top of the components
const PreviewWrapper: React.FC<{ children: React.ReactNode; onBack: () => void }> = ({ children, onBack }) => (
    <div className="relative w-full h-full min-h-screen">
      <div className="fixed top-4 left-4 z-[100]">
        <button 
          onClick={onBack}
          className="bg-gray-900 text-white px-4 py-2 rounded-full shadow-lg text-xs font-bold uppercase tracking-wider hover:bg-gray-700 transition-colors border border-gray-700"
        >
          ← Exit Preview
        </button>
      </div>
      {children}
    </div>
);

const TestPage: React.FC<TestPageProps> = ({ onExit }) => {
  const [currentView, setCurrentView] = useState<'menu' | 'login' | 'setup' | 'dashboard'>('menu');
  const [mockProfile, setMockProfile] = useState<UserProfile>(initialMockProfile);

  const handleBackToMenu = () => setCurrentView('menu');

  if (currentView === 'menu') {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-300">
        <ThemeToggleButton />
        <div className="w-full max-w-4xl">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-black text-[#DC143C] tracking-wider uppercase mb-2">Developer Preview</h1>
                <p className="text-gray-600 dark:text-gray-400">Select a component to test in isolation with mock data.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Login Preview Card */}
                <button 
                    onClick={() => setCurrentView('login')}
                    className="group relative bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 hover:border-[#DC143C] dark:hover:border-[#DC143C] transition-all duration-300 text-left"
                >
                    <div className="absolute top-4 right-4 text-gray-300 dark:text-gray-600 group-hover:text-[#DC143C] transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Login Page</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Test the authentication UI, form states, and animations.</p>
                </button>

                {/* Setup Preview Card */}
                <button 
                    onClick={() => setCurrentView('setup')}
                    className="group relative bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 hover:border-[#DC143C] dark:hover:border-[#DC143C] transition-all duration-300 text-left"
                >
                    <div className="absolute top-4 right-4 text-gray-300 dark:text-gray-600 group-hover:text-[#DC143C] transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Setup Wizard</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Walk through the 10-step onboarding process with mock submissions.</p>
                </button>

                {/* Dashboard Preview Card */}
                <button 
                    onClick={() => setCurrentView('dashboard')}
                    className="group relative bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 hover:border-[#DC143C] dark:hover:border-[#DC143C] transition-all duration-300 text-left"
                >
                    <div className="absolute top-4 right-4 text-gray-300 dark:text-gray-600 group-hover:text-[#DC143C] transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Main Dashboard</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Interact with the full dashboard using a pre-configured mock user.</p>
                </button>
            </div>

            <div className="mt-12 text-center">
                <button onClick={onExit} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors underline">
                    Return to Real App
                </button>
            </div>
        </div>
      </div>
    );
  }

  if (currentView === 'login') {
    return (
        <PreviewWrapper onBack={handleBackToMenu}>
            <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
                <ThemeToggleButton />
                <LoginPage 
                    onCreateAccountClick={() => alert('Mock: Navigate to Create Account')}
                    onForgotPasswordClick={() => alert('Mock: Navigate to Forgot Password')}
                    onLoginSuccess={() => alert('Mock: Login Success! (In real app, this redirects to dashboard)')}
                    onNavigateToPrivacy={() => {}}
                    onNavigateToTerms={() => {}}
                />
            </div>
        </PreviewWrapper>
    );
  }

  if (currentView === 'setup') {
    return (
        <PreviewWrapper onBack={handleBackToMenu}>
             <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
                <ThemeToggleButton />
                <SetupWizardPage 
                    onSetupComplete={(data: WizardData) => {
                        console.log('Mock Setup Data:', data);
                        alert(`Setup Complete for ${data.assistantName}! Check console for data.`);
                        handleBackToMenu();
                    }} 
                />
             </div>
        </PreviewWrapper>
    );
  }

  if (currentView === 'dashboard') {
    return (
        <PreviewWrapper onBack={handleBackToMenu}>
            <MainDashboardPage
                onLogout={() => { alert('Mock: Logged Out'); handleBackToMenu(); }}
                userProfile={mockProfile}
                onProfileUpdate={async (updated) => { setMockProfile(updated); alert('Mock: Profile Updated locally.'); }}
                onNavigateToPrivacy={() => {}}
                onNavigateToTerms={() => {}}
                activeDashboard='main'
                setActiveDashboard={() => {}}
                appVersion="1.4.7-TEST"
                onGoogleAuthError={() => alert('Mock: Google Auth Error Triggered')}
                shouldShowPatchNotes={false}
                onPatchNotesViewed={() => {}}
                session={mockSession}
            />
        </PreviewWrapper>
    );
  }

  return null;
};

export default TestPage;
