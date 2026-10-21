module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // @react-navigation and most react-native-* packages ship untranspiled
  // ESM/Flow; the RN preset only transforms react-native itself.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation)/)',
  ],
};
