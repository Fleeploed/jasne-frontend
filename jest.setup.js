// Silence Intl warnings in test environment
global.__DEV__ = true;

// Modules that reach AsyncStorage (e.g. the React Query persister in
// queryClient.ts) would otherwise fail to import under Jest with
// "NativeModule: AsyncStorage is null". Use the library's official mock.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
