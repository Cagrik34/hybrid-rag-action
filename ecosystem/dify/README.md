# Dify.ai Ecosystem Tool: Hybrid RAG GitHub Triage

Native [Dify](https://dify.ai) custom tool integration providing zero-cloud, deterministic hybrid retrieval. Combines **Okapi BM25** keyword scoring with **128-dimensional dense semantic embeddings**, fused via **Reciprocal Rank Fusion (RRF, $k=60$)** to deliver line-precise code and document citations for Dify LLM workflows.

---

## 🌟 Key Capabilities

- **Zero-Cloud & Zero-Dependency:** Runs entirely on standard Python 3.9+ without external embedding API calls or vector database infrastructure.
- **True Hybrid Retrieval:** Simultaneous lexical matching (Okapi BM25 with length normalization $k_1=1.5, b=0.75$) and sub-word cosine similarity.
- **Reciprocal Rank Fusion (RRF):** Merges disparate scoring scales deterministically using $RRF(d) = \sum_{m \in M} \frac{w_m}{k + r_m(d)}$ with $k=60$.
- **Automated Citations:** Generates markdown citations with file paths and line ranges for direct LLM grounding.

---

## 🚀 Installation & Setup

### Method 1: Dify Custom Tool Provider (API / Self-Hosted)

1. Copy the `ecosystem/dify` directory into your Dify tools workspace:
   ```bash
   # From your Dify installation root:
   cp -r hybrid-rag-action/ecosystem/dify /path/to/dify/api/core/tools/custom_tool/hybrid_rag
   ```

2. In Dify Studio UI:
   - Navigate to **Tools** > **Custom Tools** > **Create from Schema**.
   - Import the `provider.yaml` schema definition.
   - Attach the **Hybrid RAG GitHub Triage** tool to any Chatflow or Agent node.

### Method 2: Standalone Python Module / Agent Node

Install directly as a local module in your workflow runner:
```python
from ecosystem.dify.hybrid_rag_dify import HybridRAGDifyTool

tool = HybridRAGDifyTool()

# Executes retrieval over demo corpus or user-injected corpus
response = tool.execute({
    "repository": "Cagrik34/hybrid-rag-action",
    "query": "How does Reciprocal Rank Fusion work?",
    "top_k": 3
})

for result in response["results"]:
    print(f"[{result['rrf_score']:.4f}] {result['citation']}")
```

---

## ⚙️ Parameter Reference

| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `repository` | string | Yes | — | Target repository identifier (e.g. `owner/repo`) |
| `query` | string | Yes | — | Natural language question, bug report, or keyword search query |
| `top_k` | number | No | `5` | Maximum number of ranked documents or chunks to return |
| `documents` | list[dict] | No | Demo Corpus | Optional injected list of `{"id": str, "text": str}` chunks |

---

## 📦 Output Format

The tool returns a structured dictionary matching Dify's tool execution contract:

```json
{
  "status": "success",
  "repository": "Cagrik34/hybrid-rag-action",
  "query": "How does RRF fusion work?",
  "engine": "Hybrid RAG (Okapi BM25 k1=1.5,b=0.75 + Semantic 128-dim + RRF k=60)",
  "results": [
    {
      "rank": 1,
      "id": "Cagrik34/hybrid-rag-action/src/core/rrf.js#L1-L60",
      "text": "ReciprocalRankFusion merges rankings from BM25 sparse and dense semantic modalities...",
      "rrf_score": 0.0328,
      "bm25_score": 2.4512,
      "semantic_score": 0.8921,
      "citation": "[Cagrik34/hybrid-rag-action/src/core/rrf.js#L1-L60] ReciprocalRankFusion merges..."
    }
  ],
  "summary": "Top match for \"How does RRF fusion work?\": [Cagrik34/hybrid-rag-action/src/core/rrf.js#L1-L60]..."
}
```

---

## 🧪 Verification & Testing

Execute the automated test suite verifying all 12 regression tests:
```bash
python ecosystem/dify/test_dify_integration.py
```

Run the reproducible end-to-end example:
```bash
python ecosystem/dify/example_dify_usage.py
```
