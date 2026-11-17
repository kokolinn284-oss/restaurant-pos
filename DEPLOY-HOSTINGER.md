# Hostinger ပေါ်တွင် Restaurant POS တင်သုံးခြင်း

ဒီစာရွက်စာတမ်းက ဒီ project ကို Hostinger မှာ တင်ရာတွင် လိုအပ်တဲ့ အဆင့်များနှင့်
သတိပြုရမည့်အချက်များကို ဖော်ပြထားပါတယ်။

| အချက် | Hostinger VPS (အကြံပြု) | Hostinger Web App (Business/Cloud) |
|---|---|---|
| Node.js | 22.13+ ကို ကိုယ်တိုင်တင် | 22.x/24.x ရွေးနိုင် |
| SQLite database | လွယ်ကူ၊ ထိန်းသိမ်းရလွယ် | ရ၊ ဒါပေမယ့် `hbuilds/current` အပြင်ဘက်မှာ ထားရမည် |
| Data ဆက်လက်တည်ရှိမှု | ကိုယ်ပိုင် disk၊ စိတ်ချရ | Deploy တိုင်း ဖိုင်အသစ်ဖြစ်သောကြောင့် path ဂရုပြုရ |
| Printer (LAN/ESC-POS) | ဆိုင်ကွန်ရက်ထဲမှ ချိတ်နိုင် | Cloud ကနေ ဆိုင်ရှိ printer ဆီ မရောက်နိုင် |
| Instance အရေအတွက် | 1 ခုသာ | 1 ခုသာ |

> **အရေးကြီး** — ဒီ app သည် SQLite ဖိုင်တစ်ခုတည်းကို သုံးပါတယ်။ Process/instance
> တစ်ခုထက်ပိုပြီး run လျှင် database ပျက်စီးနိုင်ပါတယ်။ Load balancer နောက်မှာ
> instance များစွာ မချထားပါနှင့်။

---

## 1. ကြိုတင်ပြင်ဆင်ချက်

- **Node.js 22.13 သို့မဟုတ် အထက်** လိုအပ်ပါတယ် (`node:sqlite` အတွက်)။
  `node -v` ဖြင့် စစ်ပါ။ Hostinger Web App တွင် Node version ကို `22.x` သို့မဟုတ်
  `24.x` ရွေးပါ။
- `.env.example` ကို ကြည့်ပြီး လိုအပ်တဲ့ တန်ဖိုးများ ပြင်ပါ။
- Data folder နှစ်ခုကို **build output အပြင်ဘက်** တွင် ထားပါ —
  - `POS_DATA_DIR` → `pos.db` နှင့် upload ပုံများ
  - `POS_BACKUP_DIR` → နေ့စဉ် backup ဖိုင်များ (၃၀ ရက် သိမ်း)
- Deploy တစ်ခါတိုင်း ဒီ folder နှစ်ခုကို မဖျက်ပါနှင့်၊ မဖြစ်စေပါနှင့်။

---

## 2. Hostinger Web App (Business / Cloud Plan)

1. Hostinger Dashboard → **Websites → Create site → Web App** ကို ရွေးပါ။
2. Domain (သို့မဟုတ် temporary domain) ရွေးပါ။
3. Code ကို **GitHub repository** မှ import လုပ်ပါ (သို့မဟုတ် `.zip` upload လုပ်ပါ)။
   Hostinger က ချိတ်ထားတဲ့ GitHub account ထဲကို repo **copy** တစ်ခု ဖန်တီးပြီး
   ထို copy မှ deploy လုပ်ပါတယ်။ နောက်ပိုင်း update များကို ထို copy repo သို့
   push ရပါမည် (မူရင်း repo သို့ push လျှင် auto-deploy မဖြစ်ပါ)။
4. **Build & output settings** တွင်:
   - **Framework preset**: `Other` (`Express` preset တွင် build command မပေါ်ပါ)
   - **Node version**: `24.x` (သို့မဟုတ် `22.x`)
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Entry file**: `server/index.js`
5. **Environment Variables** တွင် အောက်ပါတို့ကို ထည့်ပါ:

   | Key | Value (ဥပမာ) |
   |---|---|
   | `POS_DATA_DIR` | `/home/u123456789/pos-data` |
   | `POS_BACKUP_DIR` | `/home/u123456789/pos-backups` |
   | `POS_TRUST_PROXY` | `1` |

   `PORT` ကို Hostinger က အလိုအလျောက် ပေးတာဖြစ်လို့ ထည့်ရန် မလိုပါ။
   **`NODE_ENV=production` ကို မထည့်ပါနှင့်** — build လုပ်ချိန် `npm` က
   devDependencies (vite, @vitejs/plugin-react) ကို ချန်လှပ်သွားပြီး
   `vite: command not found` ဖြင့် build fail ဖြစ်ပါတယ်။
   Username ကို File Manager ထဲက `/home/...` path မှာ ကြည့်ပြီး ပြင်ပါ။
6. **Deploy** နှိပ်ပါ။ Build log တွင် error မရှိပါက app အလုပ်လုပ်နေပါပြီ။
7. ပထမဆုံး ဖွင့်ပြီးနောက် ဝန်ထမ်း/မီနူး စသည်တို့ကို ပြင်ဆင်ပါ။

### Web App တွင် သတိထားရမည့်အချက်များ

- Hostinger က deploy တိုင်း `hbuilds/versions/<id>` အသစ် ဖန်တီးပြီး
  `hbuilds/current` ကို ချိန်းပါတယ်။ **ထို folder အတွင်း ရေးထားတဲ့ ဖိုင်များ
  ပျက်သွားနိုင်တာဖြစ်လို့** database ကို `POS_DATA_DIR` ဖြင့် အပြင်ဘက်သို့
  ရွှေ့ထားရပါမယ်။
- Environment variable ပြောင်းလျှင် redeploy လုပ်ရပါမယ်။
- Cloud server ကနေ ဆိုင်အတွင်းရှိ network printer (ESC/POS) ဆီ တိုက်ရိုက်
  မချိတ်နိုင်ပါ။ ငွေရှင်းပြီးနောက် **browser print (သို့မဟုတ် PDF)** ကို
  သုံးပါ။ Offline ဖြစ်နေချိန်တွင်လည်း browser print အလုပ်လုပ်ပါတယ်။
- Offline/PWA အလုပ်လုပ်ရန် **HTTPS** လိုအပ်ပါတယ် (Hostinger က default ပေးပါတယ်)။

### Copy repo သို့ push မရသည့်အခါ — Web Terminal ဖြင့် ကိုယ်တိုင် deploy

> 2026-11-17 မှစ၍ `shwepyithit568-commits/restaurant-pos` တွင် `kokolinn284-oss` ကို
> Write collaborator ထည့်ထားပြီး local repo ၏ `origin` သည် repo နှစ်ခုလုံးဆီ
> push လုပ်ပါတယ်။ ပုံမှန်အားဖြင့် `git push origin main` တစ်ချက်နှင့်
> Hostinger က auto-deploy လုပ်ပါမည်။ အောက်ပါနည်းကို အရေးပေါ်/အရန် သုံးပါ။

Public repo (`kokolinn284-oss/restaurant-pos`) ကို push ပြီးနောက်
hPanel → File Manager → `.../hbuilds/current/nodejs` ဖွင့်ပြီး **Terminal** နှိပ်ကာ:

```bash
export PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH
git fetch https://github.com/kokolinn284-oss/restaurant-pos.git main
git reset --hard FETCH_HEAD
./node_modules/.bin/vite build --outDir ../dist-new
rm -rf dist.old && mv dist dist.old && mv ../dist-new dist
```

- `npm run build` ကို Web Terminal ထဲ မသုံးပါနှင့် — shell တွင် `npm` မရှိသလို
  `vite build` က `dist` ကို အရင်ရှင်းလိုက်တာကြောင့် build fail ဖြစ်ပါက site ပျက်သွားနိုင်ပါတယ်။
  အထက်ပါအတိုင်း folder အသစ်ထဲ build ပြီးမှ လဲပါ။
- Node path `alt-nodejs24` သည် hosting version ပေါ် မူတည်၍ ပြောင်းနိုင်ပါတယ်။
  `readlink /proc/<node-pid>/exe` ဖြင့် စစ်ပါ။
- ဤနည်းဖြင့် `hbuilds/current` ကို ကိုယ်တိုင်ပြင်ထားသည်ဖြစ်လို့ နောက် Hostinger
  **Deploy** တစ်ခါ လုပ်လျှင် copy repo ရှိ code ဖြင့် အစားထိုးခံရပါမည်။
  ထို့ကြောင့် push ပြီးပါက GitHub auto-deploy ကို အသုံးပြုပါ။

---

## 3. Hostinger VPS (အကြံပြု — Data နှင့် Printer အတွက်)

ဥပမာ — Ubuntu 24.04 VPS၊ domain `pos.example.com`။

### 3.1 Node.js 22 တင်

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.13.0 သို့မဟုတ် အထက် ဖြစ်ရမည်
```

### 3.2 Code ယူပြီး build လုပ်

```bash
sudo mkdir -p /var/www/restaurant-pos
sudo chown $USER:$USER /var/www/restaurant-pos
git clone <YOUR_REPO_URL> /var/www/restaurant-pos
cd /var/www/restaurant-pos
cp .env.example .env
nano .env        # POS_DATA_DIR, POS_BACKUP_DIR, POS_TRUST_PROXY=1 ပြင်ပါ
npm ci
npm run build
```

### 3.3 PM2 ဖြင့် run

`ecosystem.config.cjs` ထဲက `/home/USERNAME/...` နှင့် `cwd` ကို သင့် server
အတွက် ပြင်ပါ။

```bash
sudo npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # ပြသလာသော command ကို run ပါ
```

စစ်ဆေးရန် — `pm2 logs restaurant-pos`၊ `curl http://127.0.0.1:3000/api/shop`။

