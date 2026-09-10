/**
 * List, add and remove coordinators. Same Card/BigButton aesthetic as the
 * artisan flow.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../api/errors';
import { BigButton } from '../components/BigButton';
import { Card, EmptyState, SectionHeading } from '../components/ui';
import { colors, radius, spacing, typography } from '../theme';

import { adminApi, Coordinator } from '../api/admin';
import { t } from '../i18n/strings';
import { useAuth } from '../store/auth';

export function AdminDashboardScreen() {
  const { signOut } = useAuth();
  const s = t();

  const [coordinators, setCoordinators] = useState<Coordinator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCoordinators(await adminApi.listCoordinators());
      setError(null);
    } catch (e) {
      setError(messageFor(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async () => {
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''))) {
      setError(s.errors.invalidPhone);
      return;
    }
    if (!name.trim()) {
      setError(s.errors.invalidInput);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.createCoordinator(phone, name.trim());
      setPhone('');
      setName('');
      await load();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = (coordinator: Coordinator) => {
    Alert.alert(
      s.admin.removeConfirmTitle,
      s.admin.removeConfirmBody,
      [
        { text: s.common.cancel, style: 'cancel' },
        {
          text: s.admin.remove,
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.removeCoordinator(coordinator.id);
              await load();
            } catch (e) {
              setError(messageFor(e));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <SectionHeading
        title={s.admin.title}
        action={{ label: s.home.signOut, onPress: signOut }}
      />

      <FlatList
        contentContainerStyle={styles.list}
        data={coordinators ?? []}
        keyExtractor={(c) => c.id}
        ListEmptyComponent={
          coordinators === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : (
            <EmptyState glyph="🤝" title={s.admin.empty} body={s.admin.emptyHint} />
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.display_name || item.phone}</Text>
              <Text style={styles.rowSubtitle}>{item.phone}</Text>
              <Text style={styles.rowMeta}>{s.admin.artisanCount(item.artisan_count)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.admin.remove}
              onPress={() => onRemove(item)}
              hitSlop={8}
              style={({ pressed }) => [styles.removeBtn, pressed && styles.removeBtnPressed]}
            >
              <Text style={styles.removeLabel}>{s.admin.remove}</Text>
            </Pressable>
          </Card>
        )}
        ListFooterComponent={
          <Card style={styles.form}>
            <Text style={styles.formTitle}>{s.admin.add}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={s.admin.name}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder={s.admin.phone}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={10}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <BigButton label={s.admin.add} onPress={onAdd} loading={busy} />
          </Card>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { marginTop: spacing.xl },
  list: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  rowTitle: { ...typography.bodyBold, color: colors.text },
  rowSubtitle: { ...typography.caption, color: colors.textMuted },
  rowMeta: { ...typography.caption, color: colors.primary, marginTop: 2 },
  removeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.errorSoft,
  },
  removeBtnPressed: { opacity: 0.7 },
  removeLabel: { ...typography.label, color: colors.error },
  form: { gap: spacing.sm, marginTop: spacing.md },
  formTitle: { ...typography.heading, color: colors.text },
  input: {
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 48,
  },
  error: { ...typography.caption, color: colors.error },
});
