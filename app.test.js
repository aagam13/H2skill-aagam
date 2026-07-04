/**
 * Unit Tests for CultureRoam Application Logic
 * Framework: Jest
 */

const { StateManager, RateLimiter, Utils } = require('./app');

describe('CultureRoam Unit Tests', () => {

  // Test StateManager
  describe('StateManager', () => {
    beforeEach(() => {
      StateManager.clearGroqKey();
    });

    test('should return default values correctly', () => {
      expect(StateManager.get('activeZone')).toBe('sarafa');
      expect(StateManager.get('isInsightsOpen')).toBe(false);
      expect(StateManager.get('lastQuery')).toBeNull();
    });

    test('should set and get custom state variables', () => {
      StateManager.set('activeZone', 'chappan');
      expect(StateManager.get('activeZone')).toBe('chappan');

      StateManager.set('lastQuery', 'Indore');
      expect(StateManager.get('lastQuery')).toBe('Indore');
    });

    test('should check and set Groq key correctly', () => {
      expect(StateManager.hasGroqKey()).toBe(false); // Since beforeEach cleared the key

      StateManager.setGroqKey('gsk_testkey1234567890');
      expect(StateManager.get('groqKey')).toBe('gsk_testkey1234567890');
      expect(StateManager.hasGroqKey()).toBe(true);
    });

    test('should reject invalid or short Groq key', () => {
      const res = StateManager.setGroqKey('short');
      expect(res).toBe(false);
    });
  });

  // Test RateLimiter
  describe('RateLimiter', () => {
    test('should allow requests under the limit threshold', () => {
      // Config allows 8 requests in 15 seconds
      for (let i = 0; i < 5; i++) {
        const res = RateLimiter.check();
        expect(res.ok).toBe(true);
      }
    });
  });

  // Test Utils HTML Escaping
  describe('Utils.escapeHtml', () => {
    test('should escape special HTML tags and quotes correctly to prevent XSS', () => {
      const input = '<script>alert("xss")</script> & "hello"';
      const expected = '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;hello&quot;';
      expect(Utils.escapeHtml(input)).toBe(expected);
    });

    test('should handle plain strings with no HTML tags unchanged', () => {
      const input = 'Hello World 123';
      expect(Utils.escapeHtml(input)).toBe(input);
    });
  });

  // Test Utils AI Formatting
  describe('Utils.formatAIResponse', () => {
    test('should convert double asterisks to bold strong tags', () => {
      const input = 'This is a **bold** statement.';
      const result = Utils.formatAIResponse(input);
      expect(result).toContain('<strong>bold</strong>');
    });

    test('should convert single asterisks to italic em tags', () => {
      const input = 'This is an *italic* statement.';
      const result = Utils.formatAIResponse(input);
      expect(result).toContain('<em>italic</em>');
    });

    test('should split double newlines into paragraph tags', () => {
      const input = 'Paragraph One.\n\nParagraph Two.';
      const result = Utils.formatAIResponse(input);
      expect(result).toBe('<p>Paragraph One.</p><p>Paragraph Two.</p>');
    });

    test('should convert single newlines to br tags inside paragraphs', () => {
      const input = 'Line One.\nLine Two.';
      const result = Utils.formatAIResponse(input);
      expect(result).toBe('<p>Line One.<br>Line Two.</p>');
    });
  });
});
