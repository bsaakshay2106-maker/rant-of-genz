// src/middleware/phoneFilter.js

/**
 * Strips any phone numbers from text before publishing.
 * Covers Indian (10-digit), international (+91...), and common patterns.
 */
const PHONE_PATTERNS = [
  // International format: +91-XXXXX-XXXXX or +1 (XXX) XXX-XXXX
  /(\+?\d{1,3}[\s\-.]?)?\(?\d{3,5}\)?[\s\-.]?\d{3,5}[\s\-.]?\d{4,6}/g,
  // Pure 10-digit numbers (Indian mobile)
  /\b[6-9]\d{9}\b/g,
  // Numbers written with spaces/dashes like 98765 43210
  /\b\d{5}[\s\-]\d{5}\b/g,
  // Numbers disguised with words: "nine eight seven..."  — handled below
  // WhatsApp/telegram style @numbers
  /@\d{7,15}/g,
];

// Word-to-digit number obfuscation patterns
const WORD_NUMBER_PATTERN = /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi;

function stripPhoneNumbers(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;

  // Apply all regex patterns
  for (const pattern of PHONE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[📵 no numbers]');
  }

  // Count word-numbers - if 8+ in sequence, replace
  // Simple heuristic: replace sequences of 8+ digit words
  const words = cleaned.split(/\s+/);
  let digitWordCount = 0;
  let result = [];

  for (const word of words) {
    if (WORD_NUMBER_PATTERN.test(word)) {
      WORD_NUMBER_PATTERN.lastIndex = 0;
      digitWordCount++;
      result.push(word);
      if (digitWordCount >= 8) {
        // Replace the last 8+ digit words
        const start = result.length - digitWordCount;
        result.splice(start, digitWordCount, '[📵 no numbers]');
        digitWordCount = 0;
      }
    } else {
      WORD_NUMBER_PATTERN.lastIndex = 0;
      digitWordCount = 0;
      result.push(word);
    }
  }
  cleaned = result.join(' ');

  return cleaned;
}

function phoneFilterMiddleware(req, res, next) {
  if (req.body) {
    if (req.body.content) {
      req.body.content = stripPhoneNumbers(req.body.content);
    }
  }
  next();
}

module.exports = { phoneFilterMiddleware, stripPhoneNumbers };
