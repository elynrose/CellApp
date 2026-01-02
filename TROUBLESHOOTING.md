# Troubleshooting 404 Error on /api/llm

## Issue
Getting `404 (Not Found)` when calling `/api/llm` endpoint through Vite dev server.

## Quick Fix Steps

### 1. Restart Vite Dev Server
**This is the most common fix!** Vite needs to be restarted for proxy configuration changes to take effect.

1. Stop the Vite dev server (Ctrl+C in the terminal where it's running)
2. Restart it:
   ```bash
   npm run dev
   ```

### 2. Verify Backend Server is Running
The backend server should be running on port 3000:

```bash
# Check if server is running
netstat -ano | findstr :3000

# If not running, start it:
npm run server
```

### 3. Test Backend Directly
Test if the backend is responding:

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test API endpoint directly (PowerShell)
$body = @{prompt="test";model="gpt-3.5-turbo"} | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:3000/api/llm" -Method POST -Body $body -ContentType "application/json"
```

### 4. Check Proxy Configuration
The Vite proxy should forward `/api/*` requests to `http://localhost:3000`.

Check `vite.config.js`:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
    secure: false
  }
}
```

### 5. Check Browser Console
Look for proxy errors in the browser console. The debug logging added to the server will show:
- `📡 API Request: POST /api/llm` - when request reaches server
- `✅ Matched /api/llm endpoint` - when route is matched

### 6. Check Server Logs
The backend server should show:
- `📡 API Request: POST /api/llm` when it receives the request
- If you don't see this, the proxy isn't forwarding requests

## Common Issues

### Issue: Vite proxy not working
**Solution:** Restart Vite dev server after changing `vite.config.js`

### Issue: Backend server not running
**Solution:** Start backend server with `npm run server`

### Issue: Port conflict
**Solution:** Make sure port 3000 is available and not used by another process

### Issue: CORS errors
**Solution:** Backend already has CORS headers configured, but check if they're being set correctly

## Debug Steps

1. **Check if request reaches server:**
   - Look for `📡 API Request:` logs in server console
   - If you don't see this, proxy isn't working

2. **Check if route is matched:**
   - Look for `✅ Matched /api/llm endpoint` in server console
   - If you see API Request but not Matched, check URL matching

3. **Check Vite proxy logs:**
   - With the new debug logging, you should see proxy logs in Vite console
   - `Proxying request: POST /api/llm -> /api/llm`

## Expected Behavior

When working correctly:
1. Frontend makes request to `http://localhost:5173/api/llm`
2. Vite proxy intercepts and forwards to `http://localhost:3000/api/llm`
3. Backend server receives request and logs `📡 API Request: POST /api/llm`
4. Backend matches route and logs `✅ Matched /api/llm endpoint`
5. Backend processes request and returns response

## Still Not Working?

1. Check that both servers are running:
   - Frontend: `http://localhost:5173` (Vite)
   - Backend: `http://localhost:3000` (Node.js server)

2. Try accessing backend directly:
   - Open `http://localhost:3000/health` in browser
   - Should return JSON with status: "healthy"

3. Check for errors in:
   - Browser console
   - Vite dev server console
   - Backend server console

4. Verify environment variables:
   - Check `.env` file has `OPENAI_API_KEY` or `GEMINI_API_KEY` set
   - Backend needs at least one API key to function



