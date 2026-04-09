# Deploying Structured Memory

Self-host on any Linux server. A $6/mo DigitalOcean Droplet or equivalent is plenty.

---

## Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 512 MB | 1 GB |
| Disk | 10 GB | 20 GB+ (scales with your data) |
| OS | Ubuntu 22.04+ / Debian 12+ / any Linux | — |
| Software | Docker + Docker Compose | — |

**$6/mo DigitalOcean Droplet** (1 vCPU, 1 GB RAM) works perfectly for personal use.  
**$12/mo** if you expect heavy query load or large Parquet files.

---

## 1. Provision a server

Tested providers: DigitalOcean, Hetzner, Linode, Vultr, AWS Lightsail.

```bash
# Example: DigitalOcean CLI
doctl compute droplet create structured \
  --image ubuntu-22-04-x64 \
  --size s-1vcpu-1gb \
  --region nyc3 \
  --ssh-keys YOUR_KEY_ID
```

Or just create one manually from the provider's dashboard.

---

## 2. Install Docker

```bash
# Connect to your server
ssh root@YOUR_SERVER_IP

# Install Docker (official script)
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker compose version
```

---

## 3. Clone and configure

```bash
git clone https://github.com/structured-sh/structured.git
cd structured
```

Edit `docker-compose.yml` — **required before starting**:

```yaml
services:
  api:
    environment:
      - API_KEY=sk_your_strong_random_key       # ← CHANGE THIS
      - DASHBOARD_PASSWORD=your_dashboard_pass  # ← CHANGE THIS
```

**Generating a strong API key:**
```bash
openssl rand -hex 32
# example output: a3f8c2d1e4b7f9a2c5d8e1f4b7c2a5d8...
```

> **Security notes:**
> - `API_KEY` is used by MCP clients, scripts, and any programmatic access
> - `DASHBOARD_PASSWORD` protects the web UI — leave unset to disable login (local-only)
> - Never commit `docker-compose.yml` with real credentials — use a `.env` file (see below)

### Using a .env file (recommended)

```bash
# Create .env
cat > .env << EOF
API_KEY=sk_your_strong_random_key
DASHBOARD_PASSWORD=your_dashboard_pass
EOF

chmod 600 .env
```

Then reference in `docker-compose.yml`:
```yaml
environment:
  - API_KEY=${API_KEY}
  - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
```

---

## 4. Start the stack

```bash
docker compose up -d

# Check all 3 containers are healthy
docker compose ps
```

| Container | Port | What it is |
|---|---|---|
| `structured-api` | 3001 | REST API + MCP SSE |
| `structured-dashboard` | 3000 | Web UI |
| `structured-mcp` | stdio | MCP stdio transport |

---

## 5. Configure SSL / HTTPS (recommended for remote access)

If you're accessing from outside the server (e.g. connecting Claude Desktop to a remote instance), you need HTTPS. The simplest approach is **Caddy** as a reverse proxy — it handles SSL certificates automatically.

### Install Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

### Point your domain

Add an A record for your domain pointing to your server IP:
```
api.yourdomain.com  A  YOUR_SERVER_IP
app.yourdomain.com  A  YOUR_SERVER_IP
```

### Configure Caddy

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
api.yourdomain.com {
    reverse_proxy localhost:3001
}

app.yourdomain.com {
    reverse_proxy localhost:3000
}
EOF

systemctl reload caddy
```

Caddy automatically provisions Let's Encrypt certificates. No manual SSL setup needed.

### Update your MCP config

Once behind HTTPS, Claude Desktop can connect remotely using the SSE transport:

```json
{
  "mcpServers": {
    "structured": {
      "command": "npx",
      "args": ["-y", "@openai/mcp-proxy", "https://api.yourdomain.com/sse"]
    }
  }
}
```

---

## 6. Firewall

Only expose what's needed:

```bash
# UFW (Ubuntu)
ufw allow ssh
ufw allow 80   # Caddy HTTP (for cert renewal)
ufw allow 443  # Caddy HTTPS
ufw deny 3000  # Block direct dashboard access (Caddy handles it)
ufw deny 3001  # Block direct API access (Caddy handles it)
ufw enable
```

---

## 7. Data persistence

All data is stored in `./data/` on the host machine (mounted into containers):

```
./data/
├── structured.db          ← SQLite metadata (schemas, stats)
└── parquet/               ← Your Parquet files
    ├── memory_name/
    │   └── 2026/04/09/
    │       └── *.parquet
    └── ...
```

**Backup:**
```bash
# Simple tar backup
tar -czf structured-backup-$(date +%Y%m%d).tar.gz ./data/

# Or rsync to another machine
rsync -avz ./data/ user@backup-server:/backups/structured/
```

---

## 8. Auto-restart on reboot

The containers are already configured with `restart: unless-stopped` in `docker-compose.yml`. To ensure Docker itself starts on boot:

```bash
systemctl enable docker
```

---

## 9. Updating

```bash
cd structured
git pull
docker compose down
docker compose up -d --build
```

---

## Minimal setup (local network only)

If you're running on a home server or local machine with no external access, you can skip SSL entirely:

```bash
# Just set credentials and start
docker compose up -d
```

Access at:
- Dashboard: `http://YOUR_LOCAL_IP:3000`
- API: `http://YOUR_LOCAL_IP:3001`

For MCP, use the stdio transport (Docker exec) — it works locally without any network configuration.

---

## Troubleshooting

```bash
# View logs
docker compose logs -f

# View just API logs
docker compose logs -f api

# Check container health
docker compose ps

# Restart a single service
docker compose restart api

# Full reset (keeps data)
docker compose down && docker compose up -d --build
```

**Common issues:**

| Problem | Fix |
|---|---|
| Dashboard shows "API offline" | Check `docker compose ps` — API container may not be healthy yet |
| 401 Unauthorized | Verify `API_KEY` in docker-compose matches what you're sending |
| Port already in use | Change `3000:3000` or `3001:3001` in docker-compose.yml |
| Can't connect from Claude Desktop remotely | Add HTTPS via Caddy (section 5) |
