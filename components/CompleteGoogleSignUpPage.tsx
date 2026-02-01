import React, { useState, useEffect } from 'react';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { UserProfile } from './types';
import { EyeIcon } from './AnimatedIcons/EyeIcon';
import { EyeOffIcon } from './AnimatedIcons/EyeOffIcon';

// Re-using components and styles from other files for consistency
const ValidationIndicator = ({ isValid, text }: { isValid: boolean; text: string }) => (
  <li className={`flex items-center text-sm transition-colors duration-300 ${isValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      {isValid ? (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
      ) : (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path>
      )}
    </svg>
    {text}
  </li>
);

interface CompleteGoogleSignUpPageProps {
  userProfile: UserProfile;
  onComplete: (password: string) => Promise<{ success: boolean; error?: string }>;
  onNavigateToPrivacy: () => void;
  onNavigateToTerms: () => void;
}

const CompleteGoogleSignUpPage: React.FC<CompleteGoogleSignUpPageProps> = ({ userProfile, onComplete, onNavigateToPrivacy, onNavigateToTerms }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [passwordValidations, setPasswordValidations] = useState({
    length: false, uppercase: false, lowercase: false, number: false, specialChar: false,
  });

  const [passwordsMatch, setPasswordsMatch] = useState(true);

  useEffect(() => {
    setPasswordValidations({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    });
  }, [password]);

  useEffect(() => {
    setPasswordsMatch(confirmPassword ? password === confirmPassword : true);
  }, [password, confirmPassword]);

  const handleCompleteSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await onComplete(password);

      if (!result.success) {
        setError(`Failed to complete sign-up: ${result.error || 'Please try again.'}`);
        setIsLoading(false);
      }
      // If successful, keep loading state - the parent component will handle navigation
      // Don't set isLoading(false) here to prevent the form from resetting
    } catch (error) {
      console.error('Error in handleCompleteSignUp:', error);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const strength = Object.values(passwordValidations).filter(Boolean).length;
  const strengthPercentage = (strength / 5) * 100;
  let strengthColor = strength > 0 ? (strengthPercentage < 60 ? 'bg-red-500' : strengthPercentage < 100 ? 'bg-yellow-500' : 'bg-green-500') : 'bg-gray-300 dark:bg-gray-700';
  
  const isFormValid = Object.values(passwordValidations).every(Boolean) && passwordsMatch && agreedToTerms;

  return (
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate__animated animate__bounceIn">
      <div className="space-y-4 sm:space-y-5">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-primary-600 tracking-wider uppercase">G.R.E.T.E.L</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Complete Your Account</p>
        </div>
        
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">Welcome, <strong className="text-gray-800 dark:text-gray-200">{userProfile.name}</strong>!</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">{userProfile.email}</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Please create a password for your G.R.E.T.E.L account to finalize your sign-up.</p>
        </div>

        <form className="space-y-3 sm:space-y-4" onSubmit={handleCompleteSignUp} noValidate>
          <div>
            <label htmlFor="new-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Password</label>
            <div className="relative w-full">
              <input type={isPasswordVisible ? 'text' : 'password'} id="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-600" placeholder="••••••••" required />
              <button type="button" className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-primary-600" onClick={() => setIsPasswordVisible(!isPasswordVisible)}>
                {isPasswordVisible ? (
                  <EyeOffIcon size={20} />
                ) : (
                  <EyeIcon size={20} />
                )}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all duration-500 ${strengthColor}`} style={{ width: `${strengthPercentage}%` }}></div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
              <ul className="space-y-1">
                <ValidationIndicator isValid={passwordValidations.length} text="At least 8 characters" />
                <ValidationIndicator isValid={passwordValidations.uppercase} text="One uppercase letter" />
                <ValidationIndicator isValid={passwordValidations.lowercase} text="One lowercase letter" />
                <ValidationIndicator isValid={passwordValidations.number} text="One number" />
                <ValidationIndicator isValid={passwordValidations.specialChar} text="One special character" />
              </ul>
            </div>
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Confirm Password</label>
            <div className="relative w-full">
              <input type={isConfirmPasswordVisible ? 'text' : 'password'} id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border rounded-lg focus:outline-none focus:ring-2 ${!passwordsMatch && confirmPassword ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-primary-600'}`} placeholder="••••••••" required />
              <button type="button" className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-primary-600" onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}>
                {isConfirmPasswordVisible ? (
                  <EyeOffIcon size={20} />
                ) : (
                  <EyeIcon size={20} />
                )}
              </button>
            </div>
            {!passwordsMatch && confirmPassword && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Passwords do not match.</p>}
          </div>
          <div className="flex items-start">
            <input id="terms" name="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="cursor-pointer" />
            <div className="ml-3 text-sm">
              <label htmlFor="terms" className="text-gray-700 dark:text-gray-300">
                I agree to the <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToTerms(); }} className="font-medium text-primary-600 hover:underline">Terms of Service</a> and <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToPrivacy(); }} className="font-medium text-primary-600 hover:underline">Privacy Policy</a>.
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 text-center" role="alert">{error}</p>}
          <div>
            <button type="submit" disabled={!isFormValid || isLoading} className="w-full flex justify-center items-center bg-primary-600 hover:bg-primary-700 text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed">
              {isLoading && <div className="custom-loader-sm"></div>}
              {isLoading ? 'Completing Sign-Up...' : 'Complete Sign-Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default CompleteGoogleSignUpPage;
