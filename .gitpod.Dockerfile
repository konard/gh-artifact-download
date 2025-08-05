FROM gitpod/workspace-full:latest

# Install gh and bun
RUN brew install gh oven-sh/bun/bun

# Install Claude Code
RUN bun install -g @anthropic-ai/claude-code
