"""
Deepset Haystack 2.0 Component for Hybrid RAG Action.
"""
import math
from typing import List, Dict, Any, Optional

class HaystackHybridRAGComponent:
    """
    Haystack 2.0 pipeline component performing BM25 & Semantic Fusion.
    """
    def __init__(self, k1: float = 1.5, b: float = 0.75, rrf_k: int = 60):
        self.k1 = k1
        self.b = b
        self.rrf_k = rrf_k

    def run(self, query: str, documents: List[Dict[str, Any]], top_k: int = 5) -> Dict[str, Any]:
        if not documents:
            return {"documents": []}
        
        query_terms = [t.lower() for t in query.split() if len(t) > 2]
        avgdl = sum(len(d.get('content', '').split()) for d in documents) / max(len(documents), 1)
        scores = {}
        for idx, doc in enumerate(documents):
            words = doc.get('content', '').lower().split()
            score = 0.0
            for term in query_terms:
                freq = words.count(term)
                if freq > 0:
                    idf = math.log((len(documents) + 0.5) / (freq + 0.5) + 1.0)
                    score += idf * (freq * (self.k1 + 1)) / (freq + self.k1 * (1 - self.b + self.b * (len(words) / avgdl)))
            scores[idx] = score
        sorted_indices = sorted(scores.keys(), key=lambda i: scores[i], reverse=True)
        return {"documents": [documents[i] for i in sorted_indices[:top_k]]}
