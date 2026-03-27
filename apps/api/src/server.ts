import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 8787);
const app = createApp();

// Local Node runtime serves the web UI from the workspace.
app.get('/', serveStatic({ path: './apps/web/index.html' }));
app.use('/assets/*', serveStatic({ root: './apps/web' }));

serve({
  fetch: app.fetch,
  port,
});

console.log(`Sambao API listening on http://localhost:${port}`);
