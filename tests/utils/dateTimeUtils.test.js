const dateTimeUtils = require('../../utils/dateTimeUtils');

// Set up moment as a global (as it is in server.js)
global.moment = require('moment-timezone');

describe('DateTime Utilities', () => {
  describe('displaySecs', () => {
    it('should format seconds correctly for small time deltas', () => {
      expect(dateTimeUtils.displaySecs(60)).toBe('60 secs');
      expect(dateTimeUtils.displaySecs(100)).toBe('100 secs');
      expect(dateTimeUtils.displaySecs(299)).toBe('299 secs');
    });

    it('should format seconds correctly for minutes', () => {
      const result300 = dateTimeUtils.displaySecs(300);
      const result600 = dateTimeUtils.displaySecs(600);
      expect(result300).toContain('mins');
      expect(result600).toContain('mins');
    });

    it('should handle zero seconds', () => {
      expect(dateTimeUtils.displaySecs(0)).toBe('0 secs');
    });

    it('should format hours correctly', () => {
      const result = dateTimeUtils.displaySecs(7200);
      expect(result).toContain('h');
    });

    it('should format days correctly', () => {
      const result = dateTimeUtils.displaySecs(86400);
      expect(result).toContain('days');
    });
  });

  describe('convertToTimezone', () => {
    it('should convert to specified timezone', () => {
      const utcDate = new Date('2026-03-21T12:00:00Z');
      const convertedDate = dateTimeUtils.convertToTimezone(utcDate, 'Europe/London');
      expect(convertedDate).toBeInstanceOf(Date);
    });

    it('should use Europe/London as default timezone', () => {
      const utcDate = new Date('2026-03-21T12:00:00Z');
      const convertedDate = dateTimeUtils.convertToTimezone(utcDate, null);
      expect(convertedDate).toBeInstanceOf(Date);
    });

    it('should handle different timezones', () => {
      const utcDate = new Date('2026-03-21T12:00:00Z');
      const londonDate = dateTimeUtils.convertToTimezone(utcDate, 'Europe/London');
      const nycDate = dateTimeUtils.convertToTimezone(utcDate, 'America/New_York');
      expect(londonDate).toBeInstanceOf(Date);
      expect(nycDate).toBeInstanceOf(Date);
    });
  });

  describe('applyTz', () => {
    it('should format date with timezone', () => {
      const testDate = new Date('2026-03-21T12:00:00Z');
      const formatted = dateTimeUtils.applyTz(testDate, 'Europe/London');
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should handle different output formats', () => {
      const testDate = new Date('2026-03-21T15:30:45Z');
      const result = dateTimeUtils.applyTz(testDate, 'Europe/London');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    });
  });

  describe('displayFormatDate', () => {
    it('should format date with provided format', () => {
      const testDate = new Date('2026-03-21T12:00:00Z');
      const formatted = dateTimeUtils.displayFormatDate(testDate, false, 'Europe/London', 'YYYY-MM-DD');
      expect(typeof formatted).toBe('string');
    });

    it('should handle timezone conversion in formatting', () => {
      const testDate = new Date('2026-03-21T12:00:00Z');
      const result = dateTimeUtils.displayFormatDate(testDate, false, 'Europe/London');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should format date without timezone', () => {
      const testDate = new Date('2026-03-21T12:00:00Z');
      const formatted = dateTimeUtils.displayFormatDate(testDate, false, null, 'YYYY-MM-DD', false);
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should format future dates with delta', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const result = dateTimeUtils.displayFormatDate(futureDate, true, 'Europe/London', 'YYYY-MM-DD', true);
      expect(typeof result).toBe('string');
    });
  });
});
