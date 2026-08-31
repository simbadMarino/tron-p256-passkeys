/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_RP_ID?: string;
    EXPO_PROJECT_ID?: string;
  }
}
