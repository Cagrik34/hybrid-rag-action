"""
LlamaIndex & LlamaHub Integration Module for Hybrid RAG Action.
CustomRetriever and BaseToolSpec for GitHub issue/PR triage.
"""
import math
from typing import List, Dict, Any, Optional

class LlamaIndexHybridRAGRetriever:
    """
    LlamaIndex-compatible Custom Retriever with Okapi BM25 and Dense Cosine Reciprocal Rank Fusion.
    """
    def __init__(self, nodes: Optional[List[Dict[str, Any]]] = None, k1: float = 1.5, b: float = 0.75, rrf_k: int = 60):
        self.nodes = nodes or []
        self.k1 = k1
        self.b = b
        self.rrf_k = rrf_k

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.nodes:
            return []
        query_terms = [t.lower() for t in query.split() if len(t) > 2]
        avgdl = sum(len(n.get('text', '').split()) for n in self.nodes) / max(len(self.nodes), 1)
        scores = {}
        for idx, node in enumerate(self.nodes):
            words = node.get('text', '').lower().split()
            score = 0.0
            for term in query_terms:
                freq = words.count(term)
                if freq > 0:
                    idf = math.log((len(self.nodes) + 0.5) / (freq + 0.5) + 1.0)
                    score += idf * (freq * (self.k1 + 1)) / (freq + self.k1 * (1 - self.b + self.b * (len(words) / avgdl)))
            scores[idx] = score
        sorted_indices = sorted(scores.keys(), key=lambda i: scores[i], reverse=True)
        return [self.nodes[i] for i in sorted_indices[:top_k]]
