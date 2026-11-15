// PM2 config — Hostinger VPS အတွက်
// အသုံး: pm2 start ecosystem.config.cjs && pm2 save
// သတိပြုချက် — SQLite database တစ်ခုတည်းဖြစ်သောကြောင့် instance တစ်ခုသာ run ပါ။
module.exports = {
  apps: [
    {
      name: 'restaurant-pos',
      script: 'server/index.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        POS_DATA_DIR: '/home/USERNAME/pos-data',
        POS_BACKUP_DIR: '/home/USERNAME/pos-backups',
        POS_TRUST_PROXY: '1'
      }
    }
  ]
};
