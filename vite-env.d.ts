/// <reference types="vite/client" />
/// <reference types="vitest" />

// FIX: Replaced `declare var process` with a namespace augmentation for `NodeJS.ProcessEnv`.
// This resolves the "Cannot redeclare block-scoped variable 'process'" error, which
// occurs when another declaration for `process` (usually from @types/node) exists.
// By augmenting the existing type, we avoid the conflict while still providing
// the necessary type information for `process.env.API_KEY`.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
