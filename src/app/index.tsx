import * as Device from 'expo-device';
import { Platform, StyleSheet } from 'react-native'; //NOT IN USE 

import { ThemedText } from '@/components/themed-text'; //NOT IN USE 
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme'; //NOT IN USE 

import DeviceSetupScreen from '@/components/DeviceSetupScreen';
//NOT IN USE 
function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}
// Right now our "homescreen" is the setup interface. This could be changed to the login interface. 
export default function HomeScreen() {
  return <DeviceSetupScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
});

//Note: Everything that is commented "NOT IN USE" is the default settings and code added into all of this, so keep that in mind.
// It doesn't mean we need to delete, it just means we don't understand it and it might break everything if we don't know what it does. 