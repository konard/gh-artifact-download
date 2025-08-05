FROM gitpod/workspace-full:latest

# Install gh
RUN sudo apt-get update && \
    sudo apt-get install -y gh && \
    sudo rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV BUN_INSTALL="/home/gitpod/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install Claude Code
RUN $BUN_INSTALL/bin/bun install -g @anthropic-ai/claude-code
