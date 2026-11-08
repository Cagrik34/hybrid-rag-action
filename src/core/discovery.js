/**
 * Safe Recursive Document Collector.
 * Discovers markdown and configuration documents while preventing directory traversal attacks.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SUPPORTED_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.yml', '.yaml']);
const DEFAULT_IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist']);

/**
 * Collects and reads document files from comma-separated file and directory paths.
 * Enforces repository/workspace boundary protections to prevent directory traversal.
 *
 * @param {string} docsPathInput Comma-separated paths of files or directories
 * @param {Object} [options]
 * @param {string} [options.rootDir] Workspace root directory (defaults to process.cwd())
 * @param {Set<string>} [options.supportedExtensions] Allowed file extensions
 * @param {Set<string>} [options.ignoredDirectories] Directory names to skip
 * @returns {Array<{filePath: string, absolutePath: string, content: string}>} Sorted list of documents
 */
function collectDocuments(docsPathInput, options = {}) {
  if (!docsPathInput || typeof docsPathInput !== 'string') {
    return [];
  }

  const rootDir = path.resolve(options.rootDir || process.env.GITHUB_WORKSPACE || process.cwd());
  const supportedExtensions = options.supportedExtensions || DEFAULT_SUPPORTED_EXTENSIONS;
  const ignoredDirectories = options.ignoredDirectories || DEFAULT_IGNORED_DIRECTORIES;

  // Resolve root realpath to handle symlinks in root itself safely
  let canonicalRoot = rootDir;
  try {
    if (fs.existsSync(rootDir)) {
      canonicalRoot = fs.realpathSync(rootDir);
    }
  } catch {
    canonicalRoot = rootDir;
  }

  const collectedFiles = new Map(); // relativePath -> { filePath, absolutePath, content }
  const entries = docsPathInput.split(',').map(s => s.trim()).filter(Boolean);

  function isInsideRoot(candidatePath) {
    const relFromRoot = path.relative(rootDir, candidatePath);
    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      return false;
    }
    // Also verify canonical/resolved realpath to prevent symlink traversal outside root
    try {
      if (fs.existsSync(candidatePath)) {
        const canonicalCandidate = fs.realpathSync(candidatePath);
        const relFromCanonical = path.relative(canonicalRoot, canonicalCandidate);
        if (relFromCanonical.startsWith('..') || path.isAbsolute(relFromCanonical)) {
          return false;
        }
      }
    } catch {
      return false;
    }
    return true;
  }

  function walkDirectory(currentDir) {
    let dirEntries;
    try {
      dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort entries for deterministic directory traversal order
    dirEntries.sort((a, b) => a.name.localeCompare(b.name));

    for (const ent of dirEntries) {
      const fullPath = path.join(currentDir, ent.name);

      if (!isInsideRoot(fullPath)) {
        continue;
      }

      if (ent.isDirectory()) {
        if (ignoredDirectories.has(ent.name)) {
          continue;
        }
        walkDirectory(fullPath);
      } else if (ent.isFile() || ent.isSymbolicLink()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (supportedExtensions.has(ext)) {
          addFile(fullPath);
        }
      }
    }
  }

  function addFile(targetPath) {
    if (!isInsideRoot(targetPath)) {
      return;
    }

    try {
      const stat = fs.statSync(targetPath);
      if (!stat.isFile()) return;

      const relPath = path.relative(rootDir, targetPath).replace(/\\/g, '/');
      if (collectedFiles.has(relPath)) return;

      const content = fs.readFileSync(targetPath, 'utf8');
      collectedFiles.set(relPath, {
        filePath: relPath,
        absolutePath: targetPath,
        content
      });
    } catch {
      // Skip files that cannot be read
    }
  }

  for (const entry of entries) {
    const targetPath = path.resolve(rootDir, entry);

    if (!isInsideRoot(targetPath)) {
      // Path traversal outside workspace boundary -> skip safely
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      continue;
    }

    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        const baseName = path.basename(targetPath);
        if (ignoredDirectories.has(baseName)) {
          continue;
        }
        walkDirectory(targetPath);
      } else if (stat.isFile()) {
        const ext = path.extname(targetPath).toLowerCase();
        if (supportedExtensions.has(ext)) {
          addFile(targetPath);
        }
      }
    } catch {
      // Skip on error
    }
  }

  // Return deterministically sorted list of documents
  const sortedKeys = Array.from(collectedFiles.keys()).sort();
  return sortedKeys.map(k => collectedFiles.get(k));
}

module.exports = {
  collectDocuments,
  DEFAULT_SUPPORTED_EXTENSIONS,
  DEFAULT_IGNORED_DIRECTORIES
};
