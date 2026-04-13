module.exports = {
  apps: [{
    name:        'sls-powder-api',
    script:      'server.js',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/var/log/sls-api/err.log',
    out_file:   '/var/log/sls-api/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
