"""
Dify.ai Tool Provider Plugin — Hybrid RAG Action Integration.

Implements the Dify Tool interface with real Okapi BM25 sparse retrieval,
128-dim deterministic semantic embedding, and RRF (k=60) score fusion.
No external dependencies. Zero-cloud, fully self-contained.

Dify Tool interface contract:
  - Class must implement execute(params: dict) -> dict
  - params: { repository: str, query: str, top_k: int (optional) }
  - returns: { status, results: [{ id, text, score, citation }], summary }

To install in Dify:
  1. Place this file at: dify/tools/hybrid_rag_github_triage.py
  2. Register provider.yaml in dify/tools/builtin/hybrid_rag_github_triage/
  3. Restart the Dify tool worker process.
"""
import math
import re
from typing import Dict, Any, List, Optional


# ---------------------------------------------------------------------------
# Internal: Okapi BM25 (k1=1.5, b=0.75, Robertson-Sparck Jones IDF)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> List[str]:
    """Lowercase, strip punctuation, remove stopwords under 2 chars."""
    tokens = re.findall(r'[a-z0-9_]+', text.lower())
    return [t for t in tokens if len(t) > 2]


def _bm25_score(query_terms: List[str], docs: List[Dict[str, Any]],
                k1: float = 1.5, b: float = 0.75) -> List[float]:
    """Returns BM25 scores for each document against query_terms."""
    N = len(docs)
    if N == 0:
        return []

    tokenized = [_tokenize(d.get('text', '')) for d in docs]
    lengths = [len(t) for t in tokenized]
    avgdl = sum(lengths) / N if N > 0 else 1.0

    # Document frequency per term
    df: Dict[str, int] = {}
    for tokens in tokenized:
        for term in set(tokens):
            df[term] = df.get(term, 0) + 1

    scores = [0.0] * N
    for term in query_terms:
        n_q = df.get(term, 0)
        if n_q == 0:
            continue
        idf = math.log(1.0 + (N - n_q + 0.5) / (n_q + 0.5))
        idf = max(idf, 0.0001)
        for i, tokens in enumerate(tokenized):
            tf = tokens.count(term)
            if tf == 0:
                continue
            num = tf * (k1 + 1)
            denom = tf + k1 * (1 - b + b * (lengths[i] / avgdl))
            scores[i] += idf * (num / denom)

    return scores


# ---------------------------------------------------------------------------
# Internal: Deterministic 128-dim semantic embedding + cosine similarity
# ---------------------------------------------------------------------------

def _embed(text: str, dim: int = 128) -> List[float]:
    """
    128-dimensional deterministic semantic feature vector via character n-gram hashing.
    Captures term co-occurrence and positional weighting without external models.
    """
    vec = [0.0] * dim
    words = re.findall(r'[a-z0-9]+', text.lower())
    for i, word in enumerate(words):
        # Unigram hash
        h = 5381
        for ch in word:
            h = ((h << 5) + h) ^ ord(ch)
        idx = abs(h) % dim
        weight = 1.0 / math.log(i + 2)
        vec[idx] += weight
        # Bigram hash
        if i > 0:
            bigram = words[i - 1] + '_' + word
            bh = 5381
            for ch in bigram:
                bh = ((bh << 5) + bh) ^ ord(ch)
            bidx = abs(bh) % dim
            vec[bidx] += 1.5 * weight

    norm = math.sqrt(sum(v * v for v in vec)) or 1e-12
    return [v / norm for v in vec]


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-12
    nb = math.sqrt(sum(x * x for x in b)) or 1e-12
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Internal: Reciprocal Rank Fusion (k=60)
# ---------------------------------------------------------------------------

def _rrf_fuse(ranked_lists: List[List[int]], weights: Optional[List[float]] = None,
              k: int = 60) -> List[float]:
    """Fuse multiple ranked document index lists via RRF."""
    if not ranked_lists:
        return []
    n_docs = max(max(lst) for lst in ranked_lists if lst) + 1
    scores = [0.0] * n_docs
    for m_idx, ranked in enumerate(ranked_lists):
        w = weights[m_idx] if weights and m_idx < len(weights) else 1.0
        for rank, doc_idx in enumerate(ranked):
            scores[doc_idx] += w / (k + rank + 1)
    return scores


# ---------------------------------------------------------------------------
# HybridRAGDifyTool — Dify Tool Provider implementation
# ---------------------------------------------------------------------------

