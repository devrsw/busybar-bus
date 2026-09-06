import express from 'express';
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
  const statusText = stopInfo.minutes <= 1 ? 'ARRIVING' : 'NEXT BUS';

  return {
    application_name: BUSY_BAR_APP_NAME,
    priority: 50,
    led_notification_color: '#1FA7FF80',
    elements: [
      {
        id: 'bg',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 320,
        height: 128,
        fill: '#0C1F3AEE',
        border_width: 0,
        z_index: 0,
      },
      {
        id: 'header',
        type: 'text',
        text: `GRT ${stopInfo.route}`,
        font: 'small',
        x: 12,
        y: 12,
        align: 'top_left',
        color: '#DCEFFF80',
        z_index: 1,
      },
      {
        id: 'stop',
        type: 'text',
        text: `STOP ${stopInfo.stopId}`,
        font: 'tiny',
        x: 12,
        y: 26,
        align: 'top_left',
        color: '#C8E3FF80',
        z_index: 1,
      },
      {
        id: 'minutes',
        type: 'text',
        text: minutesText,
        font: 'extra_large',
        x: 0,
        y: 44,
        align: 'center',
        color: '#FFFFFFFF',
        width: 320,
        z_index: 2,
      },
      {
        id: 'status',
        type: 'text',
        text: statusText,
        font: 'tiny',
        x: 230,
        y: 92,
        align: 'top_right',
        color: '#FFE39BFF',
        width: 80,
        z_index: 2,
      },
      {
        id: 'destination',
        type: 'text',
        text: stopInfo.destination,
        font: 'small',
        x: 12,
        y: 100,
        align: 'top_left',
        color: '#BFEAFFFF',
        width: 200,
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

app.get('/api/next-bus', async (_req, res) => {
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

app.post('/api/busybar/render', async (_req, res) => {
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

app.get('*', (_req, res) => {
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
