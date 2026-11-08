/**
 * Deterministic Token/Bigram Feature-Vector Index.
 * Computes Cosine Similarity over 128-dimensional hashed feature representations.
 *
 * NOTE: This is a lightweight, deterministic feature-hashing implementation,
 * not a neural or dense embedding model (e.g., BERT, text-embedding-ada-002).
 * It provides zero-dependency fast lexical-feature retrieval for code and documentation.
 */

class FeatureVectorIndex {
  /**
   * @param {Object} [options]
   * @param {number} [options.dimensions=128] Dimensionality of the hashed feature vector
   */
  constructor({ dimensions = 128 } = {}) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new RangeError('dimensions must be a positive integer');
    }
    this.dimensions = dimensions;
    this.vectors = []; // Array<{id: string, embedding: Float32Array, doc: Object}>
  }

  /**
   * Computes Dot Product between two vectors.
   * Enforces dimension matching policy; throws RangeError on mismatch.
   * @param {number[]|Float32Array|Float64Array} a
   * @param {number[]|Float32Array|Float64Array} b
   * @returns {number}
   */
  static dotProduct(a, b) {
    if (!a || !b) {
      throw new TypeError('Vectors must be non-null and defined');
    }
    if (a.length !== b.length) {
      throw new RangeError(`Vector dimension mismatch: vector A has length ${a.length}, vector B has length ${b.length}`);
    }
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Computes L2 Norm (Euclidean length) of a vector.
   * @param {number[]|Float32Array|Float64Array} vec
   * @returns {number}
   */
  static norm(vec) {
    if (!vec) return 0;
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }

  /**
   * Computes Cosine Similarity between vector a and vector b.
   * Safely returns 0 when either vector is a zero-vector.
   * Output clamped to [-1, 1].
   * @param {number[]|Float32Array|Float64Array} a
   * @param {number[]|Float32Array|Float64Array} b
   * @returns {number} Value in range [-1, 1]
   */
  static cosineSimilarity(a, b) {
    const dot = FeatureVectorIndex.dotProduct(a, b);
    const normA = FeatureVectorIndex.norm(a);
    const normB = FeatureVectorIndex.norm(b);
    if (normA === 0 || normB === 0) {
      return 0;
    }
    const sim = dot / (normA * normB);
    return Math.max(-1, Math.min(1, sim));
  }

  /**
   * High-dimensional deterministic feature mapping via DJB2 token and bigram hashing.
   * @param {string} text
   * @param {number} [dimensions]
   * @returns {number[]} Normalized dense array
   */
  generateFeatureVector(text, dimensions = this.dimensions) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new RangeError('dimensions must be a positive integer');
    }
    const result = new Array(dimensions).fill(0);
    if (!text || typeof text !== 'string') {
      return result;
    }

    const clean = text.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, ' ');
    const words = clean.split(/\s+/).filter(w => w.length > 0 && !/^[-_]+$/.test(w));
    if (words.length === 0) {
      return result;
    }

    const vec = new Float64Array(dimensions);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 5381;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) + hash) + word.charCodeAt(j);
      }
      const idx = Math.abs(hash) % dimensions;
      const weight = 1.0 / Math.log(i + 2);
      vec[idx] += weight;

      // Bigram feature
      if (i > 0) {
        const bigram = words[i - 1] + '_' + word;
        let bHash = 5381;
        for (let j = 0; j < bigram.length; j++) {
          bHash = ((bHash << 5) + bHash) + bigram.charCodeAt(j);
        }
        const bIdx = Math.abs(bHash) % dimensions;
        vec[bIdx] += 1.5 * weight;
      }
    }

    // Normalize to unit length
    const norm = FeatureVectorIndex.norm(vec);
    if (norm === 0) {
      return result;
    }
    for (let i = 0; i < dimensions; i++) {
      result[i] = vec[i] / norm;
    }
    return result;
  }

  /**
   * Backwards-compatibility alias for generateFeatureVector.
   * Note: This method generates deterministic token/bigram feature vectors, not neural semantic embeddings.
   * @deprecated Use generateFeatureVector instead.
   */
  generateSemanticEmbedding(text, dimensions = this.dimensions) {
    return this.generateFeatureVector(text, dimensions);
  }

  /**
   * Builds feature vectors for documents.
   * @param {Array<{id: string, text: string, metadata?: Object, embedding?: number[]|Float32Array|Float64Array}>} docs
   */
  buildIndex(docs = []) {
    this.vectors = [];
    if (!Array.isArray(docs)) return;

    for (const doc of docs) {
      let emb = doc.embedding;
      if (!emb) {
        emb = this.generateFeatureVector(doc.text, this.dimensions);
      } else {
        if (!Array.isArray(emb) && !(emb instanceof Float32Array) && !(emb instanceof Float64Array)) {
          throw new TypeError(`Embedding for doc "${doc.id}" must be an array or typed array of numbers`);
        }
        if (emb.length !== this.dimensions) {
          throw new RangeError(`Embedding dimension mismatch for doc "${doc.id}": expected ${this.dimensions}, got ${emb.length}`);
        }
      }
      this.vectors.push({
        id: doc.id,
        embedding: new Float32Array(emb),
        doc: doc
      });
    }
  }

  /**
   * Searches the index against a query string or numeric feature vector.
   * @param {string|number[]|Float32Array|Float64Array} query
   * @param {number} [topK=10]
   * @returns {Array<{id: string, score: number, doc: Object}>}
   */
  search(query, topK = 10) {
    if (this.vectors.length === 0) return [];
    if (!Number.isInteger(topK) || topK <= 0) {
      throw new RangeError('topK must be a positive integer');
    }

    let queryEmb;
    if (typeof query === 'string') {
      const vec = this.generateFeatureVector(query, this.dimensions);
      if (FeatureVectorIndex.norm(vec) === 0) {
        return [];
      }
      queryEmb = new Float32Array(vec);
    } else if (Array.isArray(query) || query instanceof Float32Array || query instanceof Float64Array) {
      if (query.length !== this.dimensions) {
        throw new RangeError(`Query embedding dimension mismatch: expected ${this.dimensions}, got ${query.length}`);
      }
      if (FeatureVectorIndex.norm(query) === 0) {
        return [];
      }
      queryEmb = new Float32Array(query);
    } else {
      return [];
    }

    const results = [];
    for (const item of this.vectors) {
      const sim = FeatureVectorIndex.cosineSimilarity(queryEmb, item.embedding);
      if (sim > 0) {
        results.push({
          id: item.id,
          score: sim,
          doc: item.doc
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

/**
 * Backwards-compatibility alias for DenseVectorIndex.
 * Preserves compatibility with existing code and external references expecting DenseVectorIndex.
 * Accurately implements deterministic token/bigram feature-vector retrieval.
 */
const DenseVectorIndex = FeatureVectorIndex;

module.exports = {
  FeatureVectorIndex,
  DenseVectorIndex
};
