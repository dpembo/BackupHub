const { AppError, asyncHandler } = require('../../utils/errorHandler');

describe('Error Handler Utilities', () => {
  describe('AppError', () => {
    it('should create an AppError with message and status', () => {
      const error = new AppError('Test error', 400);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
    });

    it('should have a default status code of 500', () => {
      const error = new AppError('Test error');
      expect(error.statusCode).toBe(500);
    });

    it('should preserve error stack trace', () => {
      const error = new AppError('Test error', 400);
      expect(error.stack).toBeDefined();
    });
  });

  describe('asyncHandler', () => {
    it('should wrap an async function successfully', async () => {
      const mockHandler = jest.fn(async (req, res) => {
        res.json({ success: true });
      });

      const wrapped = asyncHandler(mockHandler);
      const mockNext = jest.fn();
      const req = {};
      const res = {
        json: jest.fn(),
      };

      await wrapped(req, res, mockNext);
      expect(mockHandler).toHaveBeenCalledWith(req, res, mockNext);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should catch async errors and pass to next middleware', async () => {
      const testError = new Error('Async error');
      const mockHandler = jest.fn(async () => {
        throw testError;
      });

      const wrapped = asyncHandler(mockHandler);
      const next = jest.fn();
      const req = {};
      const res = {};

      await wrapped(req, res, next);
      expect(next).toHaveBeenCalledWith(testError);
    });

    it('should pass AppError through to next middleware', async () => {
      const appError = new AppError('Bad request', 400);
      const mockHandler = jest.fn(async () => {
        throw appError;
      });

      const wrapped = asyncHandler(mockHandler);
      const next = jest.fn();
      const req = {};
      const res = {};

      await wrapped(req, res, next);
      expect(next).toHaveBeenCalledWith(appError);
    });
  });
});
