"""
Unit test suite for HybridRAGDifyTool.

Validates the real retrieval pipeline end-to-end:
  - BM25 lexical matching
  - Dense semantic matching
  - RRF fusion scoring
  - Citation generation
  - Graceful error handling
"""
import unittest
from ecosystem.dify.hybrid_rag_dify import HybridRAGDifyTool, _tokenize, _embed, _bm25_score, _rrf_fuse


# Corpus designed so queries unambiguously match specific documents.
# Each doc has strongly distinct vocabulary to make ranking deterministic.
SAMPLE_CORPUS = [
    {
        'id': 'owner/repo/src/core/bm25.js#L1-L80',
        'text': (
            'BM25Index buildIndex inverted scoring Robertson Sparck Jones IDF '
            'term frequency saturation document length normalization k1 b parameter.'
        ),
    },
    {
        'id': 'owner/repo/src/core/rrf.js#L1-L60',
        'text': (
            'ReciprocalRankFusion merge modality weight smooth constant ranked list '
            'fusion result combining multiple retrieval signals together.'
        ),
    },
    {
        'id': 'owner/repo/src/core/vector.js#L1-L100',
        'text': (
            'DenseVectorIndex generate embedding cosine similarity character ngram '
            'bigram hash dimensions semantic encoding neural representation.'
        ),
    },
    {
        'id': 'owner/repo/README.md#L1-L50',
        'text': (
            'Hybrid RAG Action automated triage GitHub issue pull request '
            'zero dependency open source CI pipeline workflow.'
        ),
    },
]


class TestHybridRAGDifyTool(unittest.TestCase):

    def setUp(self):
        self.tool = HybridRAGDifyTool()

    def test_execute_returns_success_status(self):
        """Tool must return status=success for a valid query."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'How does RRF work?',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')

    def test_execute_returns_real_results_not_mock(self):
        """
        Results must be derived from actual retrieval computation.
        The BM25-specific document must receive a non-zero BM25 score
        for a BM25-focused query, confirming real scoring happened.
        """
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'BM25 inverted index IDF scoring k1 parameter',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')
        results = result.get('results', [])
        self.assertGreater(len(results), 0, 'Expected at least one result')

        # The BM25 document must have a non-zero BM25 score for this query.
        bm25_result = next(
            (r for r in results if 'bm25.js' in r['id']), None
        )
        self.assertIsNotNone(bm25_result, 'BM25 document must appear in results')
        self.assertGreater(
            bm25_result['bm25_score'], 0.0,
            f'BM25 doc must have non-zero BM25 score; got: {bm25_result["bm25_score"]}'
        )

    def test_execute_rrf_scores_are_real_floats(self):
        """RRF scores must be positive floats derived from actual computation."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'semantic vector embedding cosine similarity',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')
        for item in result['results']:
            self.assertIn('rrf_score', item)
            self.assertIsInstance(item['rrf_score'], float)
            self.assertGreater(item['rrf_score'], 0.0)
            self.assertIn('bm25_score', item)
            self.assertIn('semantic_score', item)

    def test_execute_citations_contain_document_ids(self):
        """Each result must include a citation referencing the source document id."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'RRF fusion ranking',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')
        for item in result['results']:
            self.assertIn('citation', item)
            self.assertIn(item['id'], item['citation'],
                          f'Citation must reference document id; got: {item["citation"]}')

    def test_execute_summary_is_populated(self):
        """Summary field must be a non-empty string describing top result."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'GitHub Action triage',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')
        self.assertIsInstance(result.get('summary'), str)
        self.assertGreater(len(result['summary']), 10)

    def test_execute_respects_top_k(self):
        """Result count must not exceed top_k."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'retrieval index',
            'top_k': 2,
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'success')
        self.assertLessEqual(len(result['results']), 2)

    def test_execute_uses_demo_corpus_when_documents_omitted(self):
        """When documents are not provided, the demo corpus must be used."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'RRF fusion',
        })
        self.assertEqual(result['status'], 'success')
        self.assertGreater(len(result['results']), 0)

    def test_execute_error_on_empty_query(self):
        """An empty query must return status=error."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': '',
            'documents': SAMPLE_CORPUS,
        })
        self.assertEqual(result['status'], 'error')

    def test_engine_field_identifies_pipeline(self):
        """Engine field must describe the actual retrieval pipeline used."""
        result = self.tool.execute({
            'repository': 'Cagrik34/hybrid-rag-action',
            'query': 'BM25',
            'documents': SAMPLE_CORPUS,
        })
        engine = result.get('engine', '')
        self.assertIn('BM25', engine)
        self.assertIn('RRF', engine)

    def test_internal_tokenizer(self):
        """Tokenizer must lowercase, strip punctuation, and filter short tokens."""
        tokens = _tokenize('BM25 sparse retrieval: ERR_TIMEOUT (k=60)')
        self.assertIn('bm25', tokens)
        self.assertIn('sparse', tokens)
        self.assertIn('retrieval', tokens)
        self.assertIn('err_timeout', tokens)
        # Short tokens ('k') should be filtered
        self.assertNotIn('k', tokens)

    def test_internal_bm25_ranks_bm25_doc_highest_for_exact_terms(self):
        """
        BM25 must rank the document with the highest term-frequency overlap first.
        Uses a corpus where only one document contains all query terms.
        """
        corpus = [
            {'id': 'doc-bm25', 'text': 'BM25 inverted index IDF scoring parameter saturation normalization'},
            {'id': 'doc-rrf', 'text': 'ReciprocalRankFusion merge modality weight combining signals'},
            {'id': 'doc-vec', 'text': 'DenseVectorIndex embedding cosine similarity ngram hashing'},
        ]
        query_terms = _tokenize('BM25 inverted index IDF scoring')
        scores = _bm25_score(query_terms, corpus)
        best = max(range(len(scores)), key=lambda i: scores[i])
        self.assertEqual(corpus[best]['id'], 'doc-bm25',
                         f'Expected doc-bm25 to rank first; scores: {scores}')

    def test_internal_rrf_fusion_aggregates_rankings(self):
        """RRF fusion must produce a positive score for every document."""
        ranked_a = [0, 1, 2, 3]
        ranked_b = [2, 0, 3, 1]
        scores = _rrf_fuse([ranked_a, ranked_b], k=60)
        self.assertEqual(len(scores), 4)
        for s in scores:
            self.assertGreater(s, 0.0)


if __name__ == '__main__':
    unittest.main()
