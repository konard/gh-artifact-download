# .gitpod.Dockerfile

FROM gitpod/workspace-full

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
ENV BUN_INSTALL="/home/gitpod/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"