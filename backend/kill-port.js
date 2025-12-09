#!/usr/bin/env node

/**
 * Utility script to kill process running on a specific port
 * Usage: node kill-port.js [port]
 * Default port: 5000
 */

const { exec } = require('child_process');
const os = require('os');

const port = process.argv[2] || 5000;
const platform = os.platform();

console.log(`🔍 Checking for process on port ${port}...`);

function killPort() {
  let command;
  
  if (platform === 'win32') {
    // Windows
    command = `netstat -ano | findstr :${port}`;
  } else {
    // Linux/Mac
    command = `lsof -ti:${port}`;
  }

  exec(command, (error, stdout, stderr) => {
    if (error || !stdout) {
      console.log(`✅ Port ${port} is free`);
      return;
    }

    if (platform === 'win32') {
      // Parse Windows netstat output
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && !isNaN(pid)) {
          pids.add(pid);
        }
      });

      if (pids.size === 0) {
        console.log(`✅ Port ${port} is free`);
        return;
      }

      console.log(`⚠️  Found ${pids.size} process(es) on port ${port}`);
      
      pids.forEach(pid => {
        console.log(`   Killing PID ${pid}...`);
        exec(`taskkill /PID ${pid} /F`, (err, out) => {
          if (err) {
            console.error(`   ❌ Failed to kill PID ${pid}`);
          } else {
            console.log(`   ✅ Successfully killed PID ${pid}`);
          }
        });
      });
    } else {
      // Linux/Mac
      const pids = stdout.trim().split('\n').filter(p => p);
      
      if (pids.length === 0) {
        console.log(`✅ Port ${port} is free`);
        return;
      }

      console.log(`⚠️  Found ${pids.length} process(es) on port ${port}`);
      
      pids.forEach(pid => {
        console.log(`   Killing PID ${pid}...`);
        exec(`kill -9 ${pid}`, (err) => {
          if (err) {
            console.error(`   ❌ Failed to kill PID ${pid}`);
          } else {
            console.log(`   ✅ Successfully killed PID ${pid}`);
          }
        });
      });
    }
  });
}

killPort();
