type StopData = {
  minutes: number;
  stopName: string;
  route: string;
  destination: string;
  stopId: number;
};

const state: StopData = {
  minutes: 5,
  stopName: 'Fairway / Chicopee Hills',
  route: '23',
  destination: 'Idlewood to Stanley Park',
  stopId: 2029,
};

const minutesEl = document.getElementById('minutes') as HTMLSpanElement | null;
const statusTextEl = document.getElementById('status-text') as HTMLParagraphElement | null;
const stopLabelEl = document.getElementById('stop-label') as HTMLParagraphElement | null;
const routeLineEl = document.getElementById('route-line') as HTMLParagraphElement | null;
const busEl = document.getElementById('bus') as HTMLDivElement | null;
const bodyEl = document.body;

function getTimeTheme(): string {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 20) return 'evening';
  if (hour >= 20 || hour < 6) return 'night';

  return 'day';
}

function updateTheme(): void {
  bodyEl.dataset.theme = getTimeTheme();
}

function setBusProgress(minutes: number): void {
  if (!busEl) return;

  const raw = Number(minutes || 0);
  const progress = Math.min(Math.max(raw / 20, 0.08), 0.96);
  busEl.style.setProperty('--bus-progress', `${progress * 100}%`);
  busEl.style.left = `calc(6% + ${progress * 100}%)`;
}

function updateUi(data: StopData): void {
  const minutesValue = Number(data.minutes ?? state.minutes ?? 5);
  state.minutes = minutesValue;
  state.stopName = data.stopName || state.stopName;
  state.route = data.route || state.route;
  state.destination = data.destination || state.destination;
  state.stopId = data.stopId || state.stopId;

  if (minutesEl) minutesEl.textContent = String(minutesValue);
  if (statusTextEl) {
    statusTextEl.textContent = minutesValue <= 1 ? 'Bus arriving now' : 'Next bus is on the way';
  }
  if (stopLabelEl) {
    stopLabelEl.textContent = `Stop ${state.stopId} • ${state.stopName}`;
  }
  if (routeLineEl) {
    routeLineEl.textContent = `${state.route} ${state.destination}`;
  }

  if (minutesValue <= 1) {
    if (busEl) {
      busEl.style.setProperty('--bus-progress', '82%');
      busEl.style.left = '82%';
    }
  } else {
    setBusProgress(minutesValue);
  }
}

async function fetchBusData(): Promise<void> {
  try {
    const response = await fetch('/api/next-bus');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = (await response.json()) as StopData & { error?: string };
    if (data && typeof data.minutes === 'number') {
      updateUi(data);
      return;
    }

    updateUi({
      minutes: 5,
      stopName: 'Fairway / Chicopee Hills',
      route: '23',
      destination: 'Idlewood to Stanley Park',
      stopId: 2029,
    });
  } catch (error) {
    console.error('Unable to fetch live bus data', error);
    updateUi({
      minutes: 5,
      stopName: 'Fairway / Chicopee Hills',
      route: '23',
      destination: 'Idlewood to Stanley Park',
      stopId: 2029,
    });
  }
}

updateTheme();
void fetchBusData();
window.setInterval(() => {
  updateTheme();
  void fetchBusData();
}, 30000);
