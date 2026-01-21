
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import SuccessNotification from './SuccessNotification';
import AppIcon from './AppIcon';
import { EyeIcon } from './AnimatedIcons/EyeIcon';
import { EyeOffIcon } from './AnimatedIcons/EyeOffIcon';

interface ResetPasswordPageProps {
  onResetSuccess: () => void;
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

const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onResetSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmNewPasswordVisible, setIsConfirmNewPasswordVisible] = useState(false);
  const [passwordValidations, setPasswordValidations] = useState({ length: false, uppercase: false, lowercase: false, number: false, specialChar: false });
  const [passwordsMatch, setPasswordsMatch] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    setPasswordValidations({
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      lowercase: /[a-z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
    });
  }, [newPassword]);

  useEffect(() => {
    setPasswordsMatch(confirmNewPassword ? newPassword === confirmNewPassword : true);
  }, [newPassword, confirmNewPassword]);

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setIsLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setIsLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setShowSuccess(true);
    }
  };

  const handleConfirmSuccess = async () => {
    await supabase.auth.signOut();
    onResetSuccess();
  };
  
  const strength = Object.values(passwordValidations).filter(Boolean).length;
  const strengthPercentage = (strength / 5) * 100;
  let strengthColor = strength === 0 ? 'bg-gray-300 dark:bg-gray-700' : strengthPercentage < 60 ? 'bg-red-500' : strengthPercentage < 100 ? 'bg-yellow-500' : 'bg-green-500';

  const isFormValid = newPassword.length > 0 && Object.values(passwordValidations).every(Boolean) && passwordsMatch;

  return (
    <>
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-lg sm:shadow-2xl p-4 max-[360px]:p-3 min-[414px]:p-5 sm:p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-300 animate__animated animate__bounceIn">
        <div className="space-y-4 sm:space-y-5">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-black text-[#DC143C] tracking-wider uppercase">G.R.E.T.E.L</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Set a New Password</p>
          </div>
          <form className="space-y-3 sm:space-y-4" onSubmit={handleResetPassword} noValidate>
            <div>
              <label htmlFor="new-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">New Password</label>
              <div className="relative w-full">
                <input
                  type={isNewPasswordVisible ? 'text' : 'password'}
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                  placeholder="••••••••"
                  required
                  aria-describedby="password-requirements"
                />
                <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-[#DC143C] dark:hover:text-[#DC143C] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-700"
                    onClick={() => setIsNewPasswordVisible(!isNewPasswordVisible)}
                    aria-label={isNewPasswordVisible ? "Hide password" : "Show password"}
                >
                    {isNewPasswordVisible ? (
                      <EyeOffIcon size={20} />
                    ) : (
                      <EyeIcon size={20} />
                    )}
                </button>
              </div>
            </div>
            
            {newPassword && (
              <div className="space-y-2 animate__animated animate__bounceIn animate__faster">
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
            )}
            
            <div>
              <label htmlFor="confirm-password" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Confirm New Password</label>
              <div className="relative w-full">
                <input
                  type={isConfirmNewPasswordVisible ? 'text' : 'password'}
                  id="confirm-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className={`w-full p-2.5 sm:p-3 pr-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${!passwordsMatch && confirmNewPassword ? 'border-red-500 ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-[#DC143C]'}`}
                  placeholder="••••••••"
                  required
                  aria-invalid={!passwordsMatch}
                  aria-describedby="password-match-error"
                />
                 <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-[#DC143C] dark:hover:text-[#DC143C] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#DC143C] dark:focus-visible:ring-offset-gray-700"
                    onClick={() => setIsConfirmNewPasswordVisible(!isConfirmNewPasswordVisible)}
                    aria-label={isConfirmNewPasswordVisible ? "Hide password" : "Show password"}
                >
                    {isConfirmNewPasswordVisible ? (
                      <EyeOffIcon size={20} />
                    ) : (
                      <EyeIcon size={20} />
                    )}
                </button>
              </div>
              {!passwordsMatch && confirmNewPassword && (
                <p id="password-match-error" className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Passwords do not match.
                </p>
              )}
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
                {isLoading ? 'Saving...' : 'Set New Password'}
              </button>
            </div>
          </form>
          <div className="text-center">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onResetSuccess();
              }}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#DC143C] hover:underline transition duration-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
      {showSuccess && (
        <SuccessNotification
            title="Password Updated!"
            message="Your password has been changed successfully. You will now be redirected to the login page."
            onConfirm={handleConfirmSuccess}
        />
      )}
    </>
  );
};

export default ResetPasswordPage;
