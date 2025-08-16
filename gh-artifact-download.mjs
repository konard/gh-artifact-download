#!/usr/bin/env node

// Dynamically import command-stream using use-m
const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text());

const os = await use('os');
const path = await use('path');
const { unlinkSync } = await use('fs');
const { $, sh } = await use('command-stream');

// Check dependencies - using system which due to built-in which issue
try {
  await sh('/usr/bin/which gh', { mirror: false });
} catch {
  console.error('❌ GitHub CLI (gh) not found. Please install it.');
  process.exit(1);
}

try {
  await sh('/usr/bin/which aria2c', { mirror: false });
} catch {
  console.error("❌ aria2c not found. Please install it (e.g., 'brew install aria2').");
  process.exit(1);
}

// Check input
if (process.argv.length < 3) {
  console.error(`Usage: ${process.argv[1]} <GitHub artifact or workflow run URL>`);
  process.exit(1);
}

const url = process.argv[2];
const artifactMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/actions\/.*\/artifacts\/([0-9]+)/);
const runMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/actions\/runs\/([0-9]+)/);

if (!artifactMatch && !runMatch) {
  console.error('❌ Invalid URL format. Expected artifact or workflow run URL.');
  process.exit(1);
}

async function downloadArtifact(owner, repo, artifactId) {
  // Get artifact info
  const artifactData = JSON.parse(
    (await sh(`gh api -H "Accept: application/vnd.github+json" /repos/${owner}/${repo}/actions/artifacts/${artifactId}`, { mirror: false })).stdout
  );
  
  const token = (await sh('gh auth token', { mirror: false })).stdout.trim();
  
  // Get signed URL via curl with redirect
  const curlResponse = (await sh(`curl -s -I -H "Authorization: token ${token}" -H "User-Agent: gh-artifact-download" ${artifactData.archive_download_url}`, { mirror: false })).stdout;
  const locationMatch = curlResponse.match(/^location:\s*(.+)$/mi);
  if (!locationMatch) throw new Error('Failed to get redirect URL');
  const signedUrl = locationMatch[1].trim();
  
  // Download with aria2c - use separate directory and filename
  const tempDir = os.tmpdir();
  const tempFile = `gh-artifact-${artifactId}-${Date.now()}.zip`;
  const tempZip = path.join(tempDir, tempFile);
  
  console.log(`⬇️  Downloading to: ${tempZip}`);
  await $`aria2c -x 16 -s 16 -d ${tempDir} -o ${tempFile} ${signedUrl}`;
  console.log(`✅ Download complete`);
  
  // Extract to current directory
  const targetDir = process.cwd();
  console.log(`🗜️  Extracting to: ${targetDir}`);
  await $`unzip -o ${tempZip} -d ${targetDir}`;
  unlinkSync(tempZip);
  
  console.log(`✅ Extracted to: ${path.join(targetDir, artifactData.name)}`);
}

try {
  if (artifactMatch) {
    const [, owner, repo, artifactId] = artifactMatch;
    console.log(`🔍 Owner: ${owner}\n📦 Repo: ${repo}\n🆔 Artifact ID: ${artifactId}`);
    await downloadArtifact(owner, repo, artifactId);
  } else if (runMatch) {
    const [, owner, repo, runId] = runMatch;
    console.log(`🔍 Owner: ${owner}\n📦 Repo: ${repo}\n🏃 Run ID: ${runId}`);
    
    const artifacts = JSON.parse(
      (await sh(`gh api -H "Accept: application/vnd.github+json" /repos/${owner}/${repo}/actions/runs/${runId}/artifacts`, { mirror: false })).stdout
    ).artifacts || [];
    
    if (artifacts.length === 0) {
      console.log('📭 No artifacts found.');
    } else if (artifacts.length === 1) {
      console.log(`📂 Found single artifact: ${artifacts[0].name}`);
      await downloadArtifact(owner, repo, artifacts[0].id);
    } else {
      console.log(`\n📋 Found ${artifacts.length} artifacts:\n`);
      artifacts.forEach((a, i) => {
        console.log(`${i + 1}. ${a.name}`);
        console.log(`   Size: ${(a.size_in_bytes / (1024 * 1024)).toFixed(2)} MB`);
        console.log(`   URL: https://github.com/${owner}/${repo}/actions/runs/${runId}/artifacts/${a.id}\n`);
      });
    }
  }
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}