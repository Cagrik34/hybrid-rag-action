/**
 * Pluggable LLM Inference Adapter.
 * Supports GitHub Models API, Azure AI, OpenAI, and local SLM inference endpoints.
 */

const https = require('https');
const http = require('http');

class LLMClient {
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

  async generateGroundedAnswer(userQuery, retrievedChunks) {
    const contextText = retrievedChunks.map((c, i) => {
      const meta = c.doc.metadata;
      return '[Source ' + (i + 1) + ']: ' + meta.filePath + ' (Lines ' + meta.startLine + '-' + meta.endLine + ')\n' + c.doc.text;
    }).join('\n\n---\n\n');

    const systemPrompt = 'You are the official repository AI assistant powered by Hybrid RAG (BM25 + Semantic Vector Search).\n' +
      'Your goal is to answer the user inquiry strictly grounded on the provided repository context.\n' +
      'RULES:\n1. Always cite exact file paths and line ranges: [filename#Lstart-Lend].\n' +
      '2. If the context does not contain sufficient details, state clearly what is missing.\n3. Be concise and technical.';

    const userPrompt = '### REPOSITORY CONTEXT:\n' + contextText + '\n\n### USER INQUIRY:\n' + userQuery + '\n\nProvide a grounded answer:';

    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1024
    });

    return new Promise((resolve) => {
      try {
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
            'Authorization': 'Bearer ' + this.apiKey
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
                resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
              }
            } else {
              resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
            }
          });
        });
        req.on('error', () => resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks)));
        req.setTimeout(12000, () => { req.destroy(); resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks)); });
        req.write(payload);
        req.end();
      } catch (e) {
        resolve(this.generateLocalFallbackAnswer(userQuery, retrievedChunks));
      }
    });
  }

  generateLocalFallbackAnswer(userQuery, retrievedChunks) {
    let md = '### 🤖 Hybrid RAG Context Analysis\n\n';
    md += 'I analyzed the repository documentation using **BM25 + Semantic Vector Fusion (RRF)** in response to your query:\n\n';
    md += '> *' + userQuery + '*\n\n';
    md += '#### 📚 Top Grounded References:\n';
    for (let i = 0; i < retrievedChunks.length; i++) {
      const chunk = retrievedChunks[i];
      const meta = chunk.doc.metadata;
      md += (i + 1) + '. **[' + meta.filePath + '#L' + meta.startLine + '-L' + meta.endLine + '](https://github.com/' + meta.filePath + '#L' + meta.startLine + '-L' + meta.endLine + ')** (Section: *' + meta.section + '*) - RRF Score: `' + chunk.rrfScore.toFixed(4) + '`\n';
    }
    md += '\n<details><summary><b>🔍 View Extracted Context Snippets</b></summary>\n\n';
    for (const chunk of retrievedChunks) {
      md += '```markdown\n' + chunk.doc.text + '\n```\n\n';
    }
    md += '</details>\n';
    return md;
  }
}

module.exports = { LLMClient };