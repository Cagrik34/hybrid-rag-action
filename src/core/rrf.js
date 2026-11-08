/**
 * Reciprocal Rank Fusion (RRF) Engine.
 * Merges rankings from multiple retrieval modalities (e.g., Sparse BM25 + Feature Vector).
 *
 * Formula: RRF_Score(d) = \sum_{m \in M} \frac{w_m}{k + r_m(d)}
 * where:
 *   - k: smoothing constant (default: 60)
 *   - r_m(d): rank of document d in modality m (1-indexed)
 *   - w_m: modality weight (default: 1.0)
 */

class ReciprocalRankFusion {
  /**
   * @param {Object} [options]
   * @param {number} [options.k=60] Smoothing factor (must be a positive integer)
   */
  constructor({ k = 60 } = {}) {
    if (!Number.isInteger(k) || k <= 0) {
      throw new RangeError('k must be a positive integer');
    }
    this.k = k;
  }

  /**
   * Merges multiple ranked result sets.
   * Deterministic sorting breaks score ties by document ID.
   *
   * @param {Array<Array<{id: string, score: number, doc: Object}>>} rankedLists 
   * @param {number[]} [weights=[]] Optional array of weights for each ranked list
   * @returns {Array<{id: string, rrfScore: number, ranks: Object, rawScores: Object, doc: Object}>}
   */
  fuse(rankedLists = [], weights = []) {
    if (!Array.isArray(rankedLists) || rankedLists.length === 0) {
      return [];
    }

    const fusedMap = new Map();

    for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
      const list = rankedLists[listIdx];
      if (!Array.isArray(list)) continue;

      const rawWeight = weights[listIdx];
      const weight = typeof rawWeight === 'number' && !Number.isNaN(rawWeight) ? rawWeight : 1.0;

      for (let rank = 0; rank < list.length; rank++) {
        const item = list[rank];
        if (!item || item.id === undefined) continue;

        const docId = String(item.id);
        const rankPos = rank + 1; // 1-indexed rank
        const rrfIncrement = weight / (this.k + rankPos);

        if (!fusedMap.has(docId)) {
          fusedMap.set(docId, {
            id: docId,
            rrfScore: 0,
            ranks: {},
            rawScores: {},
            doc: item.doc
          });
        }

        const entry = fusedMap.get(docId);
        entry.rrfScore += rrfIncrement;
        entry.ranks[`modality_${listIdx}`] = rankPos;
        entry.rawScores[`modality_${listIdx}`] = item.score;
      }
    }

    const fusedResults = Array.from(fusedMap.values());

    // Sort descending by RRF score; break ties deterministically by doc ID
    fusedResults.sort((a, b) => {
      const diff = b.rrfScore - a.rrfScore;
      if (Math.abs(diff) > 1e-12) {
        return diff;
      }
      return a.id.localeCompare(b.id);
    });

    return fusedResults;
  }
}

module.exports = { ReciprocalRankFusion };
