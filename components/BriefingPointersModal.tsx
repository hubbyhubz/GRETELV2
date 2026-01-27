
import React from 'react';
import { createPortal } from 'react-dom';
import AppIcon from './AppIcon';
// FIX: Update import path from '../App' to './types' to resolve module export errors.
import type { BriefingInputItem } from './types';

// Icons
const XIcon = () => ( <AppIcon name="close" className="h-6 w-6" /> );
const TrashIcon = () => ( <AppIcon name="trash" className="h-5 w-5 mr-2" /> );


interface BriefingPointersModalProps {
  isOpen: boolean;
  onClose: () => void;
  pointers: BriefingInputItem[];
  onClear: () => void;
}

const BriefingPointersModal: React.FC<BriefingPointersModalProps> = ({ isOpen, onClose, pointers, onClear }) => {
    const [isClosing, setIsClosing] = React.useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 400);
    };

    React.useEffect(() => {
        if (!isOpen) return; // Guard inside the effect
        
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]); // Add isOpen as dependency

    if (!isOpen) return null; // Early return AFTER all hooks

    // Get modal root element
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    // Render modal using Portal
    return createPortal(
        <div 
            className="fixed flex items-center justify-center p-4 animate__animated animate__fadeIn animate__faster" 
            onClick={handleClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="briefing-pointers-title"
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
                className={`w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700 animate__animated ${isClosing ? 'animate__bounceOut' : 'animate__bounceIn'}`} 
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'relative',
                    zIndex: 10000,
                }}
            >
                <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 id="briefing-pointers-title" className="text-xl font-bold text-primary-600">Briefing Pointers</h2>
                    <button onClick={handleClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"><XIcon /></button>
                </div>

                <div className="py-6 max-h-[60vh] overflow-y-auto pr-2 space-y-3">
                    {pointers.length > 0 ? (
                        pointers.map(item => (
                            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{item.type}</p>
                                <p className="text-gray-600 dark:text-gray-400">{item.text}</p>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-8">No pointers logged. Use Quick Actions to add items for your next briefing.</p>
                    )}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClear}
                        disabled={pointers.length === 0}
                        className="flex items-center text-sm font-semibold text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        <TrashIcon />
                        Clear All Pointers
                    </button>
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

export default BriefingPointersModal;
