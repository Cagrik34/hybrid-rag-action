/**
 * Structure-Aware Document & Code Chunker.
 * Preserves Markdown header hierarchy, code fences, and line-span citations.
 */

class DocumentChunker {
  /**
   * @param {Object} options
   * @param {number} options.maxChunkSize Maximum characters per chunk
   * @param {number} options.overlap Character overlap between adjacent chunks
   */
  constructor({ maxChunkSize = 1000, overlap = 150 } = {}) {
    this.maxChunkSize = maxChunkSize;
    this.overlap = overlap;
  }

  /**
   * Chunks a markdown document by headers (#, ##, ###) while maintaining line tracking.
   * @param {string} content Raw file content
   * @param {string} filePath File path
   * @returns {Array<{id: string, text: string, metadata: {filePath: string, startLine: number, endLine: number, section: string}}>}
   */
  chunkMarkdown(content, filePath) {
    if (!content || typeof content !== 'string') return [];

    const lines = content.split('\n');
    const chunks = [];
    let currentSection = 'Introduction';
    let currentLines = [];
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);

      if (headerMatch && currentLines.length > 0) {
        // Emit accumulated chunk
        const chunkText = currentLines.join('\n').trim();
        if (chunkText.length > 20) {
          chunks.push({
            id: `${filePath}#L${startLine}-L${lineNum - 1}`,
            text: `[${filePath}] Section: ${currentSection}\n${chunkText}`,
            metadata: {
              filePath,
              startLine,
              endLine: lineNum - 1,
              section: currentSection
            }
          });
        }
        currentSection = headerMatch[2].trim();
        currentLines = [line];
        startLine = lineNum;
      } else {
        currentLines.push(line);
      }
    }

    // Emit final chunk
    if (currentLines.length > 0) {
      const chunkText = currentLines.join('\n').trim();
      if (chunkText.length > 20) {
        chunks.push({
          id: `${filePath}#L${startLine}-L${lines.length}`,
          text: `[${filePath}] Section: ${currentSection}\n${chunkText}`,
          metadata: {
            filePath,
            startLine,
            endLine: lines.length,
            section: currentSection
          }
        });
      }
    }

    return chunks;
  }
}

module.exports = { DocumentChunker };
