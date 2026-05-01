import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, colors } from './ui';

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <View style={styles.fieldText}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={styles.fieldValue} numberOfLines={1}>{selected?.label || 'Select'}</Text>
          {selected?.detail ? <Text style={styles.fieldDetail} numberOfLines={1}>{selected.detail}</Text> : null}
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={styles.list}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.option, option.value === value && styles.optionActive]}
                  onPress={() => { onChange(option.value); setOpen(false); }}
                >
                  <Text style={styles.optionText}>{option.label}</Text>
                  {option.detail ? <Text style={styles.optionDetail}>{option.detail}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <ActionButton tone="gray" onPress={() => setOpen(false)}>Cancel</ActionButton>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8F6F2', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  fieldText: { flex: 1, minWidth: 0 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  fieldValue: { marginTop: 3, color: colors.text, fontSize: 16, fontWeight: '800' },
  fieldDetail: { marginTop: 2, color: colors.muted, fontSize: 12 },
  chevron: { marginLeft: 12, color: colors.muted, fontSize: 22, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 12 },
  sheetTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  list: { maxHeight: 420 },
  option: { backgroundColor: '#F8F6F2', padding: 13, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.line },
  optionActive: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  optionText: { color: colors.text, fontWeight: '700' },
  optionDetail: { marginTop: 2, color: colors.muted, fontSize: 12 },
});
