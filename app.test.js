/**
 * Unit Tests for CultureRoam Application Logic
 * Framework: Jest
 */

const { StateManager, RateLimiter, Utils, TravelCache, AI, PollinationsAI, GroqAI } = require('./app');

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

  // Test Utils.getErrorMessage
  describe('Utils.getErrorMessage', () => {
    test('should return slow down message for RATE: errors', () => {
      const err = new Error('RATE:10');
      expect(Utils.getErrorMessage(err)).toContain('Slow down');
      expect(Utils.getErrorMessage(err)).toContain('10s');
    });

    test('should return timeout message for TIMEOUT error', () => {
      const err = new Error('TIMEOUT');
      expect(Utils.getErrorMessage(err)).toContain('timed out');
    });

    test('should return invalid key message for GROQ_AUTH error', () => {
      const err = new Error('GROQ_AUTH');
      expect(Utils.getErrorMessage(err)).toContain('invalid');
    });

    test('should return quota message for GROQ_QUOTA error', () => {
      const err = new Error('GROQ_QUOTA');
      expect(Utils.getErrorMessage(err)).toContain('quota');
    });

    test('should return busy message for ALL_FAILED error', () => {
      const err = new Error('ALL_FAILED');
      expect(Utils.getErrorMessage(err)).toContain('busy');
    });

    test('should return default message for generic errors', () => {
      const err = new Error('SOME_RANDOM_ERROR');
      expect(Utils.getErrorMessage(err)).toContain('went wrong');
    });
  });

  // Test DemoContent
  describe('DemoContent', () => {
    const { DemoContent } = require('./app');

    test('should return Indore-specific story for indore query', () => {
      const story = DemoContent.get('indore');
      expect(story).toContain('Indore');
      expect(story).toContain('Sarafa Bazaar');
    });

    test('should return default story for empty or unknown destination', () => {
      const story1 = DemoContent.get('delhi');
      const story2 = DemoContent.get('');
      expect(story1).toContain('Heartland');
      expect(story2).toContain('Heartland');
      expect(story1).toBe(story2);
    });
  });

  // Test TravelCache
  describe('TravelCache', () => {
    beforeEach(() => {
      TravelCache.clear();
    });

    test('should set and get values in memory correctly', () => {
      expect(TravelCache.get('test_prompt')).toBeNull();
      TravelCache.set('test_prompt', 'Cached Travel Story content');
      expect(TravelCache.get('test_prompt')).toBe('Cached Travel Story content');
    });

    test('should normalize prompt spaces when saving and loading', () => {
      TravelCache.set('  prompt_with_spaces  ', 'story');
      expect(TravelCache.get('prompt_with_spaces')).toBe('story');
    });

    test('should clear values correctly', () => {
      TravelCache.set('prompt', 'story');
      TravelCache.clear();
      expect(TravelCache.get('prompt')).toBeNull();
    });
  });

  // Test AI generate path mocking
  describe('AI generate flow', () => {
    test('should return cached value instantly if available', async () => {
      TravelCache.clear();
      TravelCache.set('Cached Query', 'Cached Story Result');
      
      const res = await AI.generate('Cached Query');
      expect(res).toBe('Cached Story Result');
    });

    test('should throw rate limit error if check fails', async () => {
      // Mock RateLimiter check to return limited state
      const originalCheck = RateLimiter.check;
      RateLimiter.check = () => ({ ok: false, wait: 12 });
      
      await expect(AI.generate('Some prompt')).rejects.toThrow('RATE:12');
      
      // Restore mock
      RateLimiter.check = originalCheck;
    });

    test('should fall back to demo content if AI throws error', async () => {
      const originalCheck = RateLimiter.check;
      RateLimiter.check = () => ({ ok: true }); // bypass rate limit

      // Temporarily mock Pollinations and Groq to throw errors
      const originalPollinations = PollinationsAI.generate;
      const originalGroq = GroqAI.generate;
      const originalHasGroqKey = StateManager.hasGroqKey;

      PollinationsAI.generate = jest.fn().mockRejectedValue(new Error('FAIL'));
      GroqAI.generate = jest.fn().mockRejectedValue(new Error('FAIL'));
      StateManager.hasGroqKey = () => false;

      StateManager.set('lastQuery', 'indore');
      const res = await AI.generate('Get Indore Info');

      expect(res).toContain('curated content');
      expect(res).toContain('Indore');

      // Restore mocks
      RateLimiter.check = originalCheck;
      PollinationsAI.generate = originalPollinations;
      GroqAI.generate = originalGroq;
      StateManager.hasGroqKey = originalHasGroqKey;
    });
  });
});
