
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import SuccessNotification from './SuccessNotification';

interface FeedbackModalProps {
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ onClose }) => {
  const [category, setCategory] = useState<'Suggestion' | 'Bug Report' | 'Other'>('Suggestion');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 400);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) {
      setError('Feedback cannot be empty.');
      return;
    }
    setIsSubmitting(true);
    setError('');

    const { error: insertError } = await supabase
      .from('feedback')
      .insert([
        { 
          category: category, 
          feedback_text: feedbackText.trim() 
        }
      ]);

    setIsSubmitting(false);

    if (insertError) {
      setError('Failed to submit feedback. Please try again.');
      console.error('Feedback submission error:', insertError);
    } else {
      setShowSuccess(true);
    }
  };

  const handleSuccessConfirm = () => {
    setShowSuccess(false);
    onClose();
  };
  
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (showSuccess) {
    return (
        <SuccessNotification 
            title="Feedback Sent!"
            message="Thank you for your valuable input. We've received your feedback."
            onConfirm={handleSuccessConfirm}
        />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster" onClick={handleBackdropClick}>
      <div className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} noValidate>
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Submit Feedback or Suggestion</h3>
          
          <div className="mb-4">
              <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
              >
                  <option>Suggestion</option>
                  <option>Bug Report</option>
                  <option>Other</option>
              </select>
          </div>

          <div>
              <label htmlFor="feedback-text" className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">Details</label>
              <textarea
                  id="feedback-text"
                  ref={textareaRef}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC143C]"
                  placeholder="Please be as detailed as possible..."
                  required
              />
          </div>
          
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

          <div className="flex justify-end space-x-4 mt-6">
            <button type="button" onClick={handleClose} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-bold py-2 px-4 rounded-lg transition-all duration-200 active:scale-95">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="bg-[#DC143C] hover:bg-[#b81030] text-white font-bold py-2 px-4 rounded-lg flex items-center disabled:bg-gray-400 transition-all duration-200 active:scale-95">
              {isSubmitting && <div className="custom-loader-sm"></div>}
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;
