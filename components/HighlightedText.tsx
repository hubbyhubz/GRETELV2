import React from 'react';

interface HighlightedTextProps {
  text: string;
  highlight?: string;
}

/**
 * Reusable component to highlight search terms within text.
 * Uses regex split method to wrap matching phrases in a highlighted span.
 */
const HighlightedText: React.FC<HighlightedTextProps> = ({ text, highlight }) => {
  // If no highlight term, return plain text
  if (!highlight || !highlight.trim()) {
    return <>{text}</>;
  }

  try {
    // Escape special regex characters in the highlight term
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedHighlight = escapeRegex(highlight.trim());
    
    // Create regex pattern (case-insensitive, global)
    const regex = new RegExp(`(${escapedHighlight})`, 'gi');
    
    // Split text by the regex pattern
    const parts = text.split(regex);
    
    // Map through parts and wrap matches in highlighted span
    return (
      <>
        {parts.map((part, index) => {
          // Check if this part matches the highlight term (case-insensitive)
          if (part.toLowerCase() === highlight.toLowerCase()) {
            return (
              <span key={index} className="highlight-crimson">
                {part}
              </span>
            );
          }
          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </>
    );
  } catch (error) {
    // If regex fails, return plain text
    console.error('HighlightedText regex error:', error);
    return <>{text}</>;
  }
};

export default HighlightedText;
