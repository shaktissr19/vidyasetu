module.exports = {
  apps: [
    {
      name: 'vs-api',
      cwd: '/var/www/vidyasetu/backend',
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
      cwd: '/var/www/vidyasetu/frontend',
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
