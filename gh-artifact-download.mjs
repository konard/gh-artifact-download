#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { promisify } from 'util';
import { basename } from 'path';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';

const execAsync = promisify(execSync);

function checkCommand(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function getSignedUrl(owner, repo, artifactId) {
  try {
    // Get artifact info
    const artifactData = JSON.parse(
      execSync(`gh api -H "Accept: application/vnd.github+json" /repos/${owner}/${repo}/actions/artifacts/${artifactId}`, 
        { encoding: 'utf8' })
    );
    
    const downloadUrl = artifactData.archive_download_url;
    if (!downloadUrl) {
      throw new Error('No download URL found in artifact data');
    }

    // Get auth token
    const token = execSync('gh auth token', { encoding: 'utf8' }).trim();

    // Follow redirect to get signed URL
    return new Promise((resolve, reject) => {
      const request = https.request(downloadUrl, {
        method: 'HEAD',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'gh-artifact-download'
        }
      }, (res) => {
        const location = res.headers.location;
        if (location) {
          resolve(location);
        } else {
          reject(new Error('No redirect location found'));
        }
      });
      
      request.on('error', reject);
      request.end();
    });
  } catch (error) {
    throw new Error(`Failed to retrieve signed blob URL: ${error.message}`);
  }
}

function downloadWithAria2c(url, filename) {
  return new Promise((resolve, reject) => {
    const aria2c = spawn('aria2c', ['-x', '16', '-s', '16', '-o', filename, url], {
      stdio: 'inherit'
    });

    aria2c.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`aria2c exited with code ${code}`));
      }
    });

    aria2c.on('error', reject);
  });
}

async function main() {
  // Check dependencies
  if (!checkCommand('gh')) {
    console.error('❌ GitHub CLI (gh) not found. Please install it.');
    process.exit(1);
  }

  if (!checkCommand('aria2c')) {
    console.error("❌ aria2c not found. Please install it (e.g., 'brew install aria2').");
    process.exit(1);
  }

  // Check input
  if (process.argv.length < 3) {
    console.error(`Usage: ${process.argv[1]} <GitHub artifact URL>`);
    process.exit(1);
  }

  const artifactUrl = process.argv[2];

  // Extract owner, repo, artifact_id
  const match = artifactUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/actions\/.*\/artifacts\/([0-9]+)/);
  if (!match) {
    console.error('❌ Invalid artifact URL format.');
    process.exit(1);
  }

  const [, owner, repo, artifactId] = match;

  console.log(`🔍 Owner: ${owner}`);
  console.log(`📦 Repo: ${repo}`);
  console.log(`🆔 Artifact ID: ${artifactId}`);

  try {
    // Fetch signed Azure blob URL
    const signedUrl = await getSignedUrl(owner, repo, artifactId);

    // Extract filename from URL
    const filename = basename(signedUrl.split('?')[0]);
    console.log(`📂 Output file: ${filename}`);

    // Download using aria2c
    console.log('⬇️  Downloading with aria2c...');
    await downloadWithAria2c(signedUrl, filename);

    console.log(`✅ Download complete: ${filename}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);