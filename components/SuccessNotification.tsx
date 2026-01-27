
import React, { useEffect, useState } from 'react';
import AppIcon from './AppIcon';

interface SuccessNotificationProps {
  title: string;
  message: string;
  onConfirm: () => void;
}

const SuccessNotification: React.FC<SuccessNotificationProps> = ({ title, message, onConfirm }) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onConfirm();
    }, 400);
  };

  // Handle Escape key to close the modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
      aria-describedby="success-message"
    >
      <div className={`w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'} text-center`}>
        <div className="mb-4">
          <AppIcon name="check" className="h-16 w-16 mx-auto" />
        </div>
        <h2 id="success-title" className="text-xl font-bold text-primary-600 mb-2">
          {title}
        </h2>
        <p id="success-message" className="text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>
        <button
          onClick={handleClose}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-600"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default SuccessNotification;
