import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for merging tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AIMessageProps {
  children: string;
  className?: string;
  actions?: React.ReactNode;
}

export function AIMessage({ children, className, actions }: AIMessageProps) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-100 rounded-xl p-6 shadow-sm text-sm leading-relaxed text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Override bold to look like a highlighter
          strong: ({ node, ...props }) => (
            <span
              className="font-semibold text-gray-900 bg-gray-50 px-1 rounded dark:text-gray-100 dark:bg-gray-700"
              {...props}
            />
          ),
          // Relaxed typography for paragraphs
          // If paragraph contains a code block (pre), render as div to avoid hydration error
          p: ({ node, children, ...props }: any) => {
            // Check the AST node structure - if paragraph contains only a non-inline code block, render as div
            const hasNonInlineCode = node?.children?.some((child: any) => 
              child.type === 'code' && !child.data?.meta && !child.properties?.inline
            );
            
            // Also check rendered children for pre elements
            const hasPreElement = React.Children.toArray(children).some(
              (child: any) => React.isValidElement(child) && child.type === 'pre'
            );
            
            if (hasNonInlineCode || hasPreElement) {
              return <div className="mb-4 last:mb-0 leading-relaxed" {...props}>{children}</div>;
            }
            
            return <p className="mb-4 last:mb-0 leading-relaxed" {...props}>{children}</p>;
          },
          // Proper list spacing
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 space-y-2 mb-4" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 space-y-2 mb-4" {...props} />
          ),
          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
          // Style headers
          h1: ({ node, ...props }) => (
            <h1 className="text-xl font-bold mb-4 mt-6 first:mt-0" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-lg font-bold mb-3 mt-5 first:mt-0" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-base font-bold mb-2 mt-4 first:mt-0" {...props} />
          ),
          // Code blocks - use pre component directly to avoid p wrapping
          pre: ({ node, children, ...props }: any) => {
            return (
              <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto mb-4" {...props}>
                {children}
              </pre>
            );
          },
          code: ({ node, inline, className, children, ...props }: any) => {
            return inline ? (
              <code
                className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className="text-xs font-mono block" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
      {actions && <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">{actions}</div>}
    </div>
  );
}
