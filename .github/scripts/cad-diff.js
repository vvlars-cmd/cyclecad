#!/usr/bin/env node

/**
 * CAD Visual Diff Generator
 *
 * Detects CAD file changes in a PR, renders before/after previews,
 * creates side-by-side comparisons, and posts results as PR comment.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const core = require('@actions/core');
const github = require('@actions/github');

const DIFF_DIR = '.github/diffs';
const CAD_EXTENSIONS = ['.step', '.stp', '.stl', '.cyclecad', '.iam', '.ipt'];

/**
 * Get list of changed files from PR
 */
async function getChangedFiles() {
  try {
    const output = execSync(
      `git diff --name-only origin/${github.context.payload.pull_request.base.ref} HEAD`,
      { encoding: 'utf8' }
    ).trim();

    return output.split('\n').filter(file => {
      if (!file) return false;
      const ext = path.extname(file).toLowerCase();
      return CAD_EXTENSIONS.includes(ext);
    });
  } catch (error) {
    console.log('No changed files found or git error:', error.message);
    return [];
  }
}

/**
 * Get file status (added, modified, deleted)
 */
function getFileStatus(file, baseBranch) {
  try {
    const baseExists = execSync(
      `git cat-file -e origin/${baseBranch}:${file} 2>/dev/null && echo exists || echo missing`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    const headExists = fs.existsSync(file);

    if (baseExists === 'missing' && headExists) return 'added';
    if (baseExists === 'exists' && !headExists) return 'deleted';
    return 'modified';
  } catch {
    return headExists ? 'added' : 'deleted';
  }
}

/**
 * Extract geometry info from CAD files
 */
function analyzeCADFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { parts: 0, bbox: null, error: 'File not found' };
  }

  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.cyclecad') {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const parts = data.features ? data.features.length : 0;
      const bbox = data.bbox || null;
      return { parts, bbox, format: 'cycleCAD' };
    }

    if (ext === '.stl') {
      const buffer = fs.readFileSync(filePath);
      // Parse STL header for triangle count
      if (buffer.length >= 84) {
        const triangles = buffer.readUInt32LE(80);
        return { parts: 1, triangles, bbox: null, format: 'STL' };
      }
    }

    if (['.step', '.stp', '.iam', '.ipt'].includes(ext)) {
      // Basic file size check - larger files have more geometry
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(1);
      return { parts: 'unknown', size: sizeKB, format: ext.toUpperCase(), bbox: null };
    }

    if (ext === '.json') {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const parts = data.parts ? data.parts.length : 0;
      return { parts, bbox: data.bbox || null, format: 'JSON' };
    }

    return { parts: 'unknown', format: ext.toUpperCase() };
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message);
    return { parts: 'error', error: error.message };
  }
}

/**
 * Get file content from base branch
 */
