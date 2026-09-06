const express = require('express');
const path = require('path');
const { parseStopInfo } = require('./lib/stopParser');

const app = express();
const PORT = process.env.PORT || 3000;
const STOP_URL = 'https://dashboard.grt.ca/stops/2029';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/next-bus', async (req, res) => {
  try {
    const response = await fetch(STOP_URL);

    if (!response.ok) {
      throw new Error(`GRT request failed with status ${response.status}`);
    }

    const html = await response.text();
    const stopInfo = parseStopInfo(html);

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Busybar bus app is running at http://localhost:${PORT}`);
});
