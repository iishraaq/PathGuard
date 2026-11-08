import * as SplashScreen from 'expo-splash-screen';


import { Stack } from 'expo-router';

SplashScreen.preventAutoHideAsync();

//Main navigation configuration layout of PathGuard. 
export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        //We don't show the defaut header
        headerShown: false,
      }}
    />
  );
}