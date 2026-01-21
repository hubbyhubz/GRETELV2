

import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import SuccessNotification from './SuccessNotification';
import type { CreateAccountFormData } from './types';
import AppIcon from './AppIcon';
import { EyeIcon } from './AnimatedIcons/EyeIcon';
import { EyeOffIcon } from './AnimatedIcons/EyeOffIcon';

interface CreateAccountPageProps {
  onBackToLogin: () => void;
  onAccountCreated: () => void;
  onNavigateToPrivacy: () => void;
  onNavigateToTerms: () => void;
  formData: CreateAccountFormData;
  onFormChange: (updatedData: Partial<CreateAccountFormData>) => void;
}

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

const CreateAccountPage: React.FC<CreateAccountPageProps> = ({ onBackToLogin, onAccountCreated, onNavigateToPrivacy, onNavigateToTerms, formData, onFormChange }) => {
  const { name, email, password, confirmPassword, agreedToTerms } = formData;
  
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const [passwordValidations, setPasswordValidations] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
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
    if (confirmPassword) {
      setPasswordsMatch(password === confirmPassword);
    } else {
      setPasswordsMatch(true); 
    }
  }, [password, confirmPassword]);

  const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) {
      console.error("Form submitted with invalid data.");
      return;
    }
    setIsLoading(true);
    setError(null);

    // Save metadata to localStorage to survive tab closing for email confirmation.
    localStorage.setItem('gretel_signup_metadata', JSON.stringify({
      name: name.trim(),
    }));

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      // emailRedirectTo is removed to default to Site URL in Supabase settings
    });

    setIsLoading(false);

    if (error) {
      console.error("Supabase signUp error:", error);
      setError(`Sign-up failed: ${error.message}`);
      return;
    }

    if (data.user) {
      if (data.user.email_confirmed_at) {
        // This means the user is already registered and confirmed.
        setError("An account with this email already exists. Please log in or use the 'Forgot Password' link.");
      } else {
        // This is a new user OR an existing unconfirmed user.
        setShowSuccess(true);
      }
    } else {
      // This is an unexpected state if there's no user and no error.
      setError("An unexpected error occurred during sign up. Please try again.");
    }
  };

  const handleConfirmSuccess = () => {
    onAccountCreated();
  };

  const strength = Object.values(passwordValidations).filter(Boolean).length;
  const strengthPercentage = (strength / 5) * 100;
  
  let strengthColor = 'bg-gray-300 dark:bg-gray-700';
  if (strength > 0) {
    if (strengthPercentage < 60) {
        strengthColor = 'bg-red-500';
    } else if (strengthPercentage < 100) {
        strengthColor = 'bg-yellow-500';
    } else {
        strengthColor = 'bg-green-500';
    }
  }
  
  const allValidationsMet = Object.values(passwordValidations).every(Boolean);
  const isFormValid = name.length > 0 && email.length > 0 && password.length > 0 && allValidationsMet && passwordsMatch && agreedToTerms;

  return (
    <>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate__animated animate__bounceIn">
        <div className="space-y-4 sm:space-y-5">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">
              G.R.E.T.E.L
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Create Your Account</p>
          </div>
        <form className="space-y-3 sm:space-y-4" onSubmit={handleCreateAccount} noValidate>
            <div>
              <label htmlFor="name" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => onFormChange({ name: e.target.value })}
                className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C] focus:border-transparent transition-colors duration-300"
                placeholder="Enter your full name"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => onFormChange({ email: e.target.value })}
                className="w-full p-2.5 sm:p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C] focus:border-transparent transition-colors duration-300"
                placeholder="Enter your email"
                required
              />
            </div>
            <div>
              <label htmlFor="new-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Password</label>
              <div className="relative w-full">
                <input
                  type={isPasswordVisible ? 'text' : 'password'}
                  id="new-password"
                  value={password}
                  onChange={(e) => onFormChange({ password: e.target.value })}
                  className="w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C] focus:border-transparent transition-colors duration-300"
                  placeholder="••••••••"
                  required
                  aria-describedby="password-requirements"
                />
                <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-[#DC143C] dark:hover:text-[#DC143C] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-700"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                >
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
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ease-out ${strengthColor}`}
                    style={{ width: `${strengthPercentage}%` }}
                    role="progressbar"
                    aria-valuenow={strengthPercentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Password strength"
                  ></div>
                </div>
                <div id="password-requirements" className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                    <ul className="space-y-1">
                        <ValidationIndicator isValid={passwordValidations.length} text="At least 8 characters" />
                        <ValidationIndicator isValid={passwordValidations.uppercase} text="One uppercase letter (A-Z)" />
                        <ValidationIndicator isValid={passwordValidations.lowercase} text="One lowercase letter (a-z)" />
                        <ValidationIndicator isValid={passwordValidations.number} text="One number (0-9)" />
                        <ValidationIndicator isValid={passwordValidations.specialChar} text="One special character (!@#$...)" />
                    </ul>
                </div>
            </div>
            
            <div>
              <label htmlFor="confirm-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Confirm Password</label>
              <div className="relative w-full">
                <input
                  type={isConfirmPasswordVisible ? 'text' : 'password'}
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => onFormChange({ confirmPassword: e.target.value })}
                  className={`w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-colors duration-300 ${!passwordsMatch && confirmPassword ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-[#DC143C]'}`}
                  placeholder="••••••••"
                  required
                  aria-invalid={!passwordsMatch}
                  aria-describedby="password-match-error"
                />
                 <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-[#DC143C] dark:hover:text-[#DC143C] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-700"
                    onClick={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                    aria-label={isConfirmPasswordVisible ? "Hide password" : "Show password"}
                >
                    {isConfirmPasswordVisible ? (
                      <EyeOffIcon size={20} />
                    ) : (
                      <EyeIcon size={20} />
                    )}
                </button>
              </div>
              {!passwordsMatch && confirmPassword && (
                <p id="password-match-error" className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Passwords do not match.
                </p>
              )}
            </div>
             <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => onFormChange({ agreedToTerms: e.target.checked })}
                  className="cursor-pointer"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="terms" className="text-gray-700 dark:text-gray-300">
                  I agree to the{' '}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onNavigateToTerms(); }}
                    className="font-medium text-[#DC143C] hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onNavigateToPrivacy(); }}
                    className="font-medium text-[#DC143C] hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
                  >
                    Privacy Policy
                  </a>.
                </label>
              </div>
            </div>
             {error && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center" role="alert">
                {error}
              </p>
            )}
            <div>
              <button
                type="submit"
                disabled={!isFormValid || isLoading}
                className="w-full flex justify-center items-center bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC143C] disabled:bg-gray-400 disabled:hover:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isLoading && <div className="custom-loader-sm"></div>}
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </form>
          <div className="text-center">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onBackToLogin();
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#DC143C] hover:underline transition duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
            >
              Back to Login
            </a>
          </div>
        </div>
        <div className="pt-6 mt-6 sm:pt-8 sm:mt-8 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Copyright © 2025 | G.R.E.T.E.L by Hanzel
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:gap-4 text-xs text-gray-500 dark:text-gray-400">
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToPrivacy(); }} className="hover:text-[#DC143C] hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]">Privacy Policy</a>
              <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToTerms(); }} className="hover:text-[#DC143C] hover:underline transition-colors duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]">Terms of Service</a>
          </div>
        </div>
      </div>
      {showSuccess && (
        <SuccessNotification
            title="Confirmation Email Sent!"
            message={`Your account has been created. A confirmation link has been sent to ${email}. It may take a few minutes to arrive. Please be sure to check your spam or junk folder if you don't see it.`}
            onConfirm={handleConfirmSuccess}
        />
      )}
    </>
  );
};

export default CreateAccountPage;