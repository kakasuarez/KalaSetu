/**
 * Phone -> OTP -> PIN, entirely on a numeric keypad.
 *
 * A returning artisan lands straight on the PIN step because her number is
 * remembered, so the everyday path is four taps and no waiting for an SMS.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { NumericKeypad } from '../components/NumericKeypad';
import { t } from '../i18n';
import { useAuth } from '../store/auth';
import { colors, radius, spacing, typography } from '../theme';

type Step = 'phone' | 'otp' | 'pin' | 'createPin' | 'confirmPin';

const PIN_LENGTH = 4;
const PHONE_LENGTH = 10;

export function OnboardScreen() {
  const { requestOtp, verifyOtp, pinLogin, setPin, lastPhone } = useAuth();
  const s = t();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [otpLength, setOtpLength] = useState(4);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A returning artisan should not retype her number.
  useEffect(() => {
    if (lastPhone) {
      setPhone(lastPhone.replace('+91', ''));
      setStep('pin');
    }
  }, [lastPhone]);

  const reset = (next: Step) => {
    setDigits('');
    setError(null);
    setStep(next);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const onSendOtp = () => {
    // Validated here rather than relying on the server's generic
    // VALIDATION_ERROR, so the message names the actual problem. Indian mobile
    // numbers start 6-9; the keypad already guarantees the length.
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(s.errors.invalidPhone);
      return;
    }
    void run(async () => {
      const otp = await requestOtp(digits);
      setPhone(digits);
      setDevOtp(otp);
      if (otp) setOtpLength(otp.length);
      reset('otp');
    });
  };

  const onVerifyOtp = () =>
    run(async () => {
      const session = await verifyOtp(phone, digits);
      // No PIN yet means this is a first login; send her straight to setting one.
      if (!session.pinSet) reset('createPin');
    });

  const onPinLogin = () => run(async () => void (await pinLogin(phone, digits)));

  const onCreatePin = () => {
    setFirstPin(digits);
    reset('confirmPin');
  };

  const onConfirmPin = () => {
    // Handled inline rather than thrown: this is a local mismatch, not an API
    // failure, and messageFor() would label it a network error.
    if (digits !== firstPin) {
      setDigits('');
      setStep('createPin');
      setError(s.onboard.pinMismatch);
      return;
    }
    void run(async () => {
      await setPin(digits);
    });
  };

  const config: Record<Step, { title: string; help?: string; length: number;
                              secure: boolean; action: string; onPress: () => void }> = {
    phone: { title: s.onboard.enterPhone, length: PHONE_LENGTH, secure: false,
             action: s.onboard.sendOtp, onPress: onSendOtp },
    otp: { title: s.onboard.enterOtp, help: `${s.onboard.otpSentTo} +91 ${phone}`,
           length: otpLength, secure: false, action: s.onboard.verify, onPress: onVerifyOtp },
    pin: { title: s.onboard.enterPin, help: `+91 ${phone}`, length: PIN_LENGTH,
           secure: true, action: s.common.next, onPress: onPinLogin },
    createPin: { title: s.onboard.createPin, help: s.onboard.createPinHelp,
                 length: PIN_LENGTH, secure: true, action: s.common.next,
                 onPress: onCreatePin },
    confirmPin: { title: s.onboard.confirmPin, length: PIN_LENGTH, secure: true,
                  action: s.common.done, onPress: onConfirmPin },
  };

  const current = config[step];
  const complete = digits.length === current.length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>{s.appName}</Text>
        <Text style={styles.title}>{current.title}</Text>
        {current.help ? <Text style={styles.help}>{current.help}</Text> : null}

        <NumericKeypad
          value={digits}
          onChange={setDigits}
          maxLength={current.length}
          secure={current.secure}
          prefix={step === 'phone' ? '+91' : undefined}
          deleteLabel={s.common.delete}
        />

        {devOtp && step === 'otp' ? (
          <Text style={styles.devNotice}>
            {s.onboard.devOtpNotice} {devOtp}
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.primary} /> : null}

        <BigButton
          label={current.action}
          onPress={current.onPress}
          disabled={!complete || busy}
          loading={busy}
        />

        {step === 'pin' ? (
          <View style={styles.links}>
            <BigButton
              label={s.onboard.useOtpInstead}
              variant="secondary"
              onPress={() => {
                setDigits(phone);
                reset('phone');
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  brand: { ...typography.display, color: colors.primary, textAlign: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  help: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  error: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  devNotice: { ...typography.mono, color: colors.warn, textAlign: 'center' },
  links: { marginTop: spacing.sm },
});
