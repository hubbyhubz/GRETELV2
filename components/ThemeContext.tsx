import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize theme from localStorage immediately
  const [theme, setTheme] = useState<Theme>(() => {
    // Check for saved theme in localStorage
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const initialTheme = savedTheme || 'light';
    
    // Apply theme to DOM immediately (before React renders)
    const root = window.document.documentElement;
    if (initialTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    return initialTheme;
  });

  // Update DOM whenever theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove all theme classes first to ensure clean state
    root.classList.remove('dark', 'light');
    
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      // Explicitly ensure dark is removed for light mode
      root.classList.remove('dark');
    }
    
    // Save the user's current preference to localStorage
    localStorage.setItem('theme', theme);
    
    // Force Tailwind CDN to recognize the change
    // Trigger a small DOM mutation to force re-evaluation
    const observer = new MutationObserver(() => {
      // Tailwind CDN should pick up the change
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    
    // Log for debugging
    console.log('🎨 useEffect - Theme set to:', theme, '| HTML classes:', root.className);
    
    return () => observer.disconnect();
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      console.log('🎨 Theme toggling:', prevTheme, '→', newTheme);
      
      // Immediately update DOM for instant feedback (synchronous)
      const root = window.document.documentElement;
      
      // Remove all theme classes first
      root.classList.remove('dark', 'light');
      
      if (newTheme === 'dark') {
        root.classList.add('dark');
        console.log('✅ Added "dark" class to <html>. Current classes:', root.className);
      } else {
        // Ensure dark is removed
        root.classList.remove('dark');
        console.log('✅ Removed "dark" class from <html>. Current classes:', root.className);
      }
      
      // Force a reflow to ensure styles are recalculated
      void root.offsetHeight;
      
      // Save immediately
      localStorage.setItem('theme', newTheme);
      console.log('✅ Theme updated in DOM and localStorage');
      
      // The MutationObserver in index.html will detect the class change
      // and call forceTailwindRecompile() automatically
      
      // Also manually trigger it as a backup
      if (typeof window !== 'undefined' && (window as any).forceTailwindRecompile) {
        setTimeout(() => {
          (window as any).forceTailwindRecompile();
        }, 50);
      }
      
      // Verify the class is actually on the element
      setTimeout(() => {
        const hasDark = root.classList.contains('dark');
        console.log('🔍 Verification - <html> has "dark" class:', hasDark, '| Expected:', newTheme === 'dark');
        if (hasDark !== (newTheme === 'dark')) {
          console.error('❌ MISMATCH! Class state does not match theme state!');
        }
      }, 100);
      
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};