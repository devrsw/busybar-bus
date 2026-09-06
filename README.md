# busybar-bus

A local GRT stop countdown app for Busy Bar.

## Run this computer

```bash
npm install
npm run start
```

Open http://127.0.0.1:3000

## Run on Busy Bar

```bash
npm install
BUSY_BAR_API_URL=http://10.0.4.20 npm run busybar
```

The Busy Bar device will be reachable at http://10.0.4.20:3000 or http://<busybar-ip>:3000.

If port 3000 is already occupied, use:

```bash
PORT=3001 BUSY_BAR_API_URL=http://10.0.4.20 npm run busybar:3001
```
