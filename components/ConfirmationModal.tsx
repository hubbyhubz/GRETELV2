
import React, { useEffect, useState } from 'react';

interface ConfirmationModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}) => {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = (callback: () => void) => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      callback();
    }, 400);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose(onCancel);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose(onCancel);
    }
  };

  const confirmButtonClasses = isDestructive
    ? "bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active-press"
    : "bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active-press";

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      style={{ zIndex: 100 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      onClick={handleBackdropClick}
    >
      <div
        className={`w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirmation-title" className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
          {title}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {message}
        </p>
        <div className="flex justify-end space-x-4">
          <button
            onClick={() => handleClose(onCancel)}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active-press"
          >
            {cancelText}
          </button>
          <button
            onClick={() => handleClose(onConfirm)}
            className={confirmButtonClasses}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
