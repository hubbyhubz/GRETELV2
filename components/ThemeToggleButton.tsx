import React from 'react';
import { useTheme } from './ThemeContext';
import '../styles/theme-toggle.css';

interface ThemeToggleButtonProps {
    position?: 'fixed' | 'static';
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ position = 'fixed' }) => {
    const { theme, toggleTheme } = useTheme();

    const positionClasses = position === 'fixed' ? "fixed top-4 right-4 z-50" : "";

    return (
        <div className={positionClasses}>
            <label className="switch">
                <input 
                    type="checkbox" 
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                    aria-label="Toggle theme"
                />
                <span className="slider">
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