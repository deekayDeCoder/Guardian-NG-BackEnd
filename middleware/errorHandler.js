/**
 * Global Error Handling Middleware for express API routes.
 */
export const errorHandler = (err, req, res, next) => {
  console.error("Unhandled server error:", err);
  
  const status = err.status || 500;
  const message = err.message || "An internal server error occurred.";
  
  res.status(status).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
};

/**
 * Simple Request Logger middleware to log API requests for better debugging.
 */
export const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
};