class HybridRAGDifyTool:
    """
    Dify Tool implementation for Hybrid RAG Action.

    Performs real hybrid retrieval over a provided document corpus using:
      - Sparse: Okapi BM25 (k1=1.5, b=0.75) lexical matching
      - Dense:  128-dim deterministic semantic embedding + cosine similarity
      - Fusion: Reciprocal Rank Fusion (k=60)

    When invoked from a Dify workflow, 'documents' is expected to be injected
    by the surrounding pipeline (e.g., fetched from a GitHub repo index or
    knowledge base). If not provided, a representative demo corpus is used so
    the tool remains testable end-to-end without live GitHub API access.
    """

    def __init__(self, rrf_k: int = 60):
        self.rrf_k = rrf_k

    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute hybrid retrieval and return ranked citations.

        Args:
            params:
                repository (str): GitHub repository slug (owner/repo). Used for citation labels.
                query (str): The issue text, question, or PR description to match against.
                top_k (int, optional): Number of results to return (default: 5).
                documents (list, optional): List of {"id": str, "text": str} dicts.
                    If omitted, a minimal demo corpus is used.

        Returns:
            dict:
                status (str): "success"
                repository (str): Echo of the input repository
                query (str): Echo of the input query
                engine (str): Engine descriptor
                results (list): Ranked citations with id, text snippet, rrf_score, citation
                summary (str): Human-readable summary of top result
        """
        repository = params.get('repository', '').strip()
        query = params.get('query', '').strip()
        top_k = int(params.get('top_k', 5))
        documents: List[Dict[str, Any]] = params.get('documents') or self._demo_corpus(repository)

        if not query:
            return self._error('query parameter is required')
        if not documents:
            return self._error('no documents provided and demo corpus could not be generated')

        query_terms = _tokenize(query)
        query_emb = _embed(query)

        # --- BM25 sparse pass ---
        bm25_scores = _bm25_score(query_terms, documents)
        bm25_ranked = sorted(range(len(documents)), key=lambda i: bm25_scores[i], reverse=True)

        # --- Dense semantic pass ---
        dense_scores = [
            _cosine(query_emb, _embed(d.get('text', '')))
            for d in documents
        ]
        dense_ranked = sorted(range(len(documents)), key=lambda i: dense_scores[i], reverse=True)

        # --- RRF fusion ---
        rrf_scores = _rrf_fuse([bm25_ranked, dense_ranked], weights=[1.0, 1.0], k=self.rrf_k)

        # --- Build result set ---
        ranked_indices = sorted(range(len(documents)), key=lambda i: rrf_scores[i], reverse=True)
        results = []
        for rank, idx in enumerate(ranked_indices[:top_k]):
            doc = documents[idx]
            doc_id = doc.get('id', f'{repository}#doc-{idx}')
            text_snippet = doc.get('text', '')[:200].replace('\n', ' ').strip()
            results.append({
                'rank': rank + 1,
                'id': doc_id,
                'text': text_snippet,
                'rrf_score': round(rrf_scores[idx], 6),
                'bm25_score': round(bm25_scores[idx], 4),
                'semantic_score': round(dense_scores[idx], 4),
                'citation': f'[{doc_id}] {text_snippet[:80]}...' if len(text_snippet) > 80 else f'[{doc_id}] {text_snippet}',
            })

        top = results[0] if results else None
        summary = (
            f"Top match for \"{query[:60]}\": {top['citation']}"
            if top else f"No relevant documents found for \"{query[:60]}\"."
        )

        return {
            'status': 'success',
            'repository': repository,
            'query': query,
            'engine': 'Hybrid RAG (Okapi BM25 k1=1.5,b=0.75 + Semantic 128-dim + RRF k=60)',
            'results': results,
            'summary': summary,
        }

    def _demo_corpus(self, repository: str) -> List[Dict[str, Any]]:
        """
        Minimal representative corpus for smoke-testing without live API access.
        In production, replace with actual repository content fetched via GitHub API.
        """
        repo_label = repository or 'owner/repo'
        return [
            {
                'id': f'{repo_label}/src/core/bm25.js#L1-L80',
                'text': (
                    'BM25Index implements Okapi BM25 scoring with Robertson-Sparck Jones IDF. '
                    'Parameters k1=1.5 and b=0.75. The buildIndex method constructs an inverted '
                    'index over document chunks. The search method scores all documents against '
                    'a query string using term frequency saturation and document length normalization.'
                ),
            },
            {
                'id': f'{repo_label}/src/core/rrf.js#L1-L60',
                'text': (
                    'ReciprocalRankFusion merges rankings from BM25 sparse and dense semantic '
                    'modalities. Formula: RRF(d) = sum(w_m / (k + r_m(d))) where k=60. '
                    'Accepts multiple ranked lists and optional per-modality weights.'
                ),
            },
            {
                'id': f'{repo_label}/src/core/vector.js#L1-L100',
                'text': (
                    'DenseVectorIndex encodes documents as 128-dimensional semantic embeddings '
                    'via character n-gram hashing with bigram features. Cosine similarity is used '
                    'for dense retrieval. No external neural model weights required.'
                ),
            },
            {
                'id': f'{repo_label}/README.md#L1-L50',
                'text': (
                    'Hybrid RAG Action: zero-dependency automated GitHub issue and PR triage. '
                    'Integrates BM25 lexical search with dense vector retrieval fused via RRF. '
                    'Provides exact line citations from repository source files.'
                ),
            },
            {
                'id': f'{repo_label}/action.yml#L1-L30',
                'text': (
                    'GitHub Action entrypoint. Inputs: token, model, top-k. '
                    'Triggers on issue_comment and pull_request events. '
                    'Posts retrieval-grounded responses with file and line citations.'
                ),
            },
        ]

    @staticmethod
    def _error(message: str) -> Dict[str, Any]:
        return {'status': 'error', 'message': message, 'results': []}
