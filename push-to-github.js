import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OWNER = 'lgonzalez290';
const REPO = 'SnapSaver';
const BRANCH = 'main';

if (!GITHUB_TOKEN) {
  console.log('Getting token from GitHub CLI...');
  try {
    const output = execSync('gh auth token', { encoding: 'utf8' });
    process.env.GITHUB_TOKEN = output.trim();
    console.log('Token retrieved from GitHub CLI');
  } catch (e) {
    console.error('Failed to get token:', e.message);
    process.exit(1);
  }
}

async function pushToGitHub() {
  const api = `https://api.github.com/repos/${OWNER}/${REPO}`;
  
  // Get the commit SHA from git
  const commitSha = execSync('git rev-parse HEAD', { cwd: '.', encoding: 'utf8' }).trim();
  console.log(`Pushing commit: ${commitSha}`);
  
  try {
    // Update the ref to point to the new commit
    const response = await fetch(`${api}/git/refs/heads/${BRANCH}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sha: commitSha, force: false })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Error updating ref: ${response.status}`);
      console.error(error);
      
      // Try creating the ref if it doesn't exist
      if (response.status === 422) {
        console.log('Ref does not exist, creating...');
        const createResponse = await fetch(`${api}/git/refs`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commitSha })
        });
        
        if (createResponse.ok) {
          console.log('✓ Successfully pushed to GitHub!');
          console.log(`Repository: https://github.com/${OWNER}/${REPO}`);
        } else {
          console.error(`Failed to create ref: ${createResponse.status}`);
        }
      }
    } else {
      console.log('✓ Successfully pushed to GitHub!');
      console.log(`Repository: https://github.com/${OWNER}/${REPO}`);
    }
  } catch (error) {
    console.error('Push failed:', error);
    process.exit(1);
  }
}

pushToGitHub();
