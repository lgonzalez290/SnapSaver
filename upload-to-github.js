import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'lgonzalez290';
const REPO = 'SnapSaver';
const BRANCH = 'main';

if (!GITHUB_TOKEN) {
  console.error('GITHUB_TOKEN not set');
  process.exit(1);
}

const api = `https://api.github.com/repos/${OWNER}/${REPO}`;

function getFileTree(dir, base = '.') {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    if (['node_modules', '.git', 'dist', '.gitignore'].includes(item.name)) continue;
    
    const fullPath = path.join(dir, item.name);
    const relativePath = path.join(base, item.name);
    
    if (item.isDirectory()) {
      files.push(...getFileTree(fullPath, relativePath));
    } else {
      files.push(relativePath.replace(/\\/g, '/'));
    }
  }
  
  return files;
}

async function uploadFiles() {
  try {
    console.log('Getting file tree...');
    const files = getFileTree(__dirname);
    console.log(`Found ${files.length} files`);
    
    const blobs = {};
    
    // Create blobs for each file
    console.log('Creating blobs...');
    for (const file of files) {
      const fullPath = path.join(__dirname, file);
      const content = fs.readFileSync(fullPath);
      const isText = !Buffer.isBuffer(content) || content.toString('utf8', 0, 512).includes('\0') === false;
      
      const blob = await fetch(`${api}/git/blobs`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: content.toString(isText ? 'utf8' : 'base64'),
          encoding: isText ? 'utf-8' : 'base64'
        })
      });
      
      if (!blob.ok) {
        console.error(`Failed to create blob for ${file}`);
        continue;
      }
      
      const blobData = await blob.json();
      blobs[file] = blobData.sha;
    }
    
    console.log(`Created ${Object.keys(blobs).length} blobs`);
    
    // Create tree
    console.log('Creating tree...');
    const treeData = Object.entries(blobs).map(([file, sha]) => ({
      path: file,
      mode: '100644',
      type: 'blob',
      sha: sha
    }));
    
    const treeResponse = await fetch(`${api}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tree: treeData,
        base_tree: null
      })
    });
    
    if (!treeResponse.ok) {
      console.error('Failed to create tree:', treeResponse.status);
      const error = await treeResponse.json();
      console.error(error);
      return;
    }
    
    const treeInfo = await treeResponse.json();
    console.log(`Created tree: ${treeInfo.sha}`);
    
    // Create commit
    console.log('Creating commit...');
    const commitResponse = await fetch(`${api}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Initial commit: SnapSaver Vite React app with Tailwind styling',
        tree: treeInfo.sha,
        parents: []
      })
    });
    
    if (!commitResponse.ok) {
      console.error('Failed to create commit:', commitResponse.status);
      const error = await commitResponse.json();
      console.error(error);
      return;
    }
    
    const commitInfo = await commitResponse.json();
    console.log(`Created commit: ${commitInfo.sha}`);
    
    // Update ref
    console.log('Updating ref...');
    const refResponse = await fetch(`${api}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sha: commitInfo.sha,
        force: true
      })
    });
    
    if (!refResponse.ok) {
      if (refResponse.status === 422) {
        // Create new ref
        const createRefResponse = await fetch(`${api}/git/refs`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: `refs/heads/${BRANCH}`,
            sha: commitInfo.sha
          })
        });
        
        if (!createRefResponse.ok) {
          console.error('Failed to create ref:', createRefResponse.status);
          const error = await createRefResponse.json();
          console.error(error);
          return;
        }
        
        console.log('✓ Successfully pushed to GitHub!');
      } else {
        console.error('Failed to update ref:', refResponse.status);
        const error = await refResponse.json();
        console.error(error);
        return;
      }
    } else {
      console.log('✓ Successfully pushed to GitHub!');
    }
    
    console.log(`Repository: https://github.com/${OWNER}/${REPO}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

uploadFiles();
