import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bleManager, type ConnectionState } from '@/ble';

//Main colors used throughout the application, to add/remove a color do it from the object
const colors = {
  navy: '#10213E',
  lime: '#B9EA50',
  background: '#F8FAF8',
  muted: '#4A5B72',
  warning: '#FFF0D4',
  warningBorder: '#906018',
  success: '#E4F6E6',
  successBorder: '#358057',
  lightBlue: '#E8EEF8',
};

// Connection states now come from the BLEManager (src/ble). Today that is the
// simulator; the real ESP32 link will use the same interface.
export default function DeviceSetupScreen() {
  const [state, setState] = useState<ConnectionState>(bleManager.getState());

  // Follow the BLEManager's state instead of the old local timers.
  useEffect(() => bleManager.onStateChange(setState), []);

  const isSim = typeof bleManager.setDemoDistanceCm === 'function';
  const connected = state === 'connected';
  const busy = state === 'scanning' || state === 'connecting';

  const startScan = () => bleManager.scan();
  //Button text gets changed based on the connection state. 
  const buttonLabel = connected
    ? 'Disconnect device'
    : state === 'scanning'
      ? 'Scanning...'
      : state === 'connecting'
        ? 'Connecting...'
        : state === 'found'
          ? 'Scan again'
          : 'Scan for PathGuard device';
  // Everything inside return defines what appears on the screen.
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons
            name="shield-checkmark-outline"
            size={23}
            color={colors.navy}
          />
        </View>
        <Text style={styles.headerTitle}>Device setup</Text>
      </View>

      <ScrollView
        style={styles.surface}
        contentContainerStyle={styles.content}
      >
        {/* Connection status */}
        <View
          style={[
            styles.statusCard,
            connected && styles.connectedCard,
          ]}
        >
          <Ionicons
            name={
              connected
                ? 'checkmark-circle-outline'
                : 'information-circle-outline'
            }
            size={23}
            color={connected ? colors.successBorder : '#674616'}
          />
          <View style={styles.statusText}>
            <Text style={styles.statusHeading}>
              {connected ? 'Connected' : 'Disconnected'}
            </Text>
            <Text style={styles.statusDescription}>
              {connected
                ? 'Your PathGuard device is connected.'
                : 'Your PathGuard device is not connected.'}
            </Text>
          </View>
        </View>

        {/* Bluetooth display */}
        <View style={styles.bluetoothCircle}>
          <Ionicons
            name="bluetooth"
            size={42}
            color={colors.lime}
          />
        </View>

        <Text style={styles.title}>
          {connected
            ? 'PathGuard is ready'
            : 'Connect your PathGuard'}
        </Text>

        <Text style={styles.subtitle}>
          {connected
            ? 'Your device is connected and ready to use.'
            : 'Keep your PathGuard device nearby and turned on.'}
        </Text>

        {/* Scan / Disconnect */}
        <Pressable
          style={[
            styles.scanButton,
            connected && styles.disconnectButton,
            busy && styles.disabledButton,
          ]}
          disabled={busy}
          onPress={
            connected
              ? () => bleManager.disconnect()
              : startScan
          }
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
        >
          {busy ? (
            <ActivityIndicator color={colors.navy} />
          ) : (
            <Ionicons
              name={connected ? 'close-circle-outline' : 'search-outline'}
              size={24}
              color={colors.navy}
            />
          )}
          <Text style={styles.scanButtonText}>
            {buttonLabel}
          </Text>
        </Pressable>

        <Text style={styles.helper}>
          {state === 'scanning'
            ? 'Searching for nearby devices...'
            : state === 'found'
              ? 'Select a device to connect.'
              : state === 'connecting'
                ? 'Establishing connection...'
                : connected
                  ? (isSim ? 'Connected to a simulated device.' : 'Connected to your PathGuard.')
                  : 'Tap to begin scanning.'}
        </Text>

        {/* Available devices */}
        <Text style={styles.sectionTitle}>
          Available devices
        </Text>

        {state === 'disconnected' ? (
          <View style={styles.emptyDeviceCard}>
            <Text style={styles.deviceTitle}>
              No devices found yet
            </Text>
            <Text style={styles.deviceDescription}>
              Start a scan to find nearby PathGuard hardware.
            </Text>
          </View>
        ) : state === 'scanning' ? (
          <View style={styles.emptyDeviceCard}>
            <ActivityIndicator color={colors.navy} />
            <Text style={styles.deviceDescription}>
              Searching for PathGuard...
            </Text>
          </View>
        ) : (
          <Pressable
            style={styles.deviceCard}
            disabled={state !== 'found'}
            onPress={() => bleManager.connect()}
            accessibilityRole="button"
            accessibilityLabel={isSim ? 'Connect to simulated PathGuard device' : 'Connect to selected PathGuard device'}
          >
            <View style={styles.deviceIcon}>
              <Ionicons
                name="bluetooth"
                size={23}
                color={colors.navy}
              />
            </View>

            <View style={styles.deviceDetails}>
              <Text style={styles.deviceTitle}>
                PathGuard Demo
              </Text>
              <Text style={styles.deviceDescription}>
                {connected
                  ? 'Connected (simulation)'
                  : state === 'connecting'
                    ? 'Connecting...'
                    : (isSim ? 'Simulated device - Tap to connect' : 'Bluetooth device - Tap to connect')}
              </Text>
            </View>

            <Ionicons
              name={connected ? 'checkmark-circle' : 'chevron-forward'}
              size={23}
              color={connected ? colors.successBorder : colors.navy}
            />
          </Pressable>
        )}

        {/* Once connected, continue to the device home screen */}
        {connected && (
          <Pressable
            style={styles.continueButton}
            onPress={() => router.push('/device-home')}
            accessibilityRole="button"
            accessibilityLabel="Continue to device home"
          >
            <Text style={styles.scanButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.navy} />
          </Pressable>
        )}

        {/* Information card */}
        <View style={styles.securityCard}>
          <Ionicons
            name="shield-checkmark-outline"
            size={24}
            color={colors.navy}
          />
          <View style={styles.securityText}>
            <Text style={styles.securityHeading}>
              Automatic and secure
            </Text>
            <Text style={styles.securityDescription}>
              PathGuard is designed for automatic device
              connection. Bluetooth security will be
              implemented during hardware integration.
            </Text>
          </View>
        </View>

        <Text style={styles.demoNote}>
          PathGuard v0.1 - Interface simulation
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
// This is where we control the appeareance of the interface
// Reminder: Because were using React, it uses StyleSheet instead of regular CSS
// If you read this please add your name and the date for proof. 
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    height: 66,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 36,
    height: 36,
    backgroundColor: colors.lime,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  surface: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
  },
  //Connection status message styles
  statusCard: {
    backgroundColor: colors.warning,
    borderColor: colors.warningBorder,
    borderWidth: 2,
    borderRadius: 14,
    padding: 15,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  connectedCard: {
    backgroundColor: colors.success,
    borderColor: colors.successBorder,
  },
  statusText: {
    flex: 1,
  },
  statusHeading: {
    fontSize: 19,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: '#614A2D',
    lineHeight: 21,
  },
  //DienteAzul icon and connection instructions
  bluetoothCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.navy,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.muted,
    marginBottom: 18,
  },
  //Main scanning and disconnect button styles. 
  scanButton: {
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.navy,
    borderRadius: 12,
    backgroundColor: colors.lime,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    gap: 12,
  },
  disconnectButton: {
    backgroundColor: colors.lightBlue,
  },
  disabledButton: {
    opacity: 0.65,
  },
  continueButton: {
    minHeight: 58,
    marginTop: 14,
    borderWidth: 2,
    borderColor: colors.navy,
    borderRadius: 12,
    backgroundColor: colors.lime,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanButtonText: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.navy,
  },
  helper: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    marginTop: 11,
    marginBottom: 24,
  },
  //Available devices list and the device info
  sectionTitle: {
    color: colors.navy,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyDeviceCard: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.muted,
    borderRadius: 14,
    padding: 16,
    minHeight: 82,
    justifyContent: 'center',
  },
  deviceCard: {
    borderWidth: 2,
    borderColor: colors.navy,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 82,
    backgroundColor: '#FFFFFF',
  },
  deviceIcon: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.lightBlue,
  },
  deviceDetails: {
    flex: 1,
  },
  deviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
  },
  deviceDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginTop: 3,
  },
  // Security information
  securityCard: {
    marginTop: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: colors.navy,
    borderRadius: 14,
    backgroundColor: colors.lightBlue,
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
  },
  securityText: {
    flex: 1,
  },
  securityHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    marginBottom: 4,
  },
  securityDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  // Version label
  demoNote: {
    fontSize: 12,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 18,
  },
});