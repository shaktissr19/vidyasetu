const path = require('path');

const releaseRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'vs-api',
      cwd: path.join(releaseRoot, 'backend'),
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'vs-web',
      cwd: path.join(releaseRoot, 'frontend'),
      script: 'npm',
      args: 'start',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
