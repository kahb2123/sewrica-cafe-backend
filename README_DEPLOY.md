# Deploying sewrica-cafe-backend

This file explains deployment options and required secrets.

Recommended: Render (managed) or connect repository to Vercel for full-stack deploy. Alternatively, use Docker image from GitHub Container Registry.

Required secrets for full automation (GitHub repository Settings → Secrets):

- `RENDER_API_KEY` (if using Render deploy action)
- `RENDER_SERVICE_ID` (service id for your Render service)

Optional: GitHub Packages / GHCR auth is handled by the workflow using `GITHUB_TOKEN`.

Manual steps (Render):
1. Create a Render Web Service, connect your GitHub repo.
2. Set environment variables (MONGO_URI, JWT_SECRET, NODE_ENV=production, etc.) in Render dashboard.
3. Deploy.
