import { createApp } from './app.js';

// Cloudflare Workers entrypoint.
// Static files are served by Cloudflare Assets, while API routes run here.
export default createApp();

