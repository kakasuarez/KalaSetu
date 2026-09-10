/**
 * Phone -> OTP, no PIN. The shape SakhiLoginScreen and AdminLoginScreen both
 * need, parameterised by role rather than duplicated.
 */
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { NumericKeypad } from '../components/NumericKeypad';
import { colors, radius, spacing, typography } from '../theme';

import type { Role } from '../api/auth';
import { t } from '../i18n/strings';
import { useAuth } from '../store/auth';

type Step = 'phone' | 'otp';

const PHONE_LENGTH = 10;

export function CodeLoginScreen({ role, brand }: { role: Role; brand: string }) {
  const { requestOtp, verifyOtp } = useAuth();
  const s = t();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState('');
  const [otpLength, setOtpLength] = useState(4);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setError(s.errors.invalidPhone);
      return;
    }
    void run(async () => {
      const otp = await requestOtp(digits, role);
      setPhone(digits);
      setDevOtp(otp);
      if (otp) setOtpLength(otp.length);
      setDigits('');
      setStep('otp');
    });
  };

  const onVerifyOtp = () =>
    run(async () => {
      await verifyOtp(phone, digits, role);
    });

  const isPhoneStep = step === 'phone';
  const length = isPhoneStep ? PHONE_LENGTH : otpLength;
  const complete = digits.length === length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>{brand}</Text>
        <Text style={styles.title}>
          {isPhoneStep ? s.login.enterPhone : s.login.enterOtp}
        </Text>
        {!isPhoneStep ? (
          <Text style={styles.help}>{s.login.otpSentTo} +91 {phone}</Text>
        ) : null}

        <NumericKeypad
          value={digits}
          onChange={setDigits}
          maxLength={length}
          prefix={isPhoneStep ? '+91' : undefined}
        />

        {devOtp && !isPhoneStep ? (
          <Text style={styles.devNotice}>{s.login.devOtpNotice} {devOtp}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.primary} /> : null}

        <BigButton
          label={isPhoneStep ? s.login.sendOtp : s.login.verify}
          onPress={isPhoneStep ? onSendOtp : onVerifyOtp}
          disabled={!complete || busy}
          loading={busy}
        />

        {!isPhoneStep ? (
          <BigButton
            label={s.login.changeNumber}
            variant="secondary"
            onPress={() => {
              setDigits('');
              setError(null);
              setStep('phone');
            }}
          />
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
});
