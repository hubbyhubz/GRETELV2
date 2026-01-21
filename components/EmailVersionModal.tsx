import React, { useState, useEffect } from 'react';
import AppIcon from './AppIcon';

interface EmailVersionModalProps {
  isOpen: boolean;
  emailContent: string;
  onClose: () => void;
}

const EmailVersionModal: React.FC<EmailVersionModalProps> = ({ isOpen, emailContent, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(emailContent).then(() => {
      setCopied(true);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([emailContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-report-email-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster"
      onClick={handleBackdropClick}
    >
      <div className={`w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
          <div>
            <h2 className="text-xl font-bold text-[#DC143C]">Email Version</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ready to send</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyToClipboard}
              className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/20 text-gray-800 dark:text-gray-200 text-sm font-semibold flex items-center gap-2"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <AppIcon name="check" className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <AppIcon name="copy" className="h-4 w-4" /> Copy
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-red-100 dark:bg-gray-700 dark:hover:bg-red-900/20 text-gray-800 dark:text-gray-200 text-sm font-semibold flex items-center gap-2"
              title="Download as text file"
            >
              <AppIcon name="download" className="h-4 w-4" /> Download
            </button>
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
              {emailContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVersionModal;
