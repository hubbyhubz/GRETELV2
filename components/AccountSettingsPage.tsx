
import React, { useState, useEffect, useMemo } from 'react';
import type { UserProfile, TeamMember } from './types';
import SuccessNotification from './SuccessNotification';
import ConfirmationModal from './ConfirmationModal';
import { supabase } from './supabaseClient';
import AppIcon from './AppIcon';
import { ArrowLeftIcon } from './AnimatedIcons/ArrowLeftIcon';
import { UserIcon } from './AnimatedIcons/UserIcon';
import { UsersIcon } from './AnimatedIcons/UsersIcon';
import { SecurityIcon } from './AnimatedIcons/SecurityIcon';
import { XIcon } from './AnimatedIcons/XIcon';

// Icons
import { EyeIcon } from './AnimatedIcons/EyeIcon';
import { EyeOffIcon } from './AnimatedIcons/EyeOffIcon';

const NavItem = ({ icon: Icon, label, isActive, onClick }: { icon: any, label: string, isActive: boolean, onClick: (e: React.MouseEvent) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <a 
      href="#" 
      onClick={onClick} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive ? 'bg-red-50 dark:bg-red-900/30 text-primary-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
    >
      <Icon size={20} className="mr-2" isHovered={isHovered} /> 
      <span>{label}</span>
    </a>
  );
};

