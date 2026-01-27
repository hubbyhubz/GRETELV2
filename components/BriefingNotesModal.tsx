import React from 'react';
import { createPortal } from 'react-dom';
import AppIcon from './AppIcon';

const XIcon = () => (<AppIcon name="close" className="h-6 w-6" />);

interface BriefingNotesModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const BriefingNotesModal: React.FC<BriefingNotesModalProps> = ({ isOpen, value, onChange, onClose }) => {
  const [isClosing, setIsClosing] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = Math.floor(window.innerHeight * 0.65);
    const minHeight = 220;
    el.style.height = 'auto';
    const nextHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => resizeTextarea());
  }, [isOpen, resizeTextarea]);

  React.useEffect(() => {
    if (!isOpen) return;
    resizeTextarea();
  }, [value, isOpen, resizeTextarea]);

  if (!isOpen) return null;

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return createPortal(
    <div
      className="fixed flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-notes-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
      }}
    >
      <div
        className={`w-full max-w-3xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          zIndex: 10000,
          maxHeight: '90vh',
        }}
      >
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="briefing-notes-modal-title" className="text-xl font-bold text-primary-600">Briefing Notes</h2>
          <button onClick={handleClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            <XIcon />
          </button>
        </div>

        <div className="pt-4 flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            className="w-full resize-none text-sm bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 p-4"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              resizeTextarea();
            }}
            placeholder="Your compiled briefing notes will appear here after preparation..."
          />
        </div>

        <div className="flex justify-end items-center pt-4 border-t border-gray-200 dark:border-gray-700 gap-2">
          <button
            onClick={handleClose}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
};

export default BriefingNotesModal;
