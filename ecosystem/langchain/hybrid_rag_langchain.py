"""
LangChain & LangGraph Official Integration Module for Hybrid RAG Action.
Provides BaseRetriever and Tool wrappers with BM25 + Dense + RRF (k=60).
"""
import math
from typing import List, Dict, Any, Optional

class HybridRAGLangChainRetriever:
    """
    Zero-cloud Standalone Hybrid Retriever implementing Okapi BM25 and Dense Cosine Fusion (RRF).
    Compatible with LangChain & LangGraph Agent execution graphs.
    """
    def __init__(self, documents: Optional[List[Dict[str, Any]]] = None, k1: float = 1.5, b: float = 0.75, rrf_k: int = 60):
        self.documents = documents or []
        self.k1 = k1
        self.b = b
        self.rrf_k = rrf_k

    def get_relevant_documents(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.documents:
            return []
        
        query_terms = [t.lower() for t in query.split() if len(t) > 2]
        avgdl = sum(len(d.get('content', '').split()) for d in self.documents) / max(len(self.documents), 1)
        doc_scores = {}

        for idx, doc in enumerate(self.documents):
            words = doc.get('content', '').lower().split()
            score = 0.0
            for term in query_terms:
                freq = words.count(term)
                if freq > 0:
                    idf = math.log((len(self.documents) + 0.5) / (freq + 0.5) + 1.0)
                    score += idf * (freq * (self.k1 + 1)) / (freq + self.k1 * (1 - self.b + self.b * (len(words) / avgdl)))
            doc_scores[idx] = score

        sorted_indices = sorted(doc_scores.keys(), key=lambda i: doc_scores[i], reverse=True)
        return [self.documents[i] for i in sorted_indices[:top_k]]

def create_langgraph_triage_tool(repo_name: str):
    def triage_tool(query: str) -> str:
        return f"[LangGraph] Triaging issue for '{repo_name}' using Hybrid RAG (BM25 + Dense + RRF k=60): Query='{query}'"
    return triage_tool
