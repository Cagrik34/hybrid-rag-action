/**
 * Reciprocal Rank Fusion (RRF) Engine.
 * Merges rankings from multiple retrieval modalities (Sparse BM25 + Dense Semantic).
 *
 * Formula: RRF_Score(d) = \sum_{m \in M} \frac{w_m}{k + r_m(d)}
 * where:
 *   - k: smoothing constant (default: 60)
 *   - r_m(d): rank of document d in modality m (1-indexed)
 *   - w_m: optional modality weight
 */

class ReciprocalRankFusion {
  /**
   * @param {Object} options
   * @param {number} options.k Smoothing factor (default: 60)
   */
  constructor({ k = 60 } = {}) {
    this.k = k;
  }

  /**
   * Merges multiple ranked result sets.
   * @param {Array<Array<{id: string, score: number, doc: Object}>>} rankedLists 
   * @param {number[]} weights Optional array of weights for each ranked list
   * @returns {Array<{id: string, rrfScore: number, ranks: Object, doc: Object}>}
   */
  fuse(rankedLists, weights = []) {
    const fusedMap = new Map();

    for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
      const list = rankedLists[listIdx] || [];
      const weight = weights[listIdx] !== undefined ? weights[listIdx] : 1.0;

      for (let rank = 0; rank < list.length; rank++) {
        const item = list[rank];
        const docId = item.id;
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
    fusedResults.sort((a, b) => b.rrfScore - a.rrfScore);
    return fusedResults;
  }
}

module.exports = { ReciprocalRankFusion };
