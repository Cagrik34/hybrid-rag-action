/**
 * Pluggable LLM Inference Adapter.
 * Supports GitHub Models API (Free for developers via OpenAI-compatible endpoints),
 * Azure AI, OpenAI, and local SLM inference endpoints.
 */

const https = require('https');
const http = require('http');

class LLMClient {
  /**
   * @param {Object} config
   * @param {string} config.provider 'github-models' | 'openai' | 'azure' | 'custom'
   * @param {string} config.apiKey
   * @param {string} config.model e.g. 'Phi-4', 'gpt-4o-mini'
   * @param {string} [config.endpoint]
   */
  constructor({ provider = 'github-models', apiKey, model = 'Phi-4', endpoint } = {}) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    
    if (provider === 'github-models') {
      this.endpoint = endpoint || 'https://models.inference.ai.azure.com/chat/completions';
    } else if (provider === 'openai') {
      this.endpoint = endpoint || 'https://api.openai.com/v1/chat/completions';
    } else {
      this.endpoint = endpoint || 'http://localhost:11434/v1/chat/completions';
    }
  }

  /**
   * Generates a grounded response using retrieved context passages.
   * @param {string} userQuery
   * @param {Array<Object>} retrievedChunks
   * @returns {Promise<string>}
   */
  async generateGroundedAnswer(userQuery, retrievedChunks) {
    // Construct Grounded Prompt
    const contextText = retrievedChunks.map((c, i) => {
      const meta = c.doc.metadata;
      return `[Source ${i + 1}]: ${meta.filePath} (Lines ${meta.startLine}-${meta.endLine})\n${c.doc.text}`;
    }).join('\n\n---\n\n');

    const systemPrompt = `You are the official repository AI assistant powered by Hybrid RAG (BM25 + Semantic Vector Search).
Your goal is to answer the user's issue/PR question with strict grounding on the provided repository documentation context.

RULES:
1. Always cite exact file paths and line ranges using standard markdown links format: [filename#L{start}-L{end}].
2. If the context does not contain sufficient details to answer, state clearly what is missing and provide best engineering guidance.
3. Be concise, technical, and accurate. Do not invent non-existent APIs or parameters.`;

    const userPrompt = `### REPOSITORY CONTEXT:
${contextText}

### USER INQUIRY:
${userQuery}

Provide a structured, helpful answer grounded on the repository context above.`;

    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    });

    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${this.apiKey}`
        }
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const answer = data.choices?.[0]?.message?.content || 'No response generated.';
              resolve(answer);
            } catch (err) {
              reject(new Error(`Failed to parse LLM response: ${err.message}`));
            }
          } else {
            // Fallback synthesis if API key is not configured for external models
            resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
          }
        });
      });

      req.on('error', (err) => {
        // Graceful fallback to local synthesis
        resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Deterministic local fallback synthesis when external LLM API is unavailable.
   */
  generateLocalFallbackAnswer(userQuery, retrievedChunks) {
    let md = `### 🤖 Hybrid RAG Context Analysis\n\n`;
    md += `I analyzed the repository documentation using **BM25 + Semantic Vector Fusion (RRF)** in response to your query:\n\n`;
    md += `> *${userQuery}*\n\n`;
    md += `#### 📚 Top Grounded References:\n`;

    for (let i = 0; i < retrievedChunks.length; i++) {
      const chunk = retrievedChunks[i];
      const meta = chunk.doc.metadata;
      md += `${i + 1}. **[`${meta.filePath}#L${meta.startLine}-L${meta.endLine}`](https://github.com/${meta.filePath}#L${meta.startLine}-L${meta.endLine})** (Section: *${meta.section}*) - RRF Score: `${chunk.rrfScore.toFixed(4)}`\n`;
    }

    md += `\n<details><summary><b>🔍 View Extracted Context Snippets</b></summary>\n\n`;
    for (const chunk of retrievedChunks) {
      md += ````markdown\n${chunk.doc.text}\n````\n\n`;
    }
    md += `</details>\n`;
    return md;
  }
}

module.exports = { LLMClient };
