/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let app!: ReactTestRenderer.ReactTestRenderer;

  // Async act so the app's first storage read / state update is flushed.
  await ReactTestRenderer.act(async () => {
    app = ReactTestRenderer.create(<App />);
  });

  // Let first-run effects settle (stored session → gate → sign-in screen).
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => {
      setTimeout(() => resolve(), 0);
    });
  });

  expect(app.toJSON()).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    app.unmount();
  });
});
