import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#f4f6f8',
  card: '#fff',
  primary: '#0a7ea4',
  danger: '#e5484d',
  dangerText: '#b3261e',
  ok: '#1a7f37',
  warn: '#d97706',
  text: '#11181c',
  muted: '#667',
  track: '#e8eef2',
};

export const ui = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: 8, paddingHorizontal: 10, height: 42 },
  muted: { color: colors.muted, fontSize: 13 },
});
