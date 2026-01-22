import React, { useId } from 'react';
import { useTheme } from './ThemeContext';
import '../styles/theme-toggle.css';

interface ThemeToggleButtonProps {
    position?: 'fixed' | 'static';
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ position = 'fixed' }) => {
    const { theme, toggleTheme } = useTheme();
    const uniqueId = useId(); // Generate unique ID for this instance
    const checkboxId = `theme-toggle-checkbox-${uniqueId}`;

    const positionClasses = position === 'fixed' ? "fixed top-4 right-4" : "";

    const handleToggle = () => {
        console.log('🔄 Toggle triggered, current theme:', theme);
        toggleTheme();
    };

    return (
        <div 
            className={positionClasses}
            style={{ 
                zIndex: 99999,
                position: position === 'fixed' ? 'fixed' : 'static',
                top: position === 'fixed' ? '1rem' : undefined,
                right: position === 'fixed' ? '1rem' : undefined,
            }}
        >
            <label 
                className="switch" 
                htmlFor={checkboxId}
                style={{ 
                    cursor: 'pointer', 
                    userSelect: 'none',
                    display: 'block',
                    position: 'relative',
                    pointerEvents: 'auto',
                }}
            >
                <input 
                    id={checkboxId}
                    type="checkbox" 
                    checked={theme === 'dark'}
                    onChange={(e) => {
                        e.stopPropagation();
                        handleToggle();
                    }}
                    aria-label="Toggle theme"
                    style={{ 
                        cursor: 'pointer',
                        position: 'absolute', 
                        width: '100%', 
                        height: '100%', 
                        top: 0, 
                        left: 0, 
                        margin: 0, 
                        padding: 0,
                        opacity: 0,
                        zIndex: 10,
                        pointerEvents: 'auto',
                    }}
                />
                <span className="slider" style={{ pointerEvents: 'none' }}>
                    {/* Moon craters */}
                    <div className="moons-hole">
                        <div className="moon-hole"></div>
                        <div className="moon-hole"></div>
                        <div className="moon-hole"></div>
                    </div>
                    
                    {/* Stars for night mode */}
                    <div className="stars">
                        <svg className="star" viewBox="0 0 24 24">
                            <polygon points="12,2 15,10 24,10 17,15 20,23 12,18 4,23 7,15 0,10 9,10" />
                        </svg>
                        <svg className="star" viewBox="0 0 24 24">
                            <polygon points="12,2 15,10 24,10 17,15 20,23 12,18 4,23 7,15 0,10 9,10" />
                        </svg>
                        <svg className="star" viewBox="0 0 24 24">
                            <polygon points="12,2 15,10 24,10 17,15 20,23 12,18 4,23 7,15 0,10 9,10" />
                        </svg>
                        <svg className="star" viewBox="0 0 24 24">
                            <polygon points="12,2 15,10 24,10 17,15 20,23 12,18 4,23 7,15 0,10 9,10" />
                        </svg>
                        <svg className="star" viewBox="0 0 24 24">
                            <polygon points="12,2 15,10 24,10 17,15 20,23 12,18 4,23 7,15 0,10 9,10" />
                        </svg>
                    </div>
                    
                    {/* White clouds for day mode */}
                    <div className="clouds">
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                        <div className="cloud"></div>
                    </div>
                    
                    {/* Dark clouds for day mode background */}
                    <div className="black-clouds">
                        <div className="black-cloud"></div>
                        <div className="black-cloud"></div>
                        <div className="black-cloud"></div>
                    </div>
                </span>
            </label>
        </div>
    );
};

export default ThemeToggleButton;