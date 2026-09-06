import test from 'node:test';
import assert from 'node:assert/strict';

import { SCREEN_HEIGHT, SCREEN_WIDTH, buildBusyBarPayload } from '../app';

test('Busy Bar app fits the actual 72x16 display', () => {
  assert.equal(SCREEN_WIDTH, 72);
  assert.equal(SCREEN_HEIGHT, 16);

  const payload = buildBusyBarPayload({
    stopId: 2029,
    stopName: 'Fairway / Chicopee Hills',
    route: '23',
    destination: 'Conestogo / Fairway',
    minutes: 5,
    nextDepartureLabel: '5 mins',
    fetchedAt: new Date().toISOString(),
  });

  assert.equal(payload.application_name, 'busybar-bus');
  assert.ok(
    payload.elements.every((element) => {
      const endX = element.x + (element.width ?? 0);
      const endY = element.y + (element.height ?? 0);
      return element.x >= 0 && element.y >= 0 && endX <= SCREEN_WIDTH && endY <= SCREEN_HEIGHT;
    }),
    'every element must stay within the Busy Bar screen bounds',
  );
});
