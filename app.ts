import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const STOP_URL = 'https://dashboard.grt.ca/stops/2029';
const API_BASE = process.env.BUSY_BAR_API_URL ?? 'http://10.0.4.20';
const APP_NAME = process.env.BUSY_BAR_APP_NAME ?? 'busybar-bus';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 30000);
const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 128;

export type StopInfo = {
  stopId: number;
  stopName: string;
  route: string;
  destination: string;
  minutes: number;
  nextDepartureLabel: string;
  fetchedAt: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMinutes(value: string): number | null {
  const matched = value.match(/(\d+)/);
  return matched ? Number(matched[1]) : null;
}

function parseClockMinutes(value: string): number | null {
  const match = value.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return null;

  const [, hourText, minuteText, meridiem] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const normalizedHour = ((hour % 12) + (meridiem.toUpperCase() === 'PM' ? 12 : 0)) % 24;

  const now = new Date();
  const target = new Date(now);
  target.setHours(normalizedHour, minute, 0, 0);

  if (target.getTime() < now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
}

export function parseStopInfo(html: string): StopInfo {
  const text = stripHtml(html);

  const stopMatch = text.match(/Upcoming departures for\s+(.+?)\s+\(Stop #?(\d+)\)/i);
  const stopName = stopMatch ? stopMatch[1].trim() : 'Fairway / Chicopee Hills';
  const stopId = Number(stopMatch ? stopMatch[2] : 2029);

  const routeMatch = text.match(/(\d+)\s+([A-Za-z0-9 .'-]+?)(?=\s*(?:\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M|Real-time Departure|$))/i);
  const route = routeMatch ? routeMatch[1] : '23';
  const destination = routeMatch ? routeMatch[2].trim() : 'Idlewood to Stanley Park';

  const departures = Array.from(
    text.matchAll(/(\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M)\s*(\d+)\s+([A-Za-z0-9 .'-]+?)(?=\s*(?:\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M|Real-time Departure|$))/gi),
  );

  const firstMatch = departures.find((entry) => entry[2] === route) || departures[0];

  let minutes = 5;
  let nextDepartureLabel = 'Live route';

  if (firstMatch) {
    const raw = firstMatch[1].trim();
    nextDepartureLabel = raw;
    minutes = raw.toLowerCase().includes('mins') ? parseMinutes(raw) ?? 5 : parseClockMinutes(raw) ?? 5;
  }

  return {
    stopId,
    stopName,
    route,
    destination,
    minutes,
    nextDepartureLabel,
    fetchedAt: new Date().toISOString(),
  };
}

function buildBusyBarPayload(stopInfo: StopInfo) {
  const minutesText = stopInfo.minutes <= 1 ? 'NOW' : `${stopInfo.minutes}m`;
  const statusText = stopInfo.minutes <= 1 ? 'ARRIVING' : 'NEXT';
  const destinationText = stopInfo.destination.length > 18 ? `${stopInfo.destination.slice(0, 18)}…` : stopInfo.destination;

  return {
    application_name: APP_NAME,
    priority: 50,
    led_notification_color: '#1FA7FF80',
    elements: [
      {
        id: 'bg',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        fill: 'solid',
        fill_colors: ['#0C1F3AEE'],
        border_width: 0,
        z_index: 0,
      },
      {
        id: 'route',
        type: 'text',
        text: `GRT ${stopInfo.route}`,
        font: 'small',
        x: 12,
        y: 10,
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
        y: 24,
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
        y: 42,
        align: 'center',
        color: '#FFFFFFFF',
        width: SCREEN_WIDTH,
        z_index: 2,
      },
      {
        id: 'status',
        type: 'text',
        text: statusText,
        font: 'tiny',
        x: 230,
        y: 94,
        align: 'top_right',
        color: '#FFE39BFF',
        width: 76,
        z_index: 2,
      },
      {
        id: 'destination',
        type: 'text',
        text: destinationText,
        font: 'small',
        x: 12,
        y: 96,
        align: 'top_left',
        color: '#BFEAFFFF',
        width: 200,
        z_index: 2,
      },
    ],
  };
}

async function fetchStopInfo(): Promise<StopInfo> {
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
    `${API_BASE}/api/display/draw`,
    '-H',
    'Content-Type: application/json',
    '--data-binary',
    body,
  ]);

  return JSON.parse(stdout);
}

async function refresh() {
  const stopInfo = await fetchStopInfo();
  const result = await drawToBusyBar(stopInfo);
  console.log(`Updated Busy Bar: ${stopInfo.route} ${stopInfo.minutes} min - ${result.result ?? 'OK'}`);
}

async function main() {
  console.log(`Busy Bar target: ${API_BASE}`);
  console.log(`GRT stop: ${STOP_URL}`);

  await refresh();
  setInterval(() => {
    void refresh();
  }, REFRESH_MS);
}

void main();
