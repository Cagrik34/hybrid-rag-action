/**
 * Structure-Aware Document & Code Chunker.
 * Preserves Markdown header hierarchy, code fences, and line-span citations.
 */

class DocumentChunker {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxChunkSize=1000] Maximum characters per chunk (must be positive)
   * @param {number} [options.overlap=150] Character overlap between adjacent chunks (0 <= overlap < maxChunkSize)
   */
  constructor({ maxChunkSize = 1000, overlap = 150 } = {}) {
    if (!Number.isInteger(maxChunkSize) || maxChunkSize <= 0) {
      throw new RangeError('maxChunkSize must be a positive integer');
    }
    if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxChunkSize) {
      throw new RangeError('overlap must be an integer >= 0 and strictly less than maxChunkSize');
    }
    this.maxChunkSize = maxChunkSize;
    this.overlap = overlap;
  }

  /**
   * Chunks a markdown document by headers while maintaining line tracking and respecting code fences.
   * @param {string} content Raw file content
   * @param {string} [filePath=''] File path for citation metadata
   * @returns {Array<{id: string, text: string, metadata: {filePath: string, startLine: number, endLine: number, section: string, hierarchy: string[]}}>}
   */
  chunkMarkdown(content, filePath = '') {
    if (!content || typeof content !== 'string') return [];
    if (content.trim().length === 0) return [];

    const rawLines = content.split(/\r?\n/);
    const lines = rawLines.map((text, i) => ({ text, lineNum: i + 1 }));

    // 1. Partition lines into sections by Markdown headings, ignoring headings inside fenced code blocks
    const sections = [];
    let currentSectionName = 'Introduction';
    let currentSectionLines = [];
    const headingStack = []; // Array<{ level: number, name: string }>
    let currentHierarchy = ['Introduction'];

    let inFence = false;
    let fenceChar = '';
    let fenceLength = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineObj = lines[i];
      const lineText = lineObj.text;

      // Track code fence boundaries (``` or ~~~)
      const fenceMatch = lineText.match(/^[ ]{0,3}(`{3,}|~{3,})/);
      if (fenceMatch) {
        const char = fenceMatch[1][0];
        const len = fenceMatch[1].length;
        if (!inFence) {
          inFence = true;
          fenceChar = char;
          fenceLength = len;
        } else if (char === fenceChar && len >= fenceLength) {
          inFence = false;
          fenceChar = '';
          fenceLength = 0;
        }
      }

      // Detect markdown heading only when outside code fence
      const headingMatch = !inFence ? lineText.match(/^[ ]{0,3}(#{1,6})\s+(.+)$/) : null;

      if (headingMatch) {
        if (currentSectionLines.length > 0) {
          sections.push({
            name: currentSectionName,
            lines: currentSectionLines,
            hierarchy: [...currentHierarchy]
          });
        }

        const headingLevel = headingMatch[1].length;
        const headingTitle = headingMatch[2].trim();

        // Maintain hierarchical breadcrumb stack
        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= headingLevel) {
          headingStack.pop();
        }
        headingStack.push({ level: headingLevel, name: headingTitle });
        currentHierarchy = headingStack.map(h => h.name);

        currentSectionName = headingTitle;
        currentSectionLines = [lineObj];
      } else {
        currentSectionLines.push(lineObj);
      }
    }

    if (currentSectionLines.length > 0) {
      sections.push({
        name: currentSectionName,
        lines: currentSectionLines,
        hierarchy: [...currentHierarchy]
      });
    }

    // 2. Chunk each section respecting maxChunkSize and overlap
    const chunks = [];

    for (const section of sections) {
      const sectionLines = section.lines;
      // Strip leading and trailing empty lines from the section
      let firstNonEmpty = 0;
      while (firstNonEmpty < sectionLines.length && sectionLines[firstNonEmpty].text.trim().length === 0) {
        firstNonEmpty++;
      }
      let lastNonEmpty = sectionLines.length - 1;
      while (lastNonEmpty >= firstNonEmpty && sectionLines[lastNonEmpty].text.trim().length === 0) {
        lastNonEmpty--;
      }

      if (firstNonEmpty > lastNonEmpty) {
        // Empty section (only whitespace)
        continue;
      }

      const activeLines = sectionLines.slice(firstNonEmpty, lastNonEmpty + 1);

      // Verify section contains meaningful body content beyond the heading itself
      const hasBodyText = activeLines.some((l, idx) => {
        if (idx === 0 && l.text.match(/^[ ]{0,3}#{1,6}\s+/)) {
          return false;
        }
        return l.text.trim().length > 0;
      });

      if (!hasBodyText) {
        // Skip low-information header-only section (e.g. consecutive parent heading)
        continue;
      }

      const fullSectionText = activeLines.map(l => l.text).join('\n');

      if (fullSectionText.length <= this.maxChunkSize) {
        const startLine = activeLines[0].lineNum;
        const endLine = activeLines[activeLines.length - 1].lineNum;
        chunks.push({
          id: `${filePath}#L${startLine}-L${endLine}`,
          text: `[${filePath}] Section: ${section.name}\n${fullSectionText}`,
          metadata: {
            filePath,
            startLine,
            endLine,
            section: section.name,
            hierarchy: section.hierarchy || [section.name]
          }
        });
        continue;
      }

      // Section exceeds maxChunkSize -> apply chunking with overlap
      let i = 0;
      while (i < activeLines.length) {
        // Handle oversized single line
        if (activeLines[i].text.length > this.maxChunkSize) {
          const lineText = activeLines[i].text;
          const lineNum = activeLines[i].lineNum;
          const step = Math.max(1, this.maxChunkSize - this.overlap);
          let charOffset = 0;
          let part = 1;
          while (charOffset < lineText.length) {
            const sliceText = lineText.slice(charOffset, charOffset + this.maxChunkSize);
            const partSuffix = part > 1 ? `-p${part}` : '';
            chunks.push({
              id: `${filePath}#L${lineNum}-L${lineNum}${partSuffix}`,
              text: `[${filePath}] Section: ${section.name}\n${sliceText}`,
              metadata: {
                filePath,
                startLine: lineNum,
                endLine: lineNum,
                section: section.name,
                hierarchy: section.hierarchy || [section.name]
              }
            });
            charOffset += step;
            part++;
          }
          i++;
          continue;
        }

        // Greedily collect lines within maxChunkSize
        let currentLength = activeLines[i].text.length;
        let j = i;
        while (j + 1 < activeLines.length) {
          const nextLen = currentLength + 1 + activeLines[j + 1].text.length;
          if (nextLen <= this.maxChunkSize) {
            currentLength = nextLen;
            j++;
          } else {
            break;
          }
        }

        const chunkText = activeLines.slice(i, j + 1).map(l => l.text).join('\n');
        const startLine = activeLines[i].lineNum;
        const endLine = activeLines[j].lineNum;

        chunks.push({
          id: `${filePath}#L${startLine}-L${endLine}`,
          text: `[${filePath}] Section: ${section.name}\n${chunkText}`,
          metadata: {
            filePath,
            startLine,
            endLine,
            section: section.name,
            hierarchy: section.hierarchy || [section.name]
          }
        });

        if (j === activeLines.length - 1) {
          break;
        }

        // Apply overlap for the next chunk
        let nextI = j + 1;
        if (this.overlap > 0) {
          let accumulatedOverlap = 0;
          for (let k = j; k > i; k--) {
            const lineLen = activeLines[k].text.length + (accumulatedOverlap > 0 ? 1 : 0);
            if (accumulatedOverlap + lineLen <= this.overlap) {
              accumulatedOverlap += lineLen;
              nextI = k;
            } else {
              break;
            }
          }
        }

        if (nextI <= i) {
          nextI = i + 1;
        }
        i = nextI;
      }
    }

    return chunks;
  }
}

module.exports = { DocumentChunker };
