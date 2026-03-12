# AI Home Ecommerce — Deployment Guide

From a fresh Ubuntu server to a running application.

## Prerequisites

- Ubuntu 20.04+ (tested on 22.04)
- Root or sudo access
- At least 2GB RAM, 10GB disk
- An OpenRouter API key (get one at https://openrouter.ai/keys)

---

## 1. Install System Dependencies

```bash
sudo apt update && sudo apt install -y \
  python3.10 python3.10-venv python3-pip \
  postgresql postgresql-contrib \
  redis-server \
  git curl build-essential

# Install Node.js 20 via NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

Verify versions:

```bash
python3 --version   # 3.10+
node --version      # 20+
psql --version      # 14+
redis-cli ping      # PONG
```

---

## 2. Set Up PostgreSQL

```bash
# Start PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql <<'SQL'
CREATE DATABASE ai_home_ecommerce;
CREATE USER appuser WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE ai_home_ecommerce TO appuser;
-- Connect to the new DB to set schema permissions
\c ai_home_ecommerce
GRANT ALL ON SCHEMA public TO appuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO appuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO appuser;
SQL
```

> Note: Remember the username and password — you'll need them for `.env`.

---

## 3. Set Up Redis

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping  # Should return PONG
```

---

## 4. Clone the Project

```bash
mkdir -p ~/projects && cd ~/projects
# Copy the project to the new server (scp, rsync, or git clone)
# Example with rsync from the old server:
#   rsync -avz --exclude 'node_modules' --exclude 'venv' --exclude '.next' \
#     old-server:~/projects/e2/ ~/projects/e2/

cd ~/projects/e2
```

Make sure `homary.json` (66MB product data) is at `~/projects/e2/homary.json`.

---

## 5. Backend Setup

### 5.1 Create Virtual Environment & Install Dependencies

```bash
cd ~/projects/e2/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 5.2 Configure Environment Variables

```bash
cat > .env <<'EOF'
DATABASE_URL=postgresql://appuser:your_secure_password@localhost:5432/ai_home_ecommerce

LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-v1-your-openrouter-key-here
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=google/gemini-2.0-flash-001
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=4000

OPENROUTER_SITE_URL=https://ai-home-ecommerce.demo
OPENROUTER_SITE_NAME=AI Home Ecommerce
EOF
```

Replace `your_secure_password` and `sk-or-v1-...` with your actual values.

You can change `LLM_MODEL` to any model on OpenRouter, e.g.:
- `google/gemini-2.0-flash-001` (fast, cheap)
- `anthropic/claude-sonnet-4` (high quality)
- `openai/gpt-4o-mini` (balanced)

### 5.3 Import Product Data into PostgreSQL

The import script reads `homary.json`, deduplicates by SKU, fixes image URLs, and inserts ~4,500 products.

Before running, edit the DB connection in the script to match your setup:

```bash
# Edit the DB_CONFIG in clean_and_import.py if your PostgreSQL uses TCP instead of Unix socket
# Default config uses Unix socket (host=/var/run/postgresql, user=postgres)
# If you created a password-based user, change it to:
#   DB_CONFIG = {
#       'host': 'localhost',
#       'port': 5432,
#       'user': 'appuser',
#       'password': 'your_secure_password',
#       'database': 'ai_home_ecommerce'
#   }
```

Then run:

```bash
cd ~/projects/e2/backend
source venv/bin/activate
python3 scripts/clean_and_import.py
```

Expected output:

```
Loading: /home/.../homary.json
Cleaning stats:
  Total records: 4589
  Valid products: 4522
Rebuilding products table...
Table created.
  Inserted 200/4522
  ...
Import complete: 4522 products
✅ Done!
```

> Note: This script DROP+CREATEs the `products` table. Other tables (sessions, orders, etc.) are auto-created on backend startup.

### 5.4 Start Backend

```bash
cd ~/projects/e2/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Verify:

```bash
curl http://localhost:8000/health
# {"status": "healthy"}

curl http://localhost:8000/api/products/featured?limit=2
# Should return product data with images
```

---

## 6. Frontend Setup

### 6.1 Install Dependencies

```bash
cd ~/projects/e2/frontend/ai-home-ecommerce
npm install
```

### 6.2 Configure API URL (Optional)

If the backend runs on a different host/port, set environment variables before starting:

```bash
export NEXT_PUBLIC_API_URL=http://your-backend-host:8000
export NEXT_PUBLIC_WS_URL=ws://your-backend-host:8000
```

Default is `http://localhost:8000` (backend on same machine).

### 6.3 Start Frontend

Development mode:

```bash
npm run dev
# Listening on http://0.0.0.0:3000
```

Production build:

```bash
npm run build
npm run start
```

---

## 7. Verify Everything Works

1. Open `http://<server-ip>:3000` in your browser
2. Homepage should show real product images (from PostgreSQL)
3. Click **Get Started** → enter a message like "Budget $3,000 cozy living room"
4. Agent timeline should animate, then redirect to Packages page with 3 schemes
5. Select a package → Order page

---

## 8. Run as Background Services (Optional)

### Using systemd

**Backend** — `/etc/systemd/system/ai-home-backend.service`:

```ini
[Unit]
Description=AI Home Backend
After=postgresql.service redis-server.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/projects/e2/backend
Environment="PATH=/home/ubuntu/projects/e2/backend/venv/bin:/usr/bin"
ExecStart=/home/ubuntu/projects/e2/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

**Frontend** — `/etc/systemd/system/ai-home-frontend.service`:

```ini
[Unit]
Description=AI Home Frontend
After=ai-home-backend.service

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/projects/e2/frontend/ai-home-ecommerce
Environment="PATH=/home/ubuntu/.nvm/versions/node/v20.20.1/bin:/usr/bin"
ExecStart=/home/ubuntu/.nvm/versions/node/v20.20.1/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# First do a production build
cd ~/projects/e2/frontend/ai-home-ecommerce && npm run build

sudo systemctl daemon-reload
sudo systemctl enable ai-home-backend ai-home-frontend
sudo systemctl start ai-home-backend ai-home-frontend
```

---

## Quick Reference

| Component    | Port  | Start Command                                                |
| ------------ | ----- | ------------------------------------------------------------ |
| PostgreSQL   | 5432  | `sudo systemctl start postgresql`                            |
| Redis        | 6379  | `sudo systemctl start redis-server`                          |
| Backend API  | 8000  | `cd backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000` |
| Frontend     | 3000  | `cd frontend/ai-home-ecommerce && npm run dev`               |

| Environment Variable     | Where         | Purpose                        |
| ------------------------ | ------------- | ------------------------------ |
| `DATABASE_URL`           | backend/.env  | PostgreSQL connection string   |
| `LLM_API_KEY`            | backend/.env  | OpenRouter API key             |
| `LLM_MODEL`              | backend/.env  | LLM model name                 |
| `NEXT_PUBLIC_API_URL`    | frontend env  | Backend API URL for browser    |
| `NEXT_PUBLIC_WS_URL`     | frontend env  | WebSocket URL for browser      |

---

## Troubleshooting

**"must be owner of table products"** — Non-fatal warning on startup. Means the DB user doesn't own the table (created by `postgres` user via import script). Fix by running: `sudo -u postgres psql -d ai_home_ecommerce -c "ALTER TABLE products OWNER TO appuser;"`

**"relation agent_activities does not exist"** — The import script only creates the `products` table. Other tables are auto-created on first backend startup. Just restart the backend once.

**LLM 401 error** — Your OpenRouter API key is invalid or expired. Check `LLM_API_KEY` in `.env`. The app still works with fallback demo schemes even without a valid LLM key.

**Frontend can't reach backend** — Check CORS. If accessing from a non-localhost domain, add it to `CORS_ORIGINS` in `backend/app/core/config.py` or set the env var.

**WebSocket timeout** — Normal when using SSH port forwarding. WebSocket is optional; all features work via HTTP.
