FROM gitpod/workspace-full:latest

# Install gh and bun
RUN brew install gh oven-sh/bun/bun

ENV BUN_INSTALL="/home/gitpod/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install Claude Code
RUN bun install -g @anthropic-ai/claude-code
