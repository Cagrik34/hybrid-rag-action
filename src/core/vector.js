/**
 * Dense Vector Similarity Search Engine.
 * Computes Cosine Similarity over normalized dense embeddings.
 */

class DenseVectorIndex {
  constructor() {
    this.vectors = []; // Array<{id: string, embedding: Float32Array, doc: Object}>
    this.vocabulary = new Map();
    this.vocabSize = 0;
  }

  /**
   * Computes Dot Product between two vectors.
   * @param {number[]|Float32Array} a 
   * @param {number[]|Float32Array} b 
   * @returns {number}
   */
  static dotProduct(a, b) {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
    }
    return dot;
  }

  /**
   * Computes L2 Norm (Euclidean length) of a vector.
   * @param {number[]|Float32Array} vec 
   * @returns {number}
   */
  static norm(vec) {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum) || 1e-12;
  }

  /**
   * Computes Cosine Similarity between vector a and vector b.
   * @param {number[]|Float32Array} a 
   * @param {number[]|Float32Array} b 
   * @returns {number} Value in range [-1, 1]
   */
  static cosineSimilarity(a, b) {
    const dot = DenseVectorIndex.dotProduct(a, b);
    const normA = DenseVectorIndex.norm(a);
    const normB = DenseVectorIndex.norm(b);
    return dot / (normA * normB);
  }

  /**
   * Builds dense term-hash / contextual semantic vectors for documents.
   * Allows deterministic dense retrieval in environments without heavy external neural weights.
   * @param {Array<{id: string, text: string, metadata: Object, embedding?: number[]}>} docs 
   */
  buildIndex(docs) {
    this.vectors = [];
    for (const doc of docs) {
      let emb = doc.embedding;
      if (!emb) {
        emb = this.generateSemanticEmbedding(doc.text);
      }
      this.vectors.push({
        id: doc.id,
        embedding: new Float32Array(emb),
        doc: doc
      });
    }
  }

  /**
   * High-dimensional deterministic semantic feature mapping.
   * Encodes character n-grams and token position into a 128-dimensional dense vector.
   * @param {string} text 
   * @returns {number[]} Normalized 128-dimensional dense array
   */
  generateSemanticEmbedding(text, dimensions = 128) {
    const vec = new Float64Array(dimensions);
    const clean = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const words = clean.split(/\s+/).filter(w => w.length > 0);

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
    const norm = DenseVectorIndex.norm(vec);
    const result = new Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      result[i] = vec[i] / norm;
    }
    return result;
  }

  /**
   * Searches the dense index against a query string.
   * @param {string|number[]} query 
   * @param {number} topK 
   * @returns {Array<{id: string, score: number, doc: Object}>}
   */
  search(query, topK = 10) {
    if (this.vectors.length === 0) return [];
    
    let queryEmb;
    if (typeof query === 'string') {
      queryEmb = new Float32Array(this.generateSemanticEmbedding(query));
    } else {
      queryEmb = new Float32Array(query);
    }

    const results = [];
    for (const item of this.vectors) {
      const sim = DenseVectorIndex.cosineSimilarity(queryEmb, item.embedding);
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

module.exports = { DenseVectorIndex };
