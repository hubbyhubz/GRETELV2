

import React, { useState, useEffect } from 'react';
import type { WizardData } from './types';

interface SetupWizardPageProps {
  onSetupComplete: (wizardData: WizardData) => void;
}

interface WizardState extends WizardData {
  currentStep: number;
}

// Simulated database of taken names (case-insensitive)
const takenNames = ['jarvis', 'friday', 'cortana', 'gretel'];

// Simulated async check
const checkNameAvailability = (name: string): Promise<boolean> => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(!takenNames.includes(name.toLowerCase()));
    }, 700); // Simulate network delay
  });
};


const SetupWizardPage: React.FC<SetupWizardPageProps> = ({ onSetupComplete }) => {
  const [wizardState, setWizardState] = useState<WizardState>(() => {
    const savedState = sessionStorage.getItem('gretelWizardState');
    if (savedState) {
      return JSON.parse(savedState);
    }
    return {
      currentStep: 0,
      role: '',
      responsibilities: '',
      dailyTasks: '',
      deepFocusProjects: '',
      metrics: '',
      meetings: '',
      timeChallenge: '',
      commStyle: '',
      successDefinition: '',
      assistantName: 'G.R.E.T.E.L',
    };
  });

  const {
    currentStep,
    role,
    responsibilities,
    dailyTasks,
    deepFocusProjects,
    metrics,
    meetings,
    timeChallenge,
    commStyle,
    successDefinition,
    assistantName,
  } = wizardState;

  // State for name validation
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  // Effect to save state to sessionStorage on any change
  useEffect(() => {
    sessionStorage.setItem('gretelWizardState', JSON.stringify(wizardState));
  }, [wizardState]);


  // Effect for debounced name checking
  useEffect(() => {
    if (currentStep !== 10 || !assistantName) {
      setNameStatus('idle');
      return;
    }

    setIsCheckingName(true);
    setNameStatus('idle');

    const handler = setTimeout(async () => {
      const isAvailable = await checkNameAvailability(assistantName);
      setNameStatus(isAvailable ? 'valid' : 'invalid');
      setIsCheckingName(false);
    }, 500); // 500ms debounce

    // Cleanup function to cancel the timeout if the user keeps typing
    return () => {
      clearTimeout(handler);
    };
  }, [assistantName, currentStep]);

  const updateState = (field: keyof WizardState, value: string | number) => {
    setWizardState(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 11) {
      updateState('currentStep', currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      updateState('currentStep', currentStep - 1);
    }
  };
  
  const handleFinish = () => {
      const dataToSubmit: WizardData = {
          role,
          responsibilities,
          dailyTasks,
          deepFocusProjects,
          metrics,
          meetings,
          timeChallenge,
          commStyle,
          successDefinition,
          assistantName
      };
      sessionStorage.removeItem('gretelWizardState'); // Clean up
      onSetupComplete(dataToSubmit);
  }

  const isNextDisabled = () => {
    switch(currentStep) {
        case 1: return !role;
        case 2: return !responsibilities;
        case 3: return !dailyTasks;
        case 4: return !deepFocusProjects;
        case 5: return !metrics;
        case 6: return !meetings;
        case 7: return !timeChallenge;
        case 8: return !commStyle;
        case 9: return !successDefinition;
        case 10: return !assistantName || nameStatus !== 'valid' || isCheckingName;
        default: return false;
    }
  }

  const renderNameValidationFeedback = () => {
    if (isCheckingName) {
        return <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Checking...</p>;
    }
    if (nameStatus === 'invalid') {
        return <p className="mt-2 text-sm text-red-600 dark:text-red-400">This name is already in use. Please choose another.</p>;
    }
    if (nameStatus === 'valid') {
        return <p className="mt-2 text-sm text-green-600 dark:text-green-400">That name is available!</p>;
    }
    return null;
  }

  const renderContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6 text-center animate-fade-in">
            <div className="mt-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-200">Welcome!</h2>
              <p className="mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                Let's set up your personalized AI assistant. The next few questions will help me understand your role and priorities to serve you better.
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={handleNext}
                className="w-full max-w-xs mx-auto text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--primary-600)',
                  '--tw-ring-color': 'var(--primary-600)'
                } as React.CSSProperties}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-700)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-600)')}
              >
                Get Started
              </button>
            </div>
          </div>
        );
      case 11:
        return (
            <div className="space-y-6 text-center animate-fade-in">
                 <div className="mt-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-200">Setup Complete!</h2>
                    <p className="mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                        Your assistant, {assistantName || 'G.R.E.T.E.L'}, is now personalized and ready!
                    </p>
                </div>
                <div className="pt-4">
                    <button
                        onClick={handleFinish}
                        className="w-full max-w-xs mx-auto text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: 'var(--primary-600)',
                          '--tw-ring-color': 'var(--primary-600)'
                        } as React.CSSProperties}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-700)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-600)')}
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
      default:
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center">
              <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400 tracking-wider">STEP {currentStep} OF 10</p>
            </div>
            <div className="space-y-6">
              {currentStep === 1 && (
                  <div>
                      <label htmlFor="role" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                          What is your position or role in the company?
                      </label>
                      <textarea 
                        id="role" 
                        value={role} 
                        onChange={(e) => updateState('role', e.target.value)} 
                        rows={6} 
                        className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                        style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                        placeholder="e.g., Regional Manager, Lead Developer, Head of Sales..." 
                        required 
                      />
                  </div>
              )}
              {currentStep === 2 && (
                  <div>
                      <label htmlFor="responsibilities" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                          What are the 5-7 main pillars or core responsibilities of your job?
                      </label>
                      <textarea 
                        id="responsibilities" 
                        value={responsibilities} 
                        onChange={(e) => updateState('responsibilities', e.target.value)} 
                        rows={6} 
                        className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                        style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                        placeholder="e.g., Team Management, Budgeting, Client Relations..." 
                        required 
                      />
                  </div>
              )}
              {currentStep === 3 && (
                  <div>
                      <label htmlFor="daily-tasks" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                         What are your recurring daily or weekly tasks?
                      </label>
                      <textarea 
                        id="daily-tasks" 
                        value={dailyTasks} 
                        onChange={(e) => updateState('dailyTasks', e.target.value)} 
                        rows={6} 
                        className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                        style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                        placeholder="e.g., Daily stand-ups, Weekly reports, Email correspondence..." 
                        required 
                      />
                  </div>
              )}
               {currentStep === 4 && (
                    <div>
                        <label htmlFor="deep-focus" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           What kind of big projects require your deep focus?
                        </label>
                        <textarea 
                          id="deep-focus" 
                          value={deepFocusProjects} 
                          onChange={(e) => updateState('deepFocusProjects', e.target.value)} 
                          rows={6} 
                          className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                          style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                          placeholder="e.g., Q4 strategic plan, New feature launch, Market research..." 
                          required 
                        />
                    </div>
                )}
                {currentStep === 5 && (
                    <div>
                        <label htmlFor="metrics" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           What key numbers or metrics do you need to track regularly?
                        </label>
                        <textarea 
                          id="metrics" 
                          value={metrics} 
                          onChange={(e) => updateState('metrics', e.target.value)} 
                          rows={6} 
                          className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                          style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                          placeholder="e.g., Sales figures, Website traffic, Customer satisfaction scores..." 
                          required 
                        />
                    </div>
                )}
                 {currentStep === 6 && (
                    <div>
                        <label htmlFor="meetings" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           What regular meetings do you lead or attend?
                        </label>
                        <textarea 
                          id="meetings" 
                          value={meetings} 
                          onChange={(e) => updateState('meetings', e.target.value)} 
                          rows={6} 
                          className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                          style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                          placeholder="e.g., Monday team sync, Friday leadership review..." 
                          required 
                        />
                    </div>
                )}
                 {currentStep === 7 && (
                    <div>
                        <label htmlFor="challenge" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           What is the biggest challenge in managing your time?
                        </label>
                        <textarea 
                          id="challenge" 
                          value={timeChallenge} 
                          onChange={(e) => updateState('timeChallenge', e.target.value)} 
                          rows={6} 
                          className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                          style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                          placeholder="e.g., Too many interruptions, Prioritizing tasks, Procrastination..." 
                          required 
                        />
                    </div>
                )}
                {currentStep === 8 && (
                    <fieldset>
                        <legend className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                            How do you prefer your assistant to communicate?
                        </legend>
                        <div className="space-y-3">
                            {['Direct and data-focused', 'Conversational and encouraging'].map(option => (
                                <label 
                                  key={option} 
                                  htmlFor={option} 
                                  className={`flex items-center cursor-pointer p-4 border-2 rounded-lg transition-all duration-300 focus-within:ring-2 ${commStyle === option ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                  style={{
                                    borderColor: commStyle === option ? 'var(--primary-600)' : undefined,
                                    backgroundColor: commStyle === option ? 'var(--primary-50)' : undefined,
                                    '--tw-ring-color': 'var(--primary-600)'
                                  } as React.CSSProperties}
                                  onMouseEnter={(e) => commStyle !== option && (e.currentTarget.style.borderColor = 'var(--primary-300)')}
                                  onMouseLeave={(e) => commStyle !== option && (e.currentTarget.style.borderColor = '')}
                                >
                                    <input type="radio" id={option} name="commStyle" value={option} checked={commStyle === option} onChange={(e) => updateState('commStyle', e.target.value)} className="" />
                                    <span className="ml-3 text-gray-700 dark:text-gray-300">{option}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}
                {currentStep === 9 && (
                    <fieldset>
                        <legend className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           What makes you feel most successful?
                        </legend>
                        <div className="space-y-3">
                            {['Clearing my to-do list', 'Making progress on a major project', 'Seeing my team grow'].map(option => (
                                <label 
                                  key={option} 
                                  htmlFor={option} 
                                  className={`flex items-center cursor-pointer p-4 border-2 rounded-lg transition-all duration-300 focus-within:ring-2 ${successDefinition === option ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                  style={{
                                    borderColor: successDefinition === option ? 'var(--primary-600)' : undefined,
                                    backgroundColor: successDefinition === option ? 'var(--primary-50)' : undefined,
                                    '--tw-ring-color': 'var(--primary-600)'
                                  } as React.CSSProperties}
                                  onMouseEnter={(e) => successDefinition !== option && (e.currentTarget.style.borderColor = 'var(--primary-300)')}
                                  onMouseLeave={(e) => successDefinition !== option && (e.currentTarget.style.borderColor = '')}
                                >
                                    <input type="radio" id={option} name="successDefinition" value={option} checked={successDefinition === option} onChange={(e) => updateState('successDefinition', e.target.value)} className="" />
                                    <span className="ml-3 text-gray-700 dark:text-gray-300">{option}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                )}
                 {currentStep === 10 && (
                    <div>
                        <label htmlFor="assistant-name" className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 block mb-3 text-center">
                           Finally, what would you like to name your new personal assistant?
                        </label>
                        <input 
                          id="assistant-name" 
                          type="text" 
                          value={assistantName} 
                          onChange={(e) => updateState('assistantName', e.target.value)} 
                          className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition duration-300" 
                          style={{ '--tw-ring-color': 'var(--primary-300)' } as React.CSSProperties}
                          placeholder="e.g., G.R.E.T.E.L, Jarvis, Friday..." 
                          required 
                        />
                        {renderNameValidationFeedback()}
                    </div>
                )}
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  className="w-full sm:w-auto bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2.5 sm:py-3 px-6 rounded-lg transition-all duration-200 ease-in-out active:scale-95"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isNextDisabled()}
                  className="w-full sm:w-auto bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-6 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC143C] disabled:bg-gray-400 disabled:hover:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {currentStep === 10 ? 'Finish Setup' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-black tracking-wider uppercase" style={{ color: 'var(--primary-600)' }}>
          G.R.E.T.E.L
        </h1>
      </div>
      {renderContent()}
    </div>
  );
};

export default SetupWizardPage;