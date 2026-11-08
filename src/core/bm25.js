/**
 * Okapi BM25 Indexing and Scoring Engine.
 * Conforms to TREC standards (Robertson et al.).
 */

const { tokenize } = require('./tokenizer');

class BM25Index {
  /**
   * @param {Object} [options]
   * @param {number} [options.k1=1.5] Term frequency saturation parameter
   * @param {number} [options.b=0.75] Document length normalization parameter
   */
  constructor({ k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.documents = [];
    this.docLengths = [];
    this.avgDocLength = 0;
    this.docFreqs = new Map(); // term -> count of docs containing term
    this.termFreqs = [];       // docIndex -> Map(term -> freq)
    this.idfCache = new Map();
  }

  /**
   * Builds the inverted index over an array of document chunks.
   * @param {Array<{id: string, text: string, metadata?: Object}>} docs
   */
  buildIndex(docs = []) {
    this.documents = Array.isArray(docs) ? docs : [];
    const N = this.documents.length;
    let totalLength = 0;
    this.docLengths = new Array(N);
    this.termFreqs = new Array(N);
    this.docFreqs.clear();
    this.idfCache.clear();

    for (let i = 0; i < N; i++) {
      const tokens = tokenize(this.documents[i]?.text || '');
      const len = tokens.length;
      this.docLengths[i] = len;
      totalLength += len;

      const tfMap = new Map();
      const uniqueTerms = new Set(tokens);

      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }
      this.termFreqs[i] = tfMap;

      for (const term of uniqueTerms) {
        this.docFreqs.set(term, (this.docFreqs.get(term) || 0) + 1);
      }
    }

    this.avgDocLength = N > 0 ? totalLength / N : 0;

    // Precalculate Robertson-Spärck Jones IDF
    for (const [term, n_q] of this.docFreqs.entries()) {
      // Smoothing: ln(1 + (N - n_q + 0.5) / (n_q + 0.5))
      const idf = Math.log(1 + (N - n_q + 0.5) / (n_q + 0.5));
      this.idfCache.set(term, Math.max(idf, 0.0001));
    }
  }

  /**
   * Scores all documents against a query string.
   * Deterministic sorting breaks ties by document ID.
   * @param {string} query
   * @param {number} [topK=10]
   * @returns {Array<{id: string, score: number, doc: Object}>} Ranked results
   */
  search(query, topK = 10) {
    if (!Number.isInteger(topK) || topK <= 0) {
      return [];
    }
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.documents.length === 0) {
      return [];
    }

    const scores = new Array(this.documents.length).fill(0);
    const avgDl = this.avgDocLength || 1;

    for (const token of queryTokens) {
      const idf = this.idfCache.get(token);
      if (!idf) continue;

      for (let i = 0; i < this.documents.length; i++) {
        const tf = this.termFreqs[i].get(token) || 0;
        if (tf === 0) continue;

        const docLen = this.docLengths[i];
        const num = tf * (this.k1 + 1);
        const denom = tf + this.k1 * (1 - this.b + this.b * (docLen / avgDl));
        scores[i] += idf * (num / denom);
      }
    }

    const results = [];
    for (let i = 0; i < this.documents.length; i++) {
      if (scores[i] > 0) {
        results.push({
          id: this.documents[i].id,
          score: scores[i],
          doc: this.documents[i]
        });
      }
    }

    // Deterministic sort: descending score, with ID tie-breaker
    results.sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) > 1e-9) {
        return diff;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    return results.slice(0, topK);
  }
}

module.exports = { BM25Index };
