module.exports = {
  apps: [{
    name: 'family-points',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '',
      PORT: 3000
    },
    // Data safety
    watch: false,
    ignore_watch: ['data', 'node_modules', '.git'],
    // Auto restart on crash
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '200M',
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    merge_logs: true,
  }]
};
