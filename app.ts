import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const STOP_URL = 'https://dashboard.grt.ca/stops/2029';
const API_BASE = process.env.BUSY_BAR_API_URL ?? 'http://10.0.4.20';
const APP_NAME = process.env.BUSY_BAR_APP_NAME ?? 'busybar-bus';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 30000);
export const SCREEN_WIDTH = 72;
export const SCREEN_HEIGHT = 16;
const SKY_HEIGHT = 8;
const ROAD_Y = 11;
const ROAD_HEIGHT = 5;

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

export function buildBusyBarPayload(stopInfo: StopInfo) {
  const minutesText = stopInfo.minutes <= 1 ? 'NOW' : `${stopInfo.minutes}m`;
  const progress = Math.min(0.92, Math.max(0.1, 1 - stopInfo.minutes / 20));
  const busX = Math.max(8, Math.min(44, Math.round(8 + progress * 30)));
  const routeText = `R${stopInfo.route}`;
  const destText = stopInfo.destination.substring(0, 12);

  const elements = [
    {
      id: 'sky',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: SCREEN_WIDTH,
      height: SKY_HEIGHT,
      z_index: 0,
    },
    {
      id: 'route',
      type: 'text',
      text: routeText,
      font: 'small',
      x: 1,
      y: 1,
      z_index: 2,
    },
    {
      id: 'minutes',
      type: 'text',
      text: minutesText,
      font: 'small',
      x: 47,
      y: 1,
      z_index: 3,
    },
    {
      id: 'ground',
      type: 'rectangle',
      x: 0,
      y: SKY_HEIGHT,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT - SKY_HEIGHT,
      z_index: 0,
    },
    {
      id: 'road',
      type: 'rectangle',
      x: 0,
      y: ROAD_Y,
      width: SCREEN_WIDTH,
      height: ROAD_HEIGHT,
      z_index: 1,
    },
    {
      id: 'busBody',
      type: 'rectangle',
      x: busX,
      y: ROAD_Y + 1,
      width: 12,
      height: 3,
      z_index: 4,
    },
    {
      id: 'busTop',
      type: 'rectangle',
      x: busX + 2,
      y: ROAD_Y - 2,
      width: 8,
      height: 2,
      z_index: 4,
    },
    {
      id: 'busWindow1',
      type: 'rectangle',
      x: busX + 3,
      y: ROAD_Y + 1,
      width: 2,
      height: 1,
      z_index: 5,
    },
    {
      id: 'busWindow2',
      type: 'rectangle',
      x: busX + 7,
      y: ROAD_Y + 1,
      width: 2,
      height: 1,
      z_index: 5,
    },
    {
      id: 'stopSign',
      type: 'rectangle',
      x: 62,
      y: 4,
      width: 4,
      height: 4,
      z_index: 3,
    },
    {
      id: 'stopText',
      type: 'text',
      text: '29',
      font: 'tiny',
      x: 63,
      y: 5,
      z_index: 4,
    },
    {
      id: 'destination',
      type: 'text',
      text: destText,
      font: 'tiny',
      x: 1,
      y: 13,
      z_index: 2,
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
