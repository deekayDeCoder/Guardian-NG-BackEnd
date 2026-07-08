import express from 'express';
import fs from 'fs';
import path from 'path';
import url from 'url';
import dotenv from 'dotenv';
import { requestLogger, errorHandler } from './middleware/errorHandler.js';
import router from './router.js';

dotenv.config({path: "/.env"})

const app = express();
const PORT = process.env.PORT || 3000;

// High limits for payload to accommodate simulated base64 voice notes
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Mount request logging middleware
app.use(requestLogger);

// Simple CORS middleware for front-end clients
const allowedOrigins = String(process.env.APP_CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;

  if (!requestOrigin || allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Mount main API routes
app.use('/api/v1', router);

// Health endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Guardian NG backend is running' });
});

app.use(errorHandler);

app.listen(PORT, ()=> {
  console.log("Server Listening On Port", PORT)
})