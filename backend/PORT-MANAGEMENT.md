# SecureWipe Backend - Port Management

## Common Issue: Port 5000 Already in Use

If you see the error `Error: listen EADDRINUSE: address already in use :::5000`, it means another process is using port 5000.

## Quick Solutions

### Option 1: Use the Clean Start Scripts (Recommended)
```bash
# For production
npm run clean-start

# For development with auto-reload
npm run clean-dev
```

These scripts will automatically kill any process on port 5000 before starting the server.

### Option 2: Kill Port Manually
```bash
# Kill process on port 5000
npm run kill

# Then start normally
npm start
```

### Option 3: Manual Commands

**Windows:**
```cmd
# Find the process
netstat -ano | findstr :5000

# Kill it (replace <PID> with the actual process ID)
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
# Find and kill in one command
lsof -ti:5000 | xargs kill -9
```

## Server Features

The server now includes:
- ✅ **Graceful shutdown** - Properly closes when you press Ctrl+C
- ✅ **Error handling** - Clear messages when port is in use
- ✅ **Auto-cleanup** - Prevents zombie processes
- ✅ **Better error messages** - Shows exactly what to do when errors occur

## Usage

```bash
# Start server normally
npm start

# Start with auto-reload (development)
npm run dev

# Kill port and start (if port is occupied)
npm run clean-start

# Kill port and start with auto-reload
npm run clean-dev

# Just kill the port
npm run kill
```

## Preventing Port Issues

1. **Always use Ctrl+C to stop the server** - This triggers graceful shutdown
2. **Use the clean-start scripts** if you're unsure
3. **Check for zombie processes** before starting: `npm run kill`

## Custom Port

To use a different port, create a `.env` file:
```env
PORT=5001
```

Then the server will run on port 5001 instead.
