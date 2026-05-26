import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../components/ui';

interface ModeSelectorScreenProps {
  onChooseLocal: () => void;
  onChooseCloud: () => void;
}

export function ModeSelectorScreen({ onChooseLocal, onChooseCloud }: ModeSelectorScreenProps) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.panel}>
        <Text style={styles.mark}>A</Text>
        <Text style={styles.title}>Welcome to Auctus</Text>
        <Text style={styles.subtitle}>How would you like to use the app?</Text>
        <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={onChooseLocal}>
          <Text style={styles.optionIcon}>💾</Text>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Use locally</Text>
            <Text style={styles.optionMeta}>Free · No account · Data stays on this device</Text>
          </View>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.option, pressed && styles.optionPressed]} onPress={onChooseCloud}>
          <Text style={styles.optionIcon}>☁</Text>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Sign in</Text>
            <Text style={styles.optionMeta}>Sync across devices · Cloud backup</Text>
          </View>
        </Pressable>
        <Text style={styles.note}>You can switch modes later in Settings.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', gap: 12 },
  mark: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#1A1916', color: '#F0EDE8', textAlign: 'center', lineHeight: 58, fontSize: 28, fontWeight: '900', overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: 4 },
  option: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
  optionPressed: { backgroundColor: '#F8F6F2' },
  optionIcon: { fontSize: 22 },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  optionMeta: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '600' },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingHorizontal: 8 },
});
