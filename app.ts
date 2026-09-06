import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const STOP_URL = 'https://dashboard.grt.ca/stops/2029';
const API_BASE = process.env.BUSY_BAR_API_URL ?? 'http://10.0.4.20';
const APP_NAME = process.env.BUSY_BAR_APP_NAME ?? 'busybar-bus';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 30000);
const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 128;
const SKY_HEIGHT = 64;
const ROAD_Y = 84;
const ROAD_HEIGHT = 44;

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

  const info: StopInfo = {
    stopId,
    stopName,
    route,
    destination,
    minutes,
    nextDepartureLabel,
    fetchedAt: new Date().toISOString(),
  };

  return info;
}

function buildBusyBarPayload(stopInfo: StopInfo) {
  const minutesText = stopInfo.minutes <= 1 ? 'NOW' : `${stopInfo.minutes}m`;
  const progress = Math.min(0.92, Math.max(0.12, 1 - stopInfo.minutes / 20));
  const busX = Math.round(24 + progress * 170);

  // Add a timestamp to force display refresh
  const now = new Date();
  const seconds = String(now.getSeconds()).padStart(2, '0');

  const elements = [
    // SKY/TOP BACKGROUND RECTANGLE
    {
      id: 'sky',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: SCREEN_WIDTH,
      height: SKY_HEIGHT,
      z_index: 0,
    },
    // ROUTE LABEL
    {
      id: 'route',
      type: 'text',
      text: `GRT ${stopInfo.route}`,
      font: 'small',
      x: 8,
      y: 8,
      z_index: 2,
    },
    // COUNTDOWN TIMER - LARGE
    {
      id: 'minutes',
      type: 'text',
      text: minutesText,
      font: 'extra_large',
      x: 160,
      y: 22,
      z_index: 3,
    },
    // GRASS/GROUND RECTANGLE
    {
      id: 'ground',
      type: 'rectangle',
      x: 0,
      y: 64,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT - 64,
      z_index: 0,
    },
    // ROAD RECTANGLE
    {
      id: 'road',
      type: 'rectangle',
      x: 0,
      y: ROAD_Y,
      width: SCREEN_WIDTH,
      height: ROAD_HEIGHT,
      z_index: 1,
    },
    // BUS BODY RECTANGLE
    {
      id: 'busBody',
      type: 'rectangle',
      x: busX,
      y: 84,
      width: 70,
      height: 18,
      z_index: 4,
    },
    // BUS TOP RECTANGLE
    {
      id: 'busTop',
      type: 'rectangle',
      x: busX + 8,
      y: 76,
      width: 56,
      height: 8,
      z_index: 4,
    },
    // BUS WINDOW 1
    {
      id: 'busWindow1',
      type: 'rectangle',
      x: busX + 12,
      y: 88,
      width: 13,
      height: 7,
      z_index: 5,
    },
    // BUS WINDOW 2
    {
      id: 'busWindow2',
      type: 'rectangle',
      x: busX + 29,
      y: 88,
      width: 13,
      height: 7,
      z_index: 5,
    },
    // STOP SIGN
    {
      id: 'stopSign',
      type: 'rectangle',
      x: 270,
      y: 42,
      width: 18,
      height: 12,
      z_index: 3,
    },
    // STOP TEXT
    {
      id: 'stopText',
      type: 'text',
      text: '2029',
      font: 'tiny',
      x: 272,
      y: 44,
      z_index: 4,
    },
    // DESTINATION TEXT
    {
      id: 'destination',
      type: 'text',
      text: stopInfo.destination,
      font: 'small',
      x: 12,
      y: 96,
      z_index: 2,
    },
    // TIMESTAMP (forces display refresh)
    {
      id: 'timestamp',
      type: 'text',
      text: seconds,
      font: 'tiny',
      x: 310,
      y: 120,
      z_index: 10,
    },
  ];

  return {
    application_name: APP_NAME,
    priority: 100,
    elements,
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

  try {
    const { stdout } = await execFileAsync('curl', [
      '-X',
      'POST',
      `${API_BASE}/api/display/draw`,
      '-H',
      'Content-Type: application/json',
      '-d',
      body,
      '--max-time',
      '5',
    ]);

    const result = JSON.parse(stdout);
    
    if (result.error) {
      throw new Error(`Busy Bar error: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
}

async function refresh() {
  try {
    const stopInfo = await fetchStopInfo();
    const result = await drawToBusyBar(stopInfo);
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Updated Busy Bar: ${stopInfo.route} ${stopInfo.minutes} min - ${result.result ?? 'OK'}`);
  } catch (error) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] Failed to refresh Busy Bar display:`, error instanceof Error ? error.message : error);
  }
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
