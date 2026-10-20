/**
 * India Mobile Normalization & Validation Helper
 *
 * Sanitizes and normalizes Indian mobile numbers to E.164 format (+919876543210).
 * Valid Indian mobile numbers are 10 digits starting with [6-9].
 */

export function normalizeIndiaMobile(input: string): string {
  if (!input) {
    throw new Error('Mobile number is required');
  }

  // Remove spaces, hyphens, parentheses, and dots
  let cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '');

  // Strip leading +91 or 91 or 0 if present
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Validate 10 digits starting with 6, 7, 8, or 9
  const indianMobileRegex = /^[6-9]\d{9}$/;
  if (!indianMobileRegex.test(cleaned)) {
    throw new Error(`Invalid Indian mobile number: ${input}. Must be a 10-digit number starting with 6, 7, 8, or 9.`);
  }

  return `+91${cleaned}`;
}

export function isValidIndiaMobile(input: string): boolean {
  try {
    normalizeIndiaMobile(input);
    return true;
  } catch {
    return false;
  }
}
