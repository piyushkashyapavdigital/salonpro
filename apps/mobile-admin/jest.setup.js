/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: apps/mobile-shared/jest.setup.js
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
// Jest setup shared by both React Native apps (customer + admin).
//
// The screens are plain StyleSheet + core React, so the only things that need
// stand-ins are the four native modules below — jest runs in Node, where none
// of them have a native side.
//
// This file lives in apps/mobile-shared/ and is copied into each app by
// scripts/sync-mobile-shared.sh (the copies carry a GENERATED header).

// Icons: the screens import `react-native-vector-icons/MaterialIcons`; a
// string mock makes it a regular host component under the test renderer.
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');

// Gradients: render a plain View so layouts using LinearGradient still mount.
jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  const LinearGradient = props => React.createElement(View, props, props.children);
  return { __esModule: true, default: LinearGradient };
});

// Safe areas: the package ships its own jest mock (fixed insets of 0).
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// AsyncStorage: v3 no longer ships a jest mock, and the apps only use
// get/set/remove — a tiny in-memory Map is a faithful stand-in.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: async key => (store.has(key) ? store.get(key) : null),
      setItem: async (key, value) => {
        store.set(key, value);
      },
      removeItem: async key => {
        store.delete(key);
      },
      clear: async () => {
        store.clear();
      },
    },
  };
});