const ValidationIndicator = ({ isValid, text }: { isValid: boolean; text: string }) => (
  <li className={`flex items-center text-sm transition-colors duration-300 ${isValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      {isValid ? ( <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path> ) : ( <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path> )}
    </svg>
    {text}
  </li>
);

// New Component: Assistant Memory Editor
const AssistantMemoryEditor: React.FC<{ memory: string; onMemoryChange: (newMemory: string) => void; }> = ({ memory, onMemoryChange }) => {
    const [facts, setFacts] = useState<string[]>([]);
    const [newFact, setNewFact] = useState('');

    useEffect(() => {
        try {
            const parsedMemory = JSON.parse(memory);
            if (Array.isArray(parsedMemory)) {
                setFacts(parsedMemory);
            } else if (typeof memory === 'string' && memory.trim()) {
                setFacts(memory.split('\n').map(s => s.replace(/^- /, '')).filter(Boolean));
            } else {
                setFacts([]);
            }
        } catch (e) {
            if (typeof memory === 'string' && memory.trim()) {
                setFacts(memory.split('\n').map(s => s.replace(/^- /, '')).filter(Boolean));
            } else {
                setFacts([]);
            }
        }
    }, [memory]);

    const updateParentState = (updatedFacts: string[]) => {
        onMemoryChange(JSON.stringify(updatedFacts));
    };

    const handleAddFact = () => {
        if (newFact.trim()) {
            const updatedFacts = [...facts, newFact.trim()];
            setFacts(updatedFacts);
            updateParentState(updatedFacts);
            setNewFact('');
        }
    };

    const handleRemoveFact = (indexToRemove: number) => {
        const updatedFacts = facts.filter((_, index) => index !== indexToRemove);
        setFacts(updatedFacts);
        updateParentState(updatedFacts);
    };

    return (
        <div>
            <div className="space-y-2 mb-2">
                {facts.map((fact, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
                        <p className="text-sm text-gray-800 dark:text-gray-200">{fact}</p>
                        <button type="button" onClick={() => handleRemoveFact(index)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 shrink-0">
                            <XIcon size={18} />
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    value={newFact}
                    onChange={(e) => setNewFact(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFact(); } }}
                    placeholder="Add a new fact..."
                    className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md"
                />
                <button type="button" onClick={handleAddFact} className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg text-sm shrink-0">Add</button>
            </div>
        </div>
    );
};

// New Component: Avatar Selection Modal
const AvatarSelectionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    userAvatar: string;
    assistantAvatar: string;
    onUserAvatarSelect: (url: string) => void;
    onAssistantAvatarSelect: (url: string) => void;
}> = ({ isOpen, onClose, userAvatar, assistantAvatar, onUserAvatarSelect, onAssistantAvatarSelect }) => {
    // ✅ CORRECT: Call hooks FIRST (always, unconditionally)
    const [activeTab, setActiveTab] = useState<'user' | 'assistant'>('user');

    // Then control rendering with early return (after hooks)
    if (!isOpen) {
        return null;
    }

    const avatarOptions = [
        '/avatars/adventurer-1768572372329.svg',
        '/avatars/adventurer-1768572380403.svg',
        '/avatars/adventurer-1768572382924.svg',
        '/avatars/adventurer-1768572385570.svg',
        '/avatars/adventurer-1768572388806.svg',
        '/avatars/adventurer-1768572392032.svg',
        '/avatars/adventurer-1768572395148.svg',
        '/avatars/adventurer-1768572397864.svg',
        '/avatars/adventurer-1768572401453.svg',
        '/avatars/adventurer-1768572404753.svg',
        '/avatars/adventurer-1768572407771.svg',
        '/avatars/adventurer-1768572411181.svg',
        '/avatars/adventurer-1768572414705.svg',
        '/avatars/adventurer-1768572417976.svg',
        '/avatars/adventurer-1768572421365.svg',
        '/avatars/adventurer-1768572424773.svg',
        '/avatars/adventurer-1768572428479.svg',
        '/avatars/adventurer-1768572431174.svg',
        '/avatars/adventurer-1768572433992.svg',
        '/avatars/adventurer-1768572436986.svg',
    ];

    const currentAvatar = activeTab === 'user' ? userAvatar : assistantAvatar;

    return (
        <div className="fixed inset-0 bg-gray-900/80 z-50 flex flex-col animate__animated animate__fadeIn animate__faster" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 w-full max-w-2xl m-auto rounded-xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-bold">Choose Avatar</h2>
                    <div className="mt-2 border-b border-gray-200 dark:border-gray-700">
                        <nav className="-mb-px flex space-x-6">
                            <button onClick={() => setActiveTab('user')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'user' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-200 dark:hover:border-gray-600'}`}>Your Avatar</button>
                            <button onClick={() => setActiveTab('assistant')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'assistant' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-200 dark:hover:border-gray-600'}`}>Assistant's Avatar</button>
                        </nav>
                    </div>
                </div>
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        {avatarOptions.map(url => (
                            <button key={url} onClick={() => activeTab === 'user' ? onUserAvatarSelect(url) : onAssistantAvatarSelect(url)} className={`relative h-20 w-20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-600 dark:focus-visible:ring-offset-gray-800 transition-transform transform hover:scale-110 ${currentAvatar === url ? 'ring-2 ring-offset-2 ring-primary-600 dark:ring-offset-gray-800' : ''}`}>
                                <img src={url} alt="Avatar" className="h-full w-full rounded-full object-cover"/>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/50 text-right rounded-b-xl border-t border-gray-200 dark:border-gray-700">
                    <button onClick={onClose} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg">Done</button>
                </div>
            </div>
        </div>
    );
};

interface AccountSettingsPageProps { onBackToDashboard: () => void; userProfile: UserProfile; onProfileUpdate: (updatedProfile: UserProfile) => Promise<void>; initialTab?: 'profile' | 'security' | 'team'; }

const PasswordChangeForm: React.FC<{ userProfile: UserProfile; onSuccess: () => void; }> = ({ userProfile, onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirmNewPassword, setConfirmNewPassword] = useState(''); const [isUpdatingPassword, setIsUpdatingPassword] = useState(false); const [passwordUpdateError, setPasswordUpdateError] = useState<string | null>(null); const [passwordValidations, setPasswordValidations] = useState({ length: false, uppercase: false, lowercase: false, number: false, specialChar: false }); const [passwordsMatch, setPasswordsMatch] = useState(true); const [newPasswordIsSameAsCurrent, setNewPasswordIsSameAsCurrent] = useState(false); const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] = useState(false); const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false); const [isConfirmNewPasswordVisible, setIsConfirmNewPasswordVisible] = useState(false);
  useEffect(() => { setPasswordValidations({ length: newPassword.length >= 8, uppercase: /[A-Z]/.test(newPassword), lowercase: /[a-z]/.test(newPassword), number: /[0-9]/.test(newPassword), specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword), }); setNewPasswordIsSameAsCurrent(currentPassword ? newPassword === currentPassword : false); }, [newPassword, currentPassword]);
  useEffect(() => { setPasswordsMatch(confirmNewPassword ? newPassword === confirmNewPassword : true); }, [newPassword, confirmNewPassword]);
  const allValidationsMet = Object.values(passwordValidations).every(Boolean); const isPasswordFormValid = currentPassword.length > 0 && !newPasswordIsSameAsCurrent && newPassword.length > 0 && confirmNewPassword.length > 0 && allValidationsMet && passwordsMatch;
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
    ]);
  };
  
  const handleSecurityUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordFormValid || isUpdatingPassword) return;

    setIsUpdatingPassword(true);
    setPasswordUpdateError(null);

    try {
      // Step 1: Verify current password by attempting to sign in.
      // This re-authenticates the user and ensures they know their current password.
      const { error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: userProfile.email,
          password: currentPassword,
        }),
        3000,
        'Password verification timed out. Please try again.'
      );

      if (signInError) {
        setPasswordUpdateError('Your current password does not match.');
        setIsUpdatingPassword(false);
        return;
      }
      
      // Step 2: If verification is successful, update to the new password.
      const { error: updateError } = await withTimeout(
        supabase.auth.updateUser({
          password: newPassword,
        }),
        3000,
        'Password update timed out. Please try again.'
      );

      if (updateError) {
        setPasswordUpdateError(updateError.message);
        setIsUpdatingPassword(false);
        return;
      }

      // Password update successful
      onSuccess();
      
      // Clear the password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      
    } catch (error: any) {
      console.error('Password update error:', error);
      if (error?.message?.includes('timed out')) {
        // If the update succeeded server-side but the response timed out, confirm by signing in with the new password.
        try {
          const { error: reauthError } = await withTimeout(
            supabase.auth.signInWithPassword({
              email: userProfile.email,
              password: newPassword,
            }),
            3000,
            'Re-authentication timed out.'
          );
          if (!reauthError) {
            onSuccess();
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            return;
          }
        } catch (reauthCatch) {
          console.error('Reauth after timeout failed:', reauthCatch);
        }
        setPasswordUpdateError('Password update timed out. If it changed, please log in again.');
      } else {
        setPasswordUpdateError(error.message || 'An unexpected error occurred');
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const strength = Object.values(passwordValidations).filter(Boolean).length; const strengthPercentage = (strength / 5) * 100; let strengthColor = strength === 0 ? 'bg-gray-300 dark:bg-gray-700' : strengthPercentage < 60 ? 'bg-red-500' : strengthPercentage < 100 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <form onSubmit={handleSecurityUpdate} className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow border border-gray-200 dark:border-gray-700">
      <div className="p-4 sm:p-6"><h3 className="text-lg font-bold mb-4">Change Password</h3><div className="space-y-4">
          <div><label htmlFor="current-password">Current Password</label><div className="relative"><input id="current-password" type={isCurrentPasswordVisible ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" required/><button type="button" onClick={() => setIsCurrentPasswordVisible(!isCurrentPasswordVisible)} className="absolute inset-y-0 right-0 px-3 text-gray-500 dark:text-gray-400">{isCurrentPasswordVisible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}</button></div></div>
          <div><label htmlFor="new-password">New Password</label><div className="relative"><input id="new-password" type={isNewPasswordVisible ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" required/><button type="button" onClick={() => setIsNewPasswordVisible(!isNewPasswordVisible)} className="absolute inset-y-0 right-0 px-3 text-gray-500 dark:text-gray-400">{isNewPasswordVisible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}</button></div></div>
          {newPassword && (<div className="space-y-2"><div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2"><div className={`h-2 rounded-full transition-all duration-500 ease-out ${strengthColor}`} style={{ width: `${strengthPercentage}%` }}></div></div><div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"><ul className="space-y-1"><ValidationIndicator isValid={passwordValidations.length} text="At least 8 characters"/><ValidationIndicator isValid={passwordValidations.uppercase} text="One uppercase letter"/><ValidationIndicator isValid={passwordValidations.lowercase} text="One lowercase letter"/><ValidationIndicator isValid={passwordValidations.number} text="One number"/><ValidationIndicator isValid={passwordValidations.specialChar} text="One special character"/></ul></div></div>)}
          <div><label htmlFor="confirm-new-password">Confirm New Password</label><div className="relative"><input id="confirm-new-password" type={isConfirmNewPasswordVisible ? 'text' : 'password'} value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" required/><button type="button" onClick={() => setIsConfirmNewPasswordVisible(!isConfirmNewPasswordVisible)} className="absolute inset-y-0 right-0 px-3 text-gray-500 dark:text-gray-400">{isConfirmNewPasswordVisible ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}</button></div></div>
          {!passwordsMatch && confirmNewPassword && <p className="text-sm text-red-600">Passwords do not match.</p>} {newPasswordIsSameAsCurrent && <p className="text-sm text-red-600">New password cannot be the same as the current password.</p>} {passwordUpdateError && <p className="text-sm text-red-600">{passwordUpdateError}</p>}
      </div></div>
      <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-700/50 text-right rounded-b-lg sm:rounded-b-xl"><button type="submit" disabled={!isPasswordFormValid || isUpdatingPassword} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 active:scale-95">{isUpdatingPassword ? 'Changing Password...' : 'Change Password'}</button></div>
    </form>
  );
};

export function AccountSettingsPage({ onBackToDashboard, userProfile, onProfileUpdate, initialTab = 'profile' }: AccountSettingsPageProps) {
  // CRITICAL: All hooks must be called before any conditional returns (Rules of Hooks)
  // Ensure userProfile has all required properties with defaults - use useMemo to prevent recreation
  const safeUserProfile: UserProfile = useMemo(() => {
    if (!userProfile) {
      // Return a default profile if userProfile is null/undefined
      return {
        id: '',
        name: '',
        nickname: '',
        email: '',
        companyId: '',
        mobileNumber: '',
        avatar: '',
        assistantAvatar: '',
        assistantName: 'G.R.E.T.E.L',
        role: '',
        responsibilities: '',
        dailyTasks: '',
        deepFocusProjects: '',
        metrics: '',
        meetings: '',
        timeChallenge: '',
        commStyle: '',
        successDefinition: '',
        setup_complete: false,
        assistantMemory: '',
        team: [],
        passiveMemory: [],
        relationalMemory: { nodes: [], edges: [] },
      };
    }
    return {
    id: userProfile.id || '',
    name: userProfile.name || '',
    nickname: userProfile.nickname || '',
    email: userProfile.email || '',
    companyId: userProfile.companyId || '',
    mobileNumber: userProfile.mobileNumber || '',
    avatar: userProfile.avatar || '',
    assistantAvatar: userProfile.assistantAvatar || '',
    assistantName: userProfile.assistantName || 'G.R.E.T.E.L',
    role: userProfile.role || '',
    responsibilities: userProfile.responsibilities || '',
    dailyTasks: userProfile.dailyTasks || '',
    deepFocusProjects: userProfile.deepFocusProjects || '',
    metrics: userProfile.metrics || '',
    meetings: userProfile.meetings || '',
    timeChallenge: userProfile.timeChallenge || '',
    commStyle: userProfile.commStyle || '',
    successDefinition: userProfile.successDefinition || '',
    setup_complete: userProfile.setup_complete ?? false,
    assistantMemory: userProfile.assistantMemory || '',
      team: Array.isArray(userProfile.team) ? userProfile.team : [],
      passiveMemory: Array.isArray((userProfile as any).passiveMemory) ? (userProfile as any).passiveMemory : [],
      relationalMemory: (userProfile as any).relationalMemory || { nodes: [], edges: [] },
    };
  }, [userProfile]);
  
  // Now all hooks must be called before any conditional returns
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'team'>(initialTab);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false); const [integrationError, setIntegrationError] = useState(''); const [isUnlinking, setIsUnlinking] = useState(false); const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); const [successModalInfo, setSuccessModalInfo] = useState({ title: '', message: '' });
  const [profileData, setProfileData] = useState<UserProfile>(safeUserProfile);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<TeamMember | null>(null);
  const [isCompanyIdValid, setIsCompanyIdValid] = useState(true);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCheckingAssistantName, setIsCheckingAssistantName] = useState(false);
  const [assistantNameError, setAssistantNameError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isBackToDashboardHovered, setIsBackToDashboardHovered] = useState(false);
  
  // Now we can check if userProfile is missing and return early (after all hooks)
  if (!userProfile) {
    return <div className="p-4 text-red-600">Error: User profile not available</div>;
  }
  
  useEffect(() => { 
    try {
      const updatedSafeProfile: UserProfile = {
        id: userProfile?.id || '',
        name: userProfile?.name || '',
        nickname: userProfile?.nickname || '',
        email: userProfile?.email || '',
        companyId: userProfile?.companyId || '',
        mobileNumber: userProfile?.mobileNumber || '',
        avatar: userProfile?.avatar || '',
        assistantAvatar: userProfile?.assistantAvatar || '',
        assistantName: userProfile?.assistantName || 'G.R.E.T.E.L',
        role: userProfile?.role || '',
        responsibilities: userProfile?.responsibilities || '',
        dailyTasks: userProfile?.dailyTasks || '',
        deepFocusProjects: userProfile?.deepFocusProjects || '',
        metrics: userProfile?.metrics || '',
        meetings: userProfile?.meetings || '',
        timeChallenge: userProfile?.timeChallenge || '',
        commStyle: userProfile?.commStyle || '',
        successDefinition: userProfile?.successDefinition || '',
        setup_complete: userProfile?.setup_complete ?? false,
        assistantMemory: userProfile?.assistantMemory || '',
        team: Array.isArray(userProfile?.team) ? userProfile.team : [],
        passiveMemory: Array.isArray((userProfile as any)?.passiveMemory) ? (userProfile as any).passiveMemory : [],
        relationalMemory: (userProfile as any)?.relationalMemory || { nodes: [], edges: [] },
      };
      setProfileData(updatedSafeProfile);
    } catch (error: any) {
      console.error('Error updating profile data:', error);
    }
  }, [userProfile]);
  useEffect(() => { 
    setIsCompanyIdValid(!profileData.companyId || profileData.companyId.startsWith('CRM')); 
  }, [profileData.companyId]);

  // Debounced check for assistant name uniqueness
  useEffect(() => {
    const handler = setTimeout(async () => {
        if (!profileData.assistantName || profileData.assistantName === safeUserProfile.assistantName) {
            setAssistantNameError(null);
            setIsCheckingAssistantName(false);
            return;
        }
        setIsCheckingAssistantName(true);
        setAssistantNameError(null);
        const { data, error } = await supabase.from('profiles').select('full_name').eq('assistant_name', profileData.assistantName).neq('id', safeUserProfile.id).maybeSingle();
        if (error) {
            console.error("Error checking assistant name:", error);
        } else if (data) {
            setAssistantNameError(`This name is already used by "${data.full_name}".`);
        } else {
            setAssistantNameError('This name is available!');
        }
        setIsCheckingAssistantName(false);
    }, 500);
    return () => clearTimeout(handler);
}, [profileData.assistantName, safeUserProfile.id, safeUserProfile.assistantName]);


  useEffect(() => { 
    const checkConnections = async () => { 
      try {
        const { data: { session } } = await supabase.auth.getSession(); 
        const providers = session?.user?.app_metadata?.providers || []; 
        setIsGoogleConnected(providers.includes('google')); 
      } catch (error: any) {
        console.error('Error checking connections:', error);
      }
    }; 
    checkConnections(); 
  }, []);
  
  const handleProfileDataChange = (e: React.ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; setProfileData(prev => ({ ...prev, [name]: value })); };
  const handleMemoryChange = (newMemory: string) => { setProfileData(prev => ({ ...prev, assistantMemory: newMemory })); };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    if (!isCompanyIdValid || (assistantNameError && assistantNameError !== 'This name is available!')) return;
    try {
        await onProfileUpdate(profileData);
        setSuccessModalInfo({ title: 'Profile Updated', message: 'Your profile information has been saved successfully.' });
        setShowSuccessModal(true);
    } catch (error: any) {
        console.error("Caught profile update error in page:", error);
        if (error && error.name === 'SchemaMismatchError') {
            const match = error.details?.match(/Could not find the '(\w+)' column/);
            const missingColumn = match ? match[1] : 'a required';
            setProfileError(`Database Error: The '${missingColumn}' column is missing from your 'profiles' table. Please add it in your Supabase project to save this setting.`);
        } else {
            setProfileError('An unexpected error occurred while saving. Please check the console for details.');
        }
    }
  };
    
  const handleGoogleConnect = async () => { setIntegrationError(''); const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send', }, }); if (error) setIntegrationError(`Google Connection Error: ${error.message}`); };
  const confirmGoogleUnlink = async () => { setShowUnlinkConfirm(false); setIsUnlinking(true); setIntegrationError(''); const { data: { session } } = await supabase.auth.getSession(); if (!session) { setIntegrationError("Could not get user session."); setIsUnlinking(false); return; } const googleIdentity = session.user.identities?.find(i => i.provider === 'google'); if (!googleIdentity) { setIntegrationError("No Google identity found."); setIsGoogleConnected(false); setIsUnlinking(false); return; } const { error } = await supabase.auth.unlinkIdentity(googleIdentity); if (error) { const rawMessage = error.message || 'Unknown error'; const friendly = rawMessage.toLowerCase().includes('manual linking is disabled') ? 'Unlinking is disabled in Supabase. Enable "Manual linking" in Auth settings, then try again.' : rawMessage; setIntegrationError(`Failed to unlink: ${friendly}`); } else { setIsGoogleConnected(false); setSuccessModalInfo({ title: 'Account Unlinked', message: 'Your Google account has been successfully unlinked.' }); setShowSuccessModal(true); } setIsUnlinking(false); };
  const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const generateTeamMemberId = (): string => `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddTeamMember = async () => {
      const trimmedName = newMemberName.trim(); const trimmedRole = newMemberRole.trim(); const trimmedEmail = newMemberEmail.trim();
      if (!trimmedName || !trimmedRole || !trimmedEmail) { setTeamError("All fields are required."); return; }
      if (!isValidEmail(trimmedEmail)) { setTeamError("Please enter a valid email address."); return; }
      if (profileData.team.some(member => member.email.toLowerCase() === trimmedEmail.toLowerCase())) { setTeamError("A team member with this email already exists."); return; }
      setTeamError(null); const newMember: TeamMember = { id: generateTeamMemberId(), name: trimmedName, role: trimmedRole, email: trimmedEmail, }; const updatedTeam = [...profileData.team, newMember]; const updatedProfile = { ...profileData, team: updatedTeam };
      try {
        await onProfileUpdate(updatedProfile); setNewMemberName(''); setNewMemberRole(''); setNewMemberEmail(''); setIsAddingMember(false);
        setSuccessModalInfo({ title: 'Member Added', message: `${newMember.name} has been successfully added to your team.` }); setShowSuccessModal(true);
      } catch (error: any) {
        if (error && error.name === 'SchemaMismatchError') {
            const match = error.details?.match(/Could not find the '(\w+)' column/);
            const missingColumn = match ? match[1] : 'team';
            setTeamError(`Database Error: The '${missingColumn}' column is missing. Please add it in Supabase to save team members.`);
        } else {
            setTeamError("Failed to save new team member. Please try again.");
        }
      }
  };
  const handleConfirmRemove = async () => {
    if (!showRemoveConfirm) return; const memberToRemove = showRemoveConfirm; const updatedTeam = profileData.team.filter(member => member.id !== memberToRemove.id); const updatedProfile = { ...profileData, team: updatedTeam };
    try { 
        await onProfileUpdate(updatedProfile); 
        setShowRemoveConfirm(null); 
        setSuccessModalInfo({ title: 'Member Removed', message: `${memberToRemove.name} has been successfully removed.` }); 
        setShowSuccessModal(true); 
    } catch (error: any) {
        if (error && error.name === 'SchemaMismatchError') {
            const match = error.details?.match(/Could not find the '(\w+)' column/);
            const missingColumn = match ? match[1] : 'team';
            setTeamError(`Database Error: The '${missingColumn}' column is missing. Could not remove member.`);
        } else {
            setTeamError("Failed to remove team member. Please try again.");
        }
        setShowRemoveConfirm(null);
    }
  };
  const handleCancelAddMember = () => { setIsAddingMember(false); setNewMemberName(''); setNewMemberRole(''); setNewMemberEmail(''); setTeamError(null); };
  
  const isSaveDisabled = !isCompanyIdValid || isCheckingAssistantName || (!!assistantNameError && assistantNameError !== 'This name is available!');

  console.log('AccountSettingsPage rendering, activeTab:', activeTab);
  return (
    <>
    <AvatarSelectionModal isOpen={isAvatarModalOpen} onClose={() => setIsAvatarModalOpen(false)} userAvatar={profileData.avatar} assistantAvatar={profileData.assistantAvatar} onUserAvatarSelect={(url) => setProfileData(p => ({...p, avatar: url}))} onAssistantAvatarSelect={(url) => setProfileData(p => ({...p, assistantAvatar: url}))} />
    <div className="flex min-h-[100dvh] md:h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans" style={{background: '#f3f4f6'}}>
        <div className="flex-1 flex flex-col overflow-hidden">
            <header className="flex justify-between items-center p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <button
                  onClick={onBackToDashboard}
                  onMouseEnter={() => setIsBackToDashboardHovered(true)}
                  onMouseLeave={() => setIsBackToDashboardHovered(false)}
                  onFocus={() => setIsBackToDashboardHovered(true)}
                  onBlur={() => setIsBackToDashboardHovered(false)}
                  className="flex items-center text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-primary-600 transition-colors rounded-md p-1 -ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                  <ArrowLeftIcon size={20} className="mr-2 text-primary-600" isHovered={isBackToDashboardHovered} />
                  Back to Dashboard
                </button>
                <h1 className="text-xl font-bold text-primary-600 hidden sm:block">Account Settings</h1><div className="w-32"></div>
            </header>
            <main className="flex-1 overflow-hidden">
              <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="h-full lg:flex lg:gap-x-8">
                <aside className="hidden lg:block lg:w-1/4 py-8 pr-4">
                  <nav className="space-y-1">
                    <NavItem icon={UserIcon} label="Profile" isActive={activeTab === 'profile'} onClick={(e) => { e.preventDefault(); setActiveTab('profile'); }} />
                    <NavItem icon={SecurityIcon} label="Security & Integrations" isActive={activeTab === 'security'} onClick={(e) => { e.preventDefault(); setActiveTab('security'); }} />
                    <NavItem icon={UsersIcon} label="Team Management" isActive={activeTab === 'team'} onClick={(e) => { e.preventDefault(); setActiveTab('team'); }} />
                  </nav>
                </aside>
                <div className="flex-1 overflow-y-auto py-6 sm:py-8 space-y-6 sm:px-6 lg:px-0">
                    <div className="lg:hidden sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveTab('profile')}
                          className={`flex-1 py-2 max-[360px]:py-1.5 text-xs sm:text-sm max-[360px]:text-[10px] font-semibold uppercase tracking-wider border-b-2 ${activeTab === 'profile' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 dark:text-gray-400'}`}
                        >
                          Profile
                        </button>
                        <button
                          onClick={() => setActiveTab('security')}
                          className={`flex-1 py-2 max-[360px]:py-1.5 text-xs sm:text-sm max-[360px]:text-[10px] font-semibold uppercase tracking-wider border-b-2 ${activeTab === 'security' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 dark:text-gray-400'}`}
                        >
                          Security
                        </button>
                        <button
                          onClick={() => setActiveTab('team')}
                          className={`flex-1 py-2 max-[360px]:py-1.5 text-xs sm:text-sm max-[360px]:text-[10px] font-semibold uppercase tracking-wider border-b-2 ${activeTab === 'team' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 dark:text-gray-400'}`}
                        >
                          Team
                        </button>
                      </div>
                    </div>
                    {activeTab === 'profile' && (
                        <form onSubmit={handleProfileUpdate} className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow border border-gray-200 dark:border-gray-700">
                            <div className="p-4 sm:p-6 space-y-6">
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold">Avatars</h3>
                                    <div className="flex items-center space-x-6 pt-2">
                                        <div className="flex flex-col items-center text-center">
                                            <img className="h-20 w-20 rounded-full object-cover" src={profileData.avatar} alt="User Avatar" />
                                            <label className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">You</label>
                                        </div>
                                        <div className="flex flex-col items-center text-center">
                                            <img className="h-20 w-20 rounded-full object-cover" src={profileData.assistantAvatar} alt="Assistant Avatar" />
                                            <label className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Assistant</label>
                                        </div>
                                    </div>
                                    <div className="pt-2">
                                        <button type="button" onClick={() => setIsAvatarModalOpen(true)} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 font-bold py-2 px-4 rounded-lg text-sm">Change Avatars</button>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-6 border-t border-gray-200 dark:border-gray-700">
                                    <h3 className="text-lg font-bold">Personal Information</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                        <div><label htmlFor="name" className="text-sm font-bold">Name</label><input type="text" id="name" name="name" value={profileData.name} onChange={handleProfileDataChange} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md" /></div>
                                        <div><label htmlFor="nickname" className="text-sm font-bold">Nickname</label><input type="text" id="nickname" name="nickname" value={profileData.nickname} onChange={handleProfileDataChange} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md" /></div>
                                        <div><label htmlFor="mobileNumber" className="text-sm font-bold">Mobile Number</label><input type="tel" id="mobileNumber" name="mobileNumber" value={profileData.mobileNumber} onChange={handleProfileDataChange} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md" /></div>
                                        <div>
                                            <label htmlFor="companyId" className="text-sm font-bold">Company ID</label>
                                            <input type="text" id="companyId" name="companyId" value={profileData.companyId} onChange={handleProfileDataChange} placeholder="e.g., CRM00302" className={`w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md ${!isCompanyIdValid ? 'border-red-500' : ''}`} />
                                            {!isCompanyIdValid && <p className="mt-1 text-sm text-red-600">Company ID must start with 'CRM'.</p>}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2 pt-6 border-t border-gray-200 dark:border-gray-700">
                                    <h3 className="text-lg font-bold">Assistant Configuration</h3>
                                    <div className="pt-2">
                                        <label htmlFor="assistantName" className="text-sm font-bold">Assistant Name</label>
                                        <input type="text" id="assistantName" name="assistantName" value={profileData.assistantName} onChange={handleProfileDataChange} className="w-full p-2 bg-gray-100 dark:bg-gray-700 border rounded-md" />
                                        {isCheckingAssistantName && <p className="mt-1 text-sm text-gray-500">Checking...</p>}
                                        {assistantNameError && <p className={`mt-1 text-sm ${assistantNameError === 'This name is available!' ? 'text-green-600' : 'text-red-600'}`}>{assistantNameError}</p>}
                                    </div>
                                    <div className="pt-2">
                                        <label className="text-sm font-bold">Assistant Memory (Key Facts)</label>
                                        <p className="text-xs text-gray-500 mb-2">Add key facts for your assistant to remember, like your boss's name or your reporting preferences.</p>
                                        <AssistantMemoryEditor memory={profileData.assistantMemory} onMemoryChange={handleMemoryChange} />
                                    </div>
                                </div>
                            </div>
                            <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-700/50 text-right rounded-b-lg sm:rounded-b-xl space-y-2">
                                {profileError && <p className="text-sm text-red-600 dark:text-red-400 text-center">{profileError}</p>}
                                <button type="submit" className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400" disabled={isSaveDisabled}>Save Changes</button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'security' && (
                      <div className="space-y-6">
                        <PasswordChangeForm
                          userProfile={userProfile}
                          onSuccess={() => {
                            setSuccessModalInfo({
                              title: 'Password Changed',
                              message: 'Your password has been changed successfully.',
                            });
                            setShowSuccessModal(true);
                          }}
                        />
                        <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
                          <h3 className="text-lg font-bold mb-2">Two-Factor Authentication (2FA)</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Coming soon.</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
                          <h3 className="text-lg font-bold mb-4">Account & Integrations</h3>
                          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div>
                              <p className="text-sm font-bold">Account Email</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{safeUserProfile.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold">Google Account</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Status: <span className="font-semibold">{isGoogleConnected ? 'Connected' : 'Not Connected'}</span>
                              </p>
                            </div>
                            {isGoogleConnected ? (
                              <button onClick={() => setShowUnlinkConfirm(true)} disabled={isUnlinking} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg text-sm">
                                {isUnlinking ? 'Unlinking...' : 'Unlink'}
                              </button>
                            ) : (
                              <button onClick={handleGoogleConnect} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg text-sm">
                                Connect
                              </button>
                            )}
                          </div>
                          {integrationError && <p className="text-sm text-red-600 mt-2">{integrationError}</p>}
                        </div>
                      </div>
                    )}
                    {activeTab === 'team' && ( <div className="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-sm sm:shadow p-4 sm:p-6 border border-gray-200 dark:border-gray-700"><div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">Manage Your Team</h3>{!isAddingMember && <button onClick={() => setIsAddingMember(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded-lg text-sm">Add Member</button>}</div>{isAddingMember && (<div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-700/50 space-y-3 mb-4"><h4 className="font-semibold">New Team Member</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><input type="text" placeholder="Full Name" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded-md" /><input type="text" placeholder="Role / Position" value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded-md" /><input type="email" placeholder="Email Address" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-700 border rounded-md" /></div>{teamError && <p className="text-sm text-red-600">{teamError}</p>}<div className="flex justify-end space-x-2"><button onClick={handleCancelAddMember} className="bg-gray-200 hover:bg-gray-300 font-bold py-2 px-4 rounded-lg text-sm">Cancel</button><button onClick={handleAddTeamMember} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm">Add Member</button></div></div>)}<div className="space-y-3">{profileData.team.length > 0 ? profileData.team.map(member => (<div key={member.id} className="flex justify-between items-center p-3 border rounded-lg"><div><p className="font-semibold">{member.name} <span className="text-sm font-normal text-gray-500">- {member.role}</span></p><p className="text-sm text-gray-500">{member.email}</p></div><button onClick={() => setShowRemoveConfirm(member)} className="text-red-500 hover:text-red-700 text-sm font-semibold">Remove</button></div>)) : <p className="text-center text-gray-500 py-4">No team members added yet.</p>}</div></div> )}
                </div>
            </div></div></main>
            {showSuccessModal && <SuccessNotification title={successModalInfo.title} message={successModalInfo.message} onConfirm={() => setShowSuccessModal(false)} />}
            {showUnlinkConfirm && <ConfirmationModal title="Unlink Google Account?" message="This will disconnect from your Google Account. Are you sure?" onConfirm={confirmGoogleUnlink} onCancel={() => setShowUnlinkConfirm(false)} confirmText="Yes, Unlink" isDestructive />}
            {showRemoveConfirm && <ConfirmationModal title={`Remove ${showRemoveConfirm.name}?`} message="Are you sure you want to remove this team member?" onConfirm={handleConfirmRemove} onCancel={() => setShowRemoveConfirm(null)} confirmText="Yes, Remove" isDestructive />}
        </div>
    </div>
    </>
  );
}

export default AccountSettingsPage;
