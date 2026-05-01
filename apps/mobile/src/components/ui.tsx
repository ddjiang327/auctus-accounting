import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const colors = {
  bg: '#EDEBE6',
  card: '#F8F6F2',
  text: '#1A1916',
  muted: '#9A9590',
  line: 'rgba(0,0,0,0.07)',
  blue: '#4A5568',
  green: '#3D7856',
  red: '#8A4A3A',
  orange: '#C07830',
  purple: '#6B5B95',
};

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.h1}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'hero' | 'green' }) {
  return <View style={[styles.card, tone === 'hero' && styles.hero, tone === 'green' && styles.greenHero]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function ListRow({
  icon,
  color,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon?: string;
  color?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      {icon ? <View style={[styles.icon, { backgroundColor: color || colors.blue }]}><Text style={styles.iconText}>{icon}</Text></View> : null}
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </Pressable>
  );
}

export function ActionButton({ children, onPress, tone = 'blue' }: { children: ReactNode; onPress: () => void; tone?: 'blue' | 'green' | 'red' | 'gray' }) {
  const bg = tone === 'green' ? colors.green : tone === 'red' ? colors.red : tone === 'gray' ? '#E0DDD8' : colors.blue;
  return (
    <Pressable style={[styles.button, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={[styles.buttonText, tone === 'gray' && { color: colors.text }]}>{children}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  h1: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.07)',
  },
  hero: {
    backgroundColor: '#1A1916',
  },
  greenHero: {
    backgroundColor: colors.green,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  rowSub: {
    marginTop: 3,
    fontSize: 12,
    color: colors.muted,
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  button: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
