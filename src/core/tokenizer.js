/**
 * Lexical tokenizer with Unicode multilingual support, stopword filtering, and normalization.
 *
 * Unicode Normalization & Script Behavior:
 * - Normalizes text to lowercase using Unicode-aware String.prototype.toLowerCase().
 * - Matches Unicode letters (\p{L}) and numbers (\p{N}) across all language scripts
 *   (e.g., Latin, Turkish, Cyrillic, Greek, CJK, Arabic, etc.), preserving underscores
 *   and hyphens for code identifiers and version strings.
 * - Non-alphanumeric punctuation and symbols are treated as token separators.
 * - Tokens consisting exclusively of hyphens or underscores (e.g. "-", "--", "___") are discarded.
 * - Standard English stopwords are filtered when removeStopWords is true.
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cant', 'cannot', 'could',
  'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt',
  'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes',
  'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is',
  'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most',
  'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should',
  'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they',
  'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed',
  'well', 'were', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres',
  'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont',
  'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours',
  'yourself', 'yourselves'
]);

/**
 * Tokenizes input string into normalized lexical tokens.
 * @param {string} text Input text
 * @param {boolean} [removeStopWords=true] Whether to filter common English stopwords
 * @returns {string[]} Array of normalized tokens
 */
function tokenize(text, removeStopWords = true) {
  if (!text || typeof text !== 'string') return [];
  
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !/^[-_]+$/.test(t));

  if (!removeStopWords) return tokens;
  return tokens.filter(t => !STOP_WORDS.has(t));
}

module.exports = { tokenize, STOP_WORDS };
