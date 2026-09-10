/**
 * The unauthenticated root. Three ways in, sharing one aesthetic with the
 * artisan app -- Card rows and BigButton, not a web-style menu -- because
 * coordinators are field staff on the same cheap phones the PRD designs for.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { Card } from '../components/ui';
import { colors, spacing, typography } from '../theme';

import { t } from '../i18n/strings';
import type { AuthStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RoleSelect'>;

const ROLES = [
  { key: 'ArtisanLogin' as const, glyph: '🧵', titleKey: 'artisan', hintKey: 'artisanHint' },
  { key: 'SakhiLogin' as const, glyph: '🤝', titleKey: 'coordinator', hintKey: 'coordinatorHint' },
  { key: 'AdminLogin' as const, glyph: '🛠️', titleKey: 'admin', hintKey: 'adminHint' },
] as const;

export function RoleSelectScreen() {
  const nav = useNavigation<Nav>();
  const s = t();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>{s.appName}</Text>
        <Text style={styles.title}>{s.roleSelect.title}</Text>
        <Text style={styles.subtitle}>{s.roleSelect.subtitle}</Text>

        <View style={styles.list}>
          {ROLES.map((role) => (
            <Card key={role.key} style={styles.cardTouchable}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={s.roleSelect[role.titleKey]}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => nav.navigate(role.key)}
              >
                <Text style={styles.glyph}>{role.glyph}</Text>
                <View style={styles.textCol}>
                  <Text style={styles.roleTitle}>{s.roleSelect[role.titleKey]}</Text>
                  <Text style={styles.roleHint}>{s.roleSelect[role.hintKey]}</Text>
                </View>
              </Pressable>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md, flexGrow: 1, justifyContent: 'center' },
  brand: { ...typography.display, color: colors.primary, textAlign: 'center' },
  title: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.md },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  list: { gap: spacing.md },
  cardTouchable: { padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  glyph: { fontSize: 40 },
  textCol: { flex: 1 },
  roleTitle: { ...typography.heading, color: colors.text },
  roleHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
