import React, { useEffect, useState } from 'react';

interface QuickActionModalProps {
  isOpen: boolean;
  title: string;
  prefill?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  title,
  prefill = '',
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(prefill);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setValue(prefill);
  }, [prefill]);

  const handleClose = (callback: () => void) => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      callback();
    }, 400);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose(onCancel);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={() => handleClose(onCancel)}
    >
      <div
        className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">{title}</h3>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={5}
          className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
          placeholder="Type here..."
        />
        <div className="flex justify-end space-x-3 mt-4">
          <button
            type="button"
            onClick={() => handleClose(onCancel)}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleClose(() => onConfirm(value.trim()))}
            disabled={!value.trim()}
            className="bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2 px-4 rounded-lg disabled:bg-gray-400 transition-all duration-200 active:scale-95"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickActionModal;
