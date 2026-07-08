import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { requestLogger, errorHandler } from './middleware/errorHandler.js';
import router from './router.js';

// Load environment variables
dotenv.config({path: "./.env.example"});

const app = express();
const PORT = process.env.PORT || 3000;

// High limits for payload to accommodate simulated base64 voice notes
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Mount request logging middleware
app.use(requestLogger);

// Mount main API routes
app.use('/api/v1', router);

// --- VITE MIDDLEWARE OR STATIC ASSET STREAM ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Mount Vite Dev Server middleware in development pointing to client-side files
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: "client", // set project root to client directory
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend build files in production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler (must be after all other routes and middleware)
  app.use(errorHandler);

  app.listen(PORT, () => {
    console.log(`Guardian-NG Engine securely listening on port ${PORT}`);
  });
}

startServer();
