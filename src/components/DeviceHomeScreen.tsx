import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { bleManager, type ConnectionState, type DeviceReading } from '@/ble';
import { palette } from '@/constants/palette';
import {
  MAX_SENSITIVITY,
  MIN_SENSITIVITY,
  batteryHoursLeft,
  clampSensitivity,
  pulseIntervalMs,
  sensitivityToThresholdCm,
} from '@/lib/proximity';

const LOW_BATTERY_PERCENT = 15;

// Device Home (Screen 4; FR-4, FR-5, FR-11). Shows live data from the
// BLEManager (simulated for now), and sends a sensitivity change back to it.
export default function DeviceHomeScreen() {
  const [state, setState] = useState<ConnectionState>(bleManager.getState());
  const [reading, setReading] = useState<DeviceReading | null>(null);
  const [sensitivity, setSensitivity] = useState(7);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [buzzOn, setBuzzOn] = useState(false);
  const [demoCm, setDemoCm] = useState<number | null>(null);

  useEffect(() => {
    const offState = bleManager.onStateChange(setState);
    const offData = bleManager.onData(setReading);
    return () => {
      offState();
      offData();
    };
  }, []);

  const connected = state === 'connected';
  const hasDemo = typeof bleManager.setDemoDistanceCm === 'function';
  const thresholdCm = sensitivityToThresholdCm(sensitivity);
  const interval = reading ? pulseIntervalMs(reading.distanceCm, thresholdCm) : null;
  const battery = reading?.batteryPercent ?? null;
  const lowBattery = battery !== null && battery <= LOW_BATTERY_PERCENT;

  // Phone buzzes at the same rate the device would (Android and iOS both play a short buzz).
  useEffect(() => {
    if (!buzzOn || !connected || interval === null) return;
    const id = setInterval(() => Vibration.vibrate(80), interval);
    return () => clearInterval(id);
  }, [buzzOn, connected, interval]);

  // The simulator clears its held distance on disconnect, so clear the label too.
  useEffect(() => {
    if (!connected) setDemoCm(null);
  }, [connected]);

  const holdDistance = (cm: number | null) => {
    bleManager.setDemoDistanceCm?.(cm);
    setDemoCm(cm);
  };

  const changeSensitivity = async (delta: number) => {
    const next = clampSensitivity(sensitivity + delta);
    if (next === sensitivity) return;
    setSensitivity(next);
    try {
      await bleManager.sendSettings({ sensitivity: next });
      setSendStatus(`Sensitivity ${next} of ${MAX_SENSITIVITY} sent to your PathGuard.`);
    } catch {
      setSendStatus('Could not reach your PathGuard. Connect it, then try again.');
    }
  };

  // Phone-side preview of the device buzz. Android plays the pattern; iOS
  // plays one short buzz (iOS ignores patterns).
  const testVibration = () => {
    if (Platform.OS === 'android') Vibration.vibrate([0, 250, 120, 250]);
    else Vibration.vibrate();
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark-outline" size={23} color={palette.navy} />
        </View>
        <Text style={styles.headerTitle} accessibilityRole="header">
          PathGuard
        </Text>
        {hasDemo && (
          <View style={styles.badge} accessible accessibilityLabel="Simulated device">
            <Text style={styles.badgeText}>SIMULATED</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.surface} contentContainerStyle={styles.content}>
        {/* Connection status: announced when it changes */}
        <View
          style={[styles.card, connected ? styles.okCard : styles.warnCard]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons
            name={connected ? 'checkmark-circle-outline' : 'information-circle-outline'}
            size={24}
            color={connected ? palette.okText : palette.warnText}
          />
          <View style={styles.flex}>
            <Text style={[styles.bigText, { color: connected ? palette.okText : palette.warnText }]}>
              {connected ? 'Connected' : 'Disconnected'}
            </Text>
            <Text style={[styles.bodyText, { color: connected ? palette.okText : palette.warnText }]}>
              {connected ? 'Your PathGuard is ready.' : 'Your PathGuard is not connected.'}
            </Text>
          </View>
        </View>

        {!connected && (
          <Pressable
            style={styles.primary}
            onPress={() => router.replace('/setup')}
            accessibilityRole="button"
            accessibilityLabel="Go to device setup"
          >
            <Text style={styles.primaryText}>Go to device setup</Text>
          </Pressable>
        )}

        {connected && lowBattery && (
          <View style={[styles.card, styles.warnCard]} accessibilityRole="alert">
            <Ionicons name="battery-dead-outline" size={24} color={palette.warnText} />
            <Text style={[styles.bigText, { color: palette.warnText, flex: 1 }]}>
              Battery low: {battery}%. Charge your PathGuard soon.
            </Text>
          </View>
        )}

        {connected && (
          <>
            {/* Battery */}
            <View style={styles.plainCard}>
              <View style={styles.spread}>
                <Text style={styles.bodyBold}>Battery</Text>
                <Text style={styles.bigText}>{battery !== null ? `${battery}%` : '--'}</Text>
              </View>
              <View
                style={styles.track}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Battery level"
                accessibilityValue={{ min: 0, max: 100, now: battery ?? 0 }}
              >
                <View style={[styles.fill, { width: `${battery ?? 0}%` }]} />
              </View>
              <Text style={styles.hint}>
                {battery !== null ? `About ${batteryHoursLeft(battery)} hours left` : (reading ? 'Battery not reported by the device yet' : 'Waiting for data...')}
              </Text>
            </View>

            {/* Live distance and what the device is doing about it */}
            <View style={styles.plainCard}>
              <Text style={styles.bodyBold}>Nearest obstacle</Text>
              <Text style={styles.distance}>
                {reading ? `${(reading.distanceCm / 100).toFixed(1)} m` : '--'}
              </Text>
              <Text style={styles.hint}>
                {reading === null
                  ? 'Waiting for data...'
                  : interval === null
                    ? 'Outside detection range. No vibration.'
                    : `Vibrating about every ${(interval / 1000).toFixed(1)} seconds`}
              </Text>
            </View>

            {/* Sensitivity (FR-5) */}
            <View style={styles.plainCard}>
              <View style={styles.spread}>
                <Text style={styles.bodyBold}>Sensitivity</Text>
                <Text style={styles.bigText}>
                  {sensitivity} of {MAX_SENSITIVITY}
                </Text>
              </View>
              <Text style={styles.hint}>
                Detects obstacles within {(thresholdCm / 100).toFixed(1)} m
              </Text>
              <View style={styles.stepRow}>
                <Pressable
                  style={[styles.stepButton, sensitivity <= MIN_SENSITIVITY && styles.disabled]}
                  onPress={() => changeSensitivity(-1)}
                  disabled={sensitivity <= MIN_SENSITIVITY}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease sensitivity"
                >
                  <Ionicons name="remove" size={28} color={palette.navy} />
                  <Text style={styles.stepText}>Lower</Text>
                </Pressable>
                <Pressable
                  style={[styles.stepButton, sensitivity >= MAX_SENSITIVITY && styles.disabled]}
                  onPress={() => changeSensitivity(1)}
                  disabled={sensitivity >= MAX_SENSITIVITY}
                  accessibilityRole="button"
                  accessibilityLabel="Increase sensitivity"
                >
                  <Ionicons name="add" size={28} color={palette.navy} />
                  <Text style={styles.stepText}>Higher</Text>
                </Pressable>
              </View>
              {sendStatus && (
                <Text style={styles.hint} accessibilityLiveRegion="polite">
                  {sendStatus}
                </Text>
              )}
            </View>

            <Pressable
              style={[styles.outline, buzzOn && styles.outlineOn]}
              onPress={() => setBuzzOn((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: buzzOn }}
              accessibilityLabel="Buzz this phone with the obstacle distance"
            >
              <Ionicons name="pulse-outline" size={24} color={palette.navy} />
              <Text style={styles.outlineText}>
                Phone buzz follows distance: {buzzOn ? 'On' : 'Off'}
              </Text>
            </Pressable>

            {hasDemo && (
              <View style={styles.plainCard}>
                <Text style={styles.bodyBold}>Demo controls</Text>
                <Text style={styles.hint}>
                  {demoCm === null
                    ? 'Distance is sweeping automatically.'
                    : `Distance held at ${(demoCm / 100).toFixed(1)} m.`}
                </Text>
                <View style={styles.stepRow}>
                  <Pressable
                    style={styles.stepButton}
                    onPress={() => holdDistance(40)}
                    accessibilityRole="button"
                    accessibilityLabel="Simulate a close obstacle"
                  >
                    <Text style={styles.stepText}>Close</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepButton}
                    onPress={() => holdDistance(150)}
                    accessibilityRole="button"
                    accessibilityLabel="Simulate a medium distance obstacle"
                  >
                    <Text style={styles.stepText}>Medium</Text>
                  </Pressable>
                  <Pressable
                    style={styles.stepButton}
                    onPress={() => holdDistance(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Resume automatic distance sweep"
                  >
                    <Text style={styles.stepText}>Auto</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Pressable
              style={styles.outline}
              onPress={testVibration}
              accessibilityRole="button"
              accessibilityLabel="Test vibration on this phone"
            >
              <Ionicons name="phone-portrait-outline" size={24} color={palette.navy} />
              <Text style={styles.outlineText}>Test vibration</Text>
            </Pressable>

            <Pressable
              style={styles.outline}
              onPress={() => bleManager.disconnect()}
              accessibilityRole="button"
              accessibilityLabel="Disconnect device"
            >
              <Ionicons name="close-circle-outline" size={24} color={palette.navy} />
              <Text style={styles.outlineText}>Disconnect device</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.footer}>PathGuard v0.1 - simulated device data</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: palette.navy },
  header: { height: 66, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF' },
  surface: {
    flex: 1,
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  content: { padding: 18, gap: 12, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 14,
    borderWidth: 2,
    borderRadius: 14,
  },
  okCard: { backgroundColor: palette.okBg, borderColor: palette.okBorder },
  warnCard: { backgroundColor: palette.warnBg, borderColor: palette.warnBorder },
  plainCard: {
    padding: 14,
    gap: 6,
    backgroundColor: palette.card,
    borderWidth: 2,
    borderColor: palette.navy,
    borderRadius: 14,
  },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigText: { fontSize: 20, fontWeight: '700', color: palette.navy },
  bodyText: { fontSize: 16, lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '600', color: palette.navy },
  hint: { fontSize: 15, lineHeight: 22, color: palette.muted },
  distance: { fontSize: 40, fontWeight: '700', color: palette.navy },
  track: {
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.track,
    borderWidth: 2,
    borderColor: palette.navy,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: palette.link },
  stepRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  stepButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.infoBg,
    borderWidth: 2,
    borderColor: palette.navy,
    borderRadius: 12,
  },
  stepText: { fontSize: 16, fontWeight: '600', color: palette.navy },
  disabled: { opacity: 0.5 },
  primary: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.navy,
    borderRadius: 12,
  },
  primaryText: { fontSize: 18, fontWeight: '700', color: palette.navy },
  outline: {
    minHeight: 56,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.card,
    borderWidth: 2,
    borderColor: palette.navy,
    borderRadius: 12,
  },
  outlineOn: { backgroundColor: palette.okBg },
  badge: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: palette.lime,
  },
  badgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: palette.navy },
  outlineText: { fontSize: 17, fontWeight: '600', color: palette.navy },
  footer: { fontSize: 12, textAlign: 'center', color: palette.muted, marginTop: 6 },
});
