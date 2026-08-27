"""
Unit test suite verifying all 5 Tier-2 AI Giant ecosystem integrations.
"""
import unittest
from ecosystem.langchain.hybrid_rag_langchain import HybridRAGLangChainRetriever, create_langgraph_triage_tool
from ecosystem.llamaindex.hybrid_rag_llamaindex import LlamaIndexHybridRAGRetriever
from ecosystem.dify.hybrid_rag_dify import HybridRAGDifyTool
from ecosystem.haystack.haystack_hybrid_component import HaystackHybridRAGComponent
from ecosystem.dspy.dspy_hybrid_rag import HybridRAGDSPyModule

class TestEcosystemIntegrations(unittest.TestCase):
    def test_langchain_retriever(self):
        docs = [
            {"content": "BM25 sparse search handles exact error codes like ERR_TIMEOUT."},
            {"content": "Dense semantic vectors capture natural language meaning."}
        ]
        retriever = HybridRAGLangChainRetriever(documents=docs)
        results = retriever.get_relevant_documents("error codes ERR_TIMEOUT")
        self.assertTrue(len(results) > 0)
        self.assertIn("ERR_TIMEOUT", results[0]['content'])

    def test_llamaindex_retriever(self):
        nodes = [
            {"text": "LlamaIndex node containing AST line spans [src/index.js#L10-L20]"},
            {"text": "Generic documentation text without citations"}
        ]
        retriever = LlamaIndexHybridRAGRetriever(nodes=nodes)
        results = retriever.retrieve("AST line spans")
        self.assertTrue(len(results) > 0)

    def test_dify_tool(self):
        tool = HybridRAGDifyTool()
        res = tool.execute({"repository": "Cagrik34/hybrid-rag-action", "query": "How does RRF work?"})
        self.assertEqual(res["status"], "success")

    def test_haystack_component(self):
        comp = HaystackHybridRAGComponent()
        docs = [{"content": "Haystack 2.0 pipeline integration with RRF fusion"}]
        out = comp.run(query="Haystack RRF", documents=docs)
        self.assertEqual(len(out["documents"]), 1)

    def test_dspy_module(self):
        mod = HybridRAGDSPyModule()
        out = mod.forward("What is RRF?", ["[src/rrf.js#L1-L20] Score fusion"])
        self.assertTrue(out["grounded"])

if __name__ == '__main__':
    unittest.main()