function getFileFromBase(filePath, baseBranch) {
  try {
    const content = execSync(
      `git show origin/${baseBranch}:${filePath}`,
      { encoding: 'binary', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return Buffer.from(content, 'binary');
  } catch {
    return null;
  }
}

/**
 * Create temporary file for base version
 */
function createTempFile(content, filePath) {
  const fileName = path.basename(filePath);
  const tempDir = path.join(DIFF_DIR, 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `base-${Date.now()}-${fileName}`);
  fs.writeFileSync(tempPath, content);
  return tempPath;
}

/**
 * Generate HTML diff comparison
 */
function generateDiffHTML(file, beforeInfo, afterInfo, status) {
  const fileName = path.basename(file);
  const safeName = fileName.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  let beforeSection = '';
  let afterSection = '';
  let statusBadge = '';

  // Status badge
  switch (status) {
    case 'added':
      statusBadge = '✨ <strong>New File</strong>';
      break;
    case 'deleted':
      statusBadge = '🗑️ <strong>Deleted</strong>';
      break;
    case 'modified':
      statusBadge = '📝 <strong>Modified</strong>';
      break;
  }

  // Before section
  if (status === 'deleted') {
    beforeSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge deleted">Deleted</span>
        </div>
        <div class="no-content">
          File was deleted in this PR
        </div>
      </div>
    `;
  } else if (beforeInfo.error) {
    beforeSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge before">Before</span>
        </div>
        <div class="no-content">
          Unable to load: ${beforeInfo.error}
        </div>
      </div>
    `;
  } else {
    const partStr = typeof beforeInfo.parts === 'number'
      ? `Parts: <strong>${beforeInfo.parts}</strong>`
      : `Size: <strong>${beforeInfo.size} KB</strong>`;

    beforeSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge before">Before</span>
        </div>
        <div class="stats">
          ${partStr}
          ${beforeInfo.format ? `<br>Format: <code>${beforeInfo.format}</code>` : ''}
        </div>
        <div class="preview-placeholder">
          🔷 ${beforeInfo.format || 'CAD'} File Preview
        </div>
      </div>
    `;
  }

  // After section
  if (status === 'added') {
    afterSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge added">Added</span>
        </div>
        <div class="no-content">
          New file added in this PR
        </div>
      </div>
    `;
  } else if (afterInfo.error) {
    afterSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge after">After</span>
        </div>
        <div class="no-content">
          Unable to load: ${afterInfo.error}
        </div>
      </div>
    `;
  } else {
    const partStr = typeof afterInfo.parts === 'number'
      ? `Parts: <strong>${afterInfo.parts}</strong>`
      : `Size: <strong>${afterInfo.size} KB</strong>`;

    afterSection = `
      <div class="preview-box">
        <div class="file-info">
          <strong>${fileName}</strong>
          <span class="badge after">After</span>
        </div>
        <div class="stats">
          ${partStr}
          ${afterInfo.format ? `<br>Format: <code>${afterInfo.format}</code>` : ''}
        </div>
        <div class="preview-placeholder">
          🔷 ${afterInfo.format || 'CAD'} File Preview
        </div>
      </div>
    `;
  }

  // Calculate changes
  let changesSummary = '';
  if (status === 'modified' && typeof beforeInfo.parts === 'number' && typeof afterInfo.parts === 'number') {
    const partDiff = afterInfo.parts - beforeInfo.parts;
    const partChange = partDiff > 0
      ? `<span class="badge-success">+${partDiff} parts</span>`
      : partDiff < 0
        ? `<span class="badge-danger">${partDiff} parts</span>`
        : `<span class="badge-neutral">${afterInfo.parts} parts</span>`;

    changesSummary = `
      <div class="changes-summary">
        <strong>Changes:</strong> ${changesSummary}
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CAD Diff: ${fileName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #0d1117;
          color: #c9d1d9;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 6px;
          overflow: hidden;
        }
        .header {
          padding: 16px 20px;
          border-bottom: 1px solid #30363d;
          display: flex;
          align-items: center;
          gap: 12px;
          background: #0d1117;
        }
        .header-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .header-badge.modified { background: #1f6feb; color: #79c0ff; }
        .header-badge.added { background: #238636; color: #3fb950; }
        .header-badge.deleted { background: #da3633; color: #f85149; }
        .content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: #30363d;
          min-height: 300px;
        }
        .preview-box {
          background: #161b22;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .file-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #30363d;
        }
        .file-info strong {
          font-size: 13px;
          color: #e6edf3;
          word-break: break-all;
        }
        .file-info .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .badge.before { background: #1f6feb; color: #79c0ff; }
        .badge.after { background: #238636; color: #3fb950; }
        .badge.deleted { background: #da3633; color: #f85149; }
        .badge.added { background: #238636; color: #3fb950; }
        .stats {
          font-size: 12px;
          color: #8b949e;
          line-height: 1.6;
        }
        .stats code {
          background: #0d1117;
          padding: 2px 6px;
          border-radius: 3px;
          color: #79c0ff;
          font-family: "SFMono-Regular", Consolas, monospace;
        }
        .preview-placeholder {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0d1117;
          border: 1px dashed #30363d;
          border-radius: 6px;
          color: #6e7681;
          font-size: 14px;
          text-align: center;
          min-height: 200px;
        }
        .no-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0d1117;
          border: 1px dashed #30363d;
          border-radius: 6px;
          color: #6e7681;
          font-size: 13px;
          min-height: 200px;
        }
        .changes-summary {
          padding: 12px;
          background: #0d1117;
          border-radius: 6px;
          font-size: 12px;
          border-left: 3px solid #1f6feb;
        }
        .badge-success { color: #3fb950; }
        .badge-danger { color: #f85149; }
        .badge-neutral { color: #8b949e; }
        @media (max-width: 768px) {
          .content { grid-template-columns: 1fr; }
          .preview-box { min-height: 250px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="header-badge ${status}">${statusBadge}</span>
          <code style="color: #79c0ff;">${fileName}</code>
        </div>
        <div class="content">
          ${beforeSection}
          ${afterSection}
        </div>
        ${changesSummary}
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Create markdown comment for PR
 */
function createMarkdownComment(changes) {
  if (changes.length === 0) {
    return '';
  }

  let markdown = '## 🔧 CAD Visual Diff\n\n';
  markdown += `Detected **${changes.length}** CAD file change${changes.length !== 1 ? 's' : ''}:\n\n`;

  changes.forEach((change) => {
    const fileName = path.basename(change.file);
    const icon = change.status === 'added' ? '✨' : change.status === 'deleted' ? '🗑️' : '📝';

    markdown += `### ${icon} ${fileName}\n`;

    // Status line
    const statusLabel = change.status.charAt(0).toUpperCase() + change.status.slice(1);
    markdown += `**Status:** ${statusLabel}\n\n`;

    // Before/After info
    if (change.status !== 'added' && change.status !== 'deleted') {
      markdown += '| Property | Before | After |\n';
      markdown += '|----------|--------|-------|\n';

      const beforeParts = typeof change.beforeInfo.parts === 'number'
        ? change.beforeInfo.parts
        : change.beforeInfo.size
          ? `${change.beforeInfo.size} KB`
          : 'N/A';

      const afterParts = typeof change.afterInfo.parts === 'number'
        ? change.afterInfo.parts
        : change.afterInfo.size
          ? `${change.afterInfo.size} KB`
          : 'N/A';

      markdown += `| Parts/Size | ${beforeParts} | ${afterParts} |\n`;

      if (change.beforeInfo.format) {
        markdown += `| Format | ${change.beforeInfo.format} | ${change.afterInfo.format} |\n`;
      }

      if (typeof change.beforeInfo.parts === 'number' && typeof change.afterInfo.parts === 'number') {
        const diff = change.afterInfo.parts - change.beforeInfo.parts;
        const diffStr = diff > 0 ? `<span style="color:green">+${diff}</span>` : diff < 0 ? `<span style="color:red">${diff}</span>` : '0';
        markdown += `| Change | - | ${diffStr} |\n`;
      }
    } else if (change.status === 'added') {
      markdown += `- **Format:** ${change.afterInfo.format || 'Unknown'}\n`;
      if (typeof change.afterInfo.parts === 'number') {
        markdown += `- **Parts:** ${change.afterInfo.parts}\n`;
      }
      if (change.afterInfo.size) {
        markdown += `- **Size:** ${change.afterInfo.size} KB\n`;
      }
    } else if (change.status === 'deleted') {
      markdown += `- **Format:** ${change.beforeInfo.format || 'Unknown'}\n`;
      if (typeof change.beforeInfo.parts === 'number') {
        markdown += `- **Parts:** ${change.beforeInfo.parts}\n`;
      }
      if (change.beforeInfo.size) {
        markdown += `- **Size:** ${change.beforeInfo.size} KB\n`;
      }
    }

    markdown += '\n';
  });

  markdown += '> Generated by CAD Visual Diff GitHub Action\n';

  return markdown;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🔍 Scanning for CAD file changes...');

    // Create output directory
    fs.mkdirSync(DIFF_DIR, { recursive: true });

    // Get changed files
    const changedFiles = await getChangedFiles();
    console.log(`Found ${changedFiles.length} CAD files changed`);

    if (changedFiles.length === 0) {
      core.setOutput('comment_body', '');
      return;
    }

    const baseBranch = github.context.payload.pull_request.base.ref;
    const changes = [];

    // Process each changed file
    for (const file of changedFiles) {
      console.log(`\n📄 Processing: ${file}`);

      const status = getFileStatus(file, baseBranch);
      console.log(`   Status: ${status}`);

      let beforeInfo = { parts: 'unknown' };
      let afterInfo = { parts: 'unknown' };

      // Get before version
      if (status !== 'added') {
        const baseContent = getFileFromBase(file, baseBranch);
        if (baseContent) {
          const tempPath = createTempFile(baseContent, file);
          beforeInfo = analyzeCADFile(tempPath);
          try {
            fs.unlinkSync(tempPath);
          } catch { }
        } else {
          beforeInfo = { error: 'Could not retrieve base version' };
        }
      } else {
        beforeInfo = { error: 'File did not exist' };
      }

      // Get after version
      if (status !== 'deleted') {
        afterInfo = analyzeCADFile(file);
      } else {
        afterInfo = { error: 'File was deleted' };
      }

      console.log(`   Before: ${JSON.stringify(beforeInfo)}`);
      console.log(`   After: ${JSON.stringify(afterInfo)}`);

      // Generate HTML diff
      const diffHTML = generateDiffHTML(file, beforeInfo, afterInfo, status);
      const htmlPath = path.join(DIFF_DIR, `${path.basename(file, path.extname(file))}-diff.html`);
      fs.writeFileSync(htmlPath, diffHTML);
      console.log(`   Saved: ${htmlPath}`);

      changes.push({
        file,
        status,
        beforeInfo,
        afterInfo,
        htmlPath,
      });
    }

    // Create markdown comment
    const commentBody = createMarkdownComment(changes);
    console.log('\n✅ Generated markdown comment');

    core.setOutput('comment_body', commentBody);
    core.setOutput('changes_count', changes.length);

  } catch (error) {
    console.error('❌ Error:', error.message);
    core.setFailed(error.message);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { getChangedFiles, analyzeCADFile, generateDiffHTML, createMarkdownComment };
