/**
 * Centralized Error Handler Utilities
 * Provides standardized error handling and logging across the application
 */

/**
 * Custom error class for application-specific errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for input validation failures
 */
class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Authentication error for auth failures
 */
class AuthError extends AppError {
  constructor(message) {
    super(message, 401, 'AUTH_ERROR');
  }
}

/**
 * Authorization error for permission denials
 */
class ForbiddenError extends AppError {
  constructor(message) {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Not found error for missing resources
 */
class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Database error for database operations
 */
class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

/**
 * Handle and log errors consistently
 * @param {Error} error - The error to handle
 * @param {string} context - Context where error occurred
 * @param {object} metadata - Additional metadata
 * @returns {object} Standardized error object
 */
function handleError(error, context = 'Unknown', metadata = {}) {
  const errorResponse = {
    code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'An unexpected error occurred',
    statusCode: error.statusCode || 500,
    context,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  // Log the error
  const logLevel = errorResponse.statusCode >= 500 ? 'error' : 'warn';
  const logMessage = `[${context}] ${error.message}`;
  
  if (logger) {
    logger[logLevel](logMessage, {
      code: errorResponse.code,
      statusCode: errorResponse.statusCode,
      stack: error.stack,
      ...metadata
    });
  } else {
    console.error(logMessage, { ...errorResponse, stack: error.stack });
  }

  return errorResponse;
}

/**
 * Safe async execution that captures and logs errors
 * @param {Function} asyncFn - Async function to execute
 * @param {string} context - Context for error logging
 * @returns {Promise} Result or throws error
 */
async function safeAsyncExecute(asyncFn, context = 'AsyncExecution') {
  try {
    return await asyncFn();
  } catch (error) {
    const errorObj = error instanceof AppError ? error : new AppError(error.message, 500);
    handleError(errorObj, context);
    throw errorObj;
  }
}

/**
 * Express error handling middleware
 * Should be registered as the last middleware in Express app
 */
function errorHandlerMiddleware(err, req, res, next) {
  const errorResponse = handleError(
    err,
    `${req.method} ${req.path}`,
    { userId: req.session?.userId, ip: req.ip }
  );

  const statusCode = errorResponse.statusCode || 500;

  // Don't expose stack traces in production
  if (process.env.NODE_ENV === 'production') {
    delete errorResponse.stack;
  } else {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Async wrapper for Express route handlers
 * Catches errors and passes them to error handling middleware
 * @param {Function} fn - Express route handler
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validation error handler for common validation errors
 * @param {Array<string>} errors - Array of validation error messages
 * @returns {ValidationError}
 */
function createValidationError(errors) {
  const message = Array.isArray(errors) 
    ? errors.join('; ')
    : errors;
  return new ValidationError(message, { errors: Array.isArray(errors) ? errors : [errors] });
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  DatabaseError,
  handleError,
  safeAsyncExecute,
  errorHandlerMiddleware,
  asyncHandler,
  createValidationError
};
