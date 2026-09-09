# 🔐 Crack the Code — Admin Console & Backend Server

Admin-only control panel and backend Node.js server for managing the "Crack the Code" event.

## 🚀 Setup & Running

### 1. Start Backend Server
```bash
cd server
npm install
npm start
```

### 2. Access Admin Panel
- Open `index.html` (or access `http://localhost:4000/admin`).
- Enter your `ADMIN_KEY` (default: `admin123` or set `ADMIN_KEY` in `server/.env`).
- Generate challenge sets with Gemini API, release rounds, score Round 3 live, and track the live leaderboard.