### 3.4 Nginx reverse proxy + HTTPS

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/restaurant-pos
```

```nginx
server {
  listen 80;
  server_name pos.example.com;
  client_max_body_size 12m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE (/api/events) အတွက် buffering ပိတ်ထားရမည်
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/restaurant-pos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pos.example.com
```

Firewall —

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

> MySQL/PostgreSQL မလိုပါ။ SQLite ဖိုင်ကို `POS_DATA_DIR` ထဲမှာ သိမ်းပါတယ်။

---

## 4. Backup နှင့် ပြန်လည်ထည့်သွင်းခြင်း

- App က နေ့စဉ် `POS_BACKUP_DIR/pos-YYYY-MM-DD.db` ကို အလိုအလျောက်
  backup လုပ်ပြီး ရက် ၃၀ ထိ သိမ်းထားပါတယ်။
- လက်ဖြင့် backup — admin အနေဖြင့် `GET /api/backup` (login လိုအပ်) ကို
  download လုပ်နိုင်ပါတယ်။
- ပြန်ထည့်ရန် — app ကို ရပ်ပြီး backup ဖိုင်ကို `POS_DATA_DIR/pos.db`
  အဖြစ် ကူးထည့်ပါ။ ထို့နောက် `pm2 restart restaurant-pos`။
- Hostinger Web App သုံးလျှင် `pos-data` folder ကို File Manager မှ
  periodic download လုပ်ထားပါ (plan backup တွင် မပါနိုင်)။

---

## 5. Update လုပ်ခြင်း

VPS:

```bash
cd /var/www/restaurant-pos
git pull
npm ci
npm run build
pm2 restart restaurant-pos
```

Web App: `git push origin main` လုပ်ပါ — `origin` က
`kokolinn284-oss/restaurant-pos` နှင့် Hostinger copy repo နှစ်ခုလုံးဆီ
push လုပ်ပြီး Hostinger က auto-deploy လုပ်ပါတယ်။
copy repo သို့ push မရပါက အပေါ် (2. ကဏ္ဍ) ရှိ Web Terminal နည်းဖြင့် deploy လုပ်ပါ။
`POS_DATA_DIR` က build အပြင်ဘက်ဖြစ်လို့ data မပျက်ပါ။

---

## 6. Offline နှင့် PWA အပြုအမူ

- App သည် service worker ဖြင့် UI ကို cache လုပ်ထားပြီး၊ ကွန်ရက်ပြတ်ချိန်တွင်
  စားပွဲရွေး → အစားအသောက်ထည့် → ငွေရှင်း → ပြေစာထုတ် အထိ ဆက်လုပ်နိုင်ပါတယ်။
- ငွေရှင်းပြီး order များကို browser ထဲ (localStorage) တွင် သိမ်းထားပြီး
  ကွန်ရက်ပြန်ရလျှင် အလိုအလျောက် (နှင့် Sync ခလုတ်ဖြင့်) server သို့ ပို့ပါတယ်။
  ထပ်ခါထပ်ခါ ပို့သော်လည်း order မပွားပါ (`client_ref` ဖြင့် တားထားသည်)။
- Offline data သည် **ထို browser/device တစ်ခုတည်း** အတွက်သာ ဖြစ်ပါတယ်။
  Browser data ရှင်းလင်းခြင်း၊ Incognito သုံးခြင်း၊ တခြား device ဖြင့်
  ဝင်ခြင်းတို့တွင် မျှဝေမရပါ။
- ဆိုင်တွင် အနည်းဆုံး device တစ်ခုကို ပုံမှန် online ထားပြီး sync လုပ်ပေးပါ။
- Sync မအောင်မြင်သေးသော order များကို App ထိပ်ရှိ Sync badge တွင်
  ကြည့်နိုင်ပါတယ်။

---

## 7. ပြဿနာဖြေရှင်းခြင်း

| လက္ခဏာ | အကြောင်းရင်း / ဖြေရှင်းနည်း |
|---|---|
| `node:sqlite` error | Node 22.13 အောက် ဖြစ်နေသည်။ Node version မြှင့်ပါ။ |
| Deploy ပြီးတိုင်း data ပျောက် | `POS_DATA_DIR` ကို `hbuilds/current` အတွင်း ထားမိသည်။ အပြင်ဘက်သို့ ရွှေ့ပါ။ |
| `vite: command not found` | Environment variables ထဲတွင် `NODE_ENV=production` ထည့်ထားသည်။ ဖျက်ပြီး redeploy လုပ်ပါ။ |
| 502 / app မတက် | `pm2 logs`၊ build log စစ်ပါ။ `PORT` ကို ကိုယ်တိုင် မသတ်မှတ်ပါနှင့် (Web App)။ |
| Realtime အလုပ်မလုပ် | Nginx တွင် `proxy_buffering off;` ထည့်ပါ။ |
| Sync မဝင် | Online ဖြစ်ကြောင်း၊ ဝန်ထမ်း role (waiter က ငွေရှင်းပြီး sync မလုပ်နိုင်) စစ်ပါ။ |
| Printer မထုတ် | Cloud မှ LAN printer မရောက်နိုင်ပါ။ Browser print သုံးပါ။ |

---

## 8. ကိုးကား

- [How to add a Node.js web app in Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Node.js Hosting](https://www.hostinger.com/nodejs-hosting)
