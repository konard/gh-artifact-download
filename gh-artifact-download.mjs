#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import https from 'https';

function checkCommand(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function getWorkflowArtifacts(owner, repo, runId) {
  try {
    const artifactsData = JSON.parse(
      execSync(`gh api -H "Accept: application/vnd.github+json" /repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, 
        { encoding: 'utf8' })
    );
    
    return artifactsData.artifacts || [];
  } catch (error) {
    throw new Error(`Failed to retrieve workflow artifacts: ${error.message}`);
  }
}

async function getArtifactInfo(owner, repo, artifactId) {
  try {
    // Get artifact info
    const artifactData = JSON.parse(
      execSync(`gh api -H "Accept: application/vnd.github+json" /repos/${owner}/${repo}/actions/artifacts/${artifactId}`, 
        { encoding: 'utf8' })
    );
    
    const downloadUrl = artifactData.archive_download_url;
    const originalName = artifactData.name;
    
    if (!downloadUrl) {
      throw new Error('No download URL found in artifact data');
    }

    // Get auth token
    const token = execSync('gh auth token', { encoding: 'utf8' }).trim();

    // Follow redirect to get signed URL
    const signedUrl = await new Promise((resolve, reject) => {
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

    return { signedUrl, originalName };
  } catch (error) {
    throw new Error(`Failed to retrieve artifact info: ${error.message}`);
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
    console.error(`Usage: ${process.argv[1]} <GitHub artifact or workflow run URL>`);
    process.exit(1);
  }

  const url = process.argv[2];

  // Try to match artifact URL first
  const artifactMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/actions\/.*\/artifacts\/([0-9]+)/);
  
  // Try to match workflow run URL
  const runMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/actions\/runs\/([0-9]+)/);
  
  if (!artifactMatch && !runMatch) {
    console.error('❌ Invalid URL format. Expected artifact or workflow run URL.');
    process.exit(1);
  }

  if (artifactMatch) {
    // Handle single artifact download
    const [, owner, repo, artifactId] = artifactMatch;

    console.log(`🔍 Owner: ${owner}`);
    console.log(`📦 Repo: ${repo}`);
    console.log(`🆔 Artifact ID: ${artifactId}`);

    try {
      // Get artifact info and signed URL
      const { signedUrl, originalName } = await getArtifactInfo(owner, repo, artifactId);

      console.log(`📂 Output file: ${originalName}`);

      // Download using aria2c
      console.log('⬇️  Downloading with aria2c...');
      await downloadWithAria2c(signedUrl, originalName);

      console.log(`✅ Download complete: ${originalName}`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  } else if (runMatch) {
    // Handle workflow run - list all artifacts
    const [, owner, repo, runId] = runMatch;

    console.log(`🔍 Owner: ${owner}`);
    console.log(`📦 Repo: ${repo}`);
    console.log(`🏃 Workflow Run ID: ${runId}`);

    try {
      const artifacts = await getWorkflowArtifacts(owner, repo, runId);
      
      if (artifacts.length === 0) {
        console.log('📭 No artifacts found for this workflow run.');
        return;
      }
      
      if (artifacts.length === 1) {
        // Single artifact - download it directly
        const artifact = artifacts[0];
        console.log(`📂 Found single artifact: ${artifact.name}`);
        
        const { signedUrl, originalName } = await getArtifactInfo(owner, repo, artifact.id);
        
        console.log('⬇️  Downloading with aria2c...');
        await downloadWithAria2c(signedUrl, originalName);
        
        console.log(`✅ Download complete: ${originalName}`);
      } else {
        // Multiple artifacts - list them
        console.log(`\n📋 Found ${artifacts.length} artifacts:`);
        console.log('\nTo download a specific artifact, use one of these URLs:');
        
        artifacts.forEach((artifact, index) => {
          const artifactUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}/artifacts/${artifact.id}`;
          console.log(`\n${index + 1}. ${artifact.name}`);
          console.log(`   Size: ${(artifact.size_in_bytes / (1024 * 1024)).toFixed(2)} MB`);
          console.log(`   Created: ${new Date(artifact.created_at).toLocaleString()}`);
          console.log(`   URL: ${artifactUrl}`);
        });
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  }
}

main().catch(console.error);