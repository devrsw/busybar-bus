import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseStopInfo, type StopInfo } from './lib/stopParser';

const execFileAsync = promisify(execFile);

const app = express();
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3000);
const STOP_URL = 'https://dashboard.grt.ca/stops/2029';
const BUSY_BAR_API_URL = process.env.BUSY_BAR_API_URL ?? 'http://10.0.4.20';
const BUSY_BAR_APP_NAME = process.env.BUSY_BAR_APP_NAME ?? 'busybar-bus';

app.use(express.static(path.join(__dirname, 'public')));

function buildBusyBarPayload(stopInfo: StopInfo) {
  const minutesText = stopInfo.minutes <= 1 ? 'NOW' : `${stopInfo.minutes}m`;
  const progress = Math.min(0.92, Math.max(0.12, 1 - stopInfo.minutes / 20));
  const busX = Math.max(16, Math.min(200, Math.round(24 + progress * 150)));
  const routeText = `R${stopInfo.route}`;
  const destinationText = stopInfo.destination.slice(0, 13);

  return {
    application_name: BUSY_BAR_APP_NAME,
    priority: 100,
    elements: [
      {
        id: 'sky',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 320,
        height: 64,
        z_index: 0,
      },
      {
        id: 'route',
        type: 'text',
        text: routeText,
        font: 'small',
        x: 8,
        y: 10,
        z_index: 2,
      },
      {
        id: 'minutes',
        type: 'text',
        text: minutesText,
        font: 'small',
        x: 112,
        y: 18,
        z_index: 3,
      },
      {
        id: 'ground',
        type: 'rectangle',
        x: 0,
        y: 64,
        width: 320,
        height: 64,
        z_index: 0,
      },
      {
        id: 'road',
        type: 'rectangle',
        x: 0,
        y: 84,
        width: 320,
        height: 44,
        z_index: 1,
      },
      {
        id: 'busBody',
        type: 'rectangle',
        x: busX,
        y: 84,
        width: 64,
        height: 18,
        z_index: 4,
      },
      {
        id: 'busTop',
        type: 'rectangle',
        x: busX + 8,
        y: 76,
        width: 48,
        height: 8,
        z_index: 4,
      },
      {
        id: 'busWindow1',
        type: 'rectangle',
        x: busX + 10,
        y: 88,
        width: 11,
        height: 7,
        z_index: 5,
      },
      {
        id: 'busWindow2',
        type: 'rectangle',
        x: busX + 25,
        y: 88,
        width: 11,
        height: 7,
        z_index: 5,
      },
      {
        id: 'stopSign',
        type: 'rectangle',
        x: 248,
        y: 50,
        width: 16,
        height: 12,
        z_index: 3,
      },
      {
        id: 'stopText',
        type: 'text',
        text: '29',
        font: 'tiny',
        x: 252,
        y: 52,
        z_index: 4,
      },
      {
        id: 'destination',
        type: 'text',
        text: destinationText,
        font: 'tiny',
        x: 8,
        y: 100,
        z_index: 2,
      },
    ],
  };
}

async function fetchStopInfo() {
  const response = await fetch(STOP_URL);

  if (!response.ok) {
    throw new Error(`GRT request failed with status ${response.status}`);
  }

  const html = await response.text();
  return parseStopInfo(html);
}

async function drawToBusyBar(stopInfo: StopInfo) {
  const payload = buildBusyBarPayload(stopInfo);
  const body = JSON.stringify(payload);

  const { stdout } = await execFileAsync('curl', [
    '--silent',
    '--show-error',
    '--fail',
    '-X',
    'POST',
    `${BUSY_BAR_API_URL}/api/display/draw`,
    '-H',
    'Content-Type: application/json',
    '--data-binary',
    body,
  ]);

  return JSON.parse(stdout);
}

async function refreshBusyBarDisplay() {
  try {
    const stopInfo = await fetchStopInfo();
    await drawToBusyBar(stopInfo);
    console.log(`Busy Bar updated with ${stopInfo.route} ${stopInfo.minutes} min departure.`);
  } catch (error) {
    console.error('Failed to refresh Busy Bar display:', error);
  }
}

app.get('/api/next-bus', async (_req: Request, res: Response) => {
  try {
    const stopInfo = await fetchStopInfo();

    res.json({
      ...stopInfo,
      source: STOP_URL,
    });
  } catch (error) {
    console.error('Failed to fetch GRT stop data:', error);

    res.status(502).json({
      error: 'Unable to fetch live stop data right now.',
      fallback: {
        stopId: 2029,
        stopName: 'Fairway / Chicopee Hills',
        route: '23',
        destination: 'Idlewood to Stanley Park',
        minutes: 5,
        nextDepartureLabel: '5 mins',
      },
    });
  }
});

app.post('/api/busybar/render', async (_req: Request, res: Response) => {
  try {
    const stopInfo = await fetchStopInfo();
    await drawToBusyBar(stopInfo);
    res.json({
      ok: true,
      stopInfo,
      source: BUSY_BAR_API_URL,
    });
  } catch (error) {
    console.error('Busy Bar render failed:', error);
    res.status(502).json({
      ok: false,
      error: 'Failed to render to Busy Bar display.',
    });
  }
});

app.use((_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, HOST, async () => {
  console.log(`Busybar bus app is running at http://${HOST}:${PORT}`);
  console.log(`Open http://localhost:${PORT} on this machine or http://<busybar-ip>:${PORT} from the local network.`);
  console.log(`Sending display updates to ${BUSY_BAR_API_URL}`);

  await refreshBusyBarDisplay();
  setInterval(() => {
    void refreshBusyBarDisplay();
  }, 30000);
});
