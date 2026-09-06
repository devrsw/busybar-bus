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
  if (!value) return null;
  const match = value.match(/(\d+)/);
  return match ? Number(match[1]) : null;
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

  const stopNameMatch = text.match(/Upcoming departures for\s+(.+?)\s+\(Stop #?(\d+)\)/i);
  const stopName = stopNameMatch ? stopNameMatch[1].trim() : 'Fairway / Chicopee Hills';
  const stopId = Number(stopNameMatch ? stopNameMatch[2] : 2029);

  const routeMatch = text.match(/(\d+)\s+([A-Za-z0-9 .'-]+?)(?=\s*(?:\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M|Real-time Departure|$))/i);
  const routeNumber = routeMatch ? routeMatch[1] : '23';
  const destination = routeMatch ? routeMatch[2].trim() : 'Idlewood to Stanley Park';

  const departures = Array.from(
    text.matchAll(/(\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M)\s*(\d+)\s+([A-Za-z0-9 .'-]+?)(?=\s*(?:\d+\s*mins|\d{1,2}:\d{2}\s*[AP]M|Real-time Departure|$))/gi),
  );

  const matchingDeparture = departures.find((entry) => String(entry[2]) === routeNumber) || departures[0];

  let minutes: number | null = null;
  let nextDepartureLabel = 'Live route';

  if (matchingDeparture) {
    const rawValue = matchingDeparture[1].trim();
    nextDepartureLabel = rawValue;

    if (rawValue.toLowerCase().includes('mins')) {
      minutes = parseMinutes(rawValue);
    } else {
      minutes = parseClockMinutes(rawValue);
    }
  }

  if (minutes === null) {
    minutes = 5;
  }

  return {
    stopId,
    stopName,
    route: routeNumber,
    destination,
    minutes,
    nextDepartureLabel,
    fetchedAt: new Date().toISOString(),
  };
}
