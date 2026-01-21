import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const createDevChatProxy = (env: Record<string, string>) => {
  return {
    name: 'dev-chat-proxy',
    configureServer(server: any) {
      server.middlewares.use('/api/chat', async (req: any, res: any) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const openAiApiKey = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || env.VITE_API_KEY;
        if (!openAiApiKey) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Missing OPENAI_API_KEY for local dev server.' }));
          return;
        }

        let body = '';
        req.setEncoding?.('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 200_000) {
            res.statusCode = 413;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Request too large' }));
            req.destroy?.();
          }
        });

        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const model = parsed.model || env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || 'gpt-4o';

            const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${openAiApiKey}`,
              },
              body: JSON.stringify({
                model,
                messages: parsed.messages,
                response_format: { type: 'json_object' },
                max_tokens: parsed.max_tokens ?? 2000,
                temperature: parsed.temperature ?? 0.7,
              }),
            });

            const text = await upstream.text();
            if (!upstream.ok) {
              let message = text || 'Upstream error';
              try {
                const parsedError = JSON.parse(text);
                const maybeMessage = parsedError?.error?.message;
                if (typeof maybeMessage === 'string' && maybeMessage.trim()) message = maybeMessage.trim();
              } catch {
              }
              res.statusCode = upstream.status;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: message, status: upstream.status }));
              return;
            }

            const data = JSON.parse(text);
            const responseText = data?.choices?.[0]?.message?.content ?? '';
            const jsonMatch = typeof responseText === 'string' ? responseText.match(/```json\s*([\s\S]*?)\s*```/) : null;
            const jsonString = (jsonMatch?.[1] ?? responseText).trim();
            const out = jsonString ? JSON.parse(jsonString) : { text: "I'm sorry, I couldn't process that request." };

            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(out));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e?.message || 'Unexpected server error' }));
          }
        });
      });
    },
  };
};

// https://vitejs.dev/config/
export default ({ mode }) => {
  // Load all environment variables from the current working directory.
  // The third argument '' ensures all variables are loaded, not just those with VITE_ prefix.
  // FIX: Replaced process.cwd() with '.' to avoid TypeScript type errors in environments where node types are not loaded.
  const env = loadEnv(mode, '.', '');

  return defineConfig({
    plugins: [react(), createDevChatProxy(env)],
    // Explicitly configure PostCSS with no plugins to prevent Vite from
    // auto-detecting and incorrectly trying to run Tailwind as a plugin.
    css: {
      postcss: {}
    },
    test: {
      environment: 'jsdom',
      restoreMocks: true
    }
  });
};
