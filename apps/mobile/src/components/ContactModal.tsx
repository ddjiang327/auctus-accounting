import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { uid } from '../domain/accounting';
import type { Contact, ContactType, PaymentTerms } from '../domain/models';
import { ActionButton, Header, colors } from './ui';

export function ContactModal({ open, contact, defaultType = 'customer', onClose, onSave, onArchive }: {
  open: boolean;
  contact: Contact | null;
  defaultType?: ContactType;
  onClose: () => void;
  onSave: (contact: Contact) => void;
  onArchive?: (contact: Contact) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>(defaultType);
  const [abn, setAbn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('net_30');

  useEffect(() => {
    if (!open) return;
    setName(contact?.name || '');
    setType(contact?.type || defaultType);
    setAbn(contact?.abn || '');
    setEmail(contact?.email || '');
    setPhone(contact?.phone || '');
    setAddress(contact?.address || '');
    setPaymentTerms(contact?.paymentTerms || 'net_30');
  }, [contact, defaultType, open]);

  function submit() {
    if (!name.trim()) { Alert.alert('Name required', 'Enter a contact name.'); return; }
    onSave({
      id: contact?.id || uid('ct_'),
      type,
      name: name.trim(),
      abn: abn.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      paymentTerms,
      createdAt: contact?.createdAt || new Date().toISOString(),
      archivedAt: contact?.archivedAt,
    });
    setName('');
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title={contact ? 'Edit Contact' : 'New Contact'} subtitle="Customer and supplier master data" />
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" />
          <View style={styles.segment}>
            {(['customer', 'supplier', 'both'] as ContactType[]).map((item) => (
              <Pressable key={item} style={[styles.segBtn, type === item && styles.segActive]} onPress={() => setType(item)}>
                <Text>{item}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={abn} onChangeText={setAbn} placeholder="ABN" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" />
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Address" />
          <Text style={styles.fieldLabel}>Default Terms</Text>
          <View style={styles.chipGrid}>
            {(['due_on_receipt', 'net_7', 'net_14', 'net_30', 'net_60'] as PaymentTerms[]).map((term) => (
              <Pressable key={term} style={[styles.chip, paymentTerms === term && styles.chipSelected]} onPress={() => setPaymentTerms(term)}>
                <Text style={styles.chipText}>{term === 'due_on_receipt' ? 'Due now' : term.replace('_', ' ').toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <ActionButton onPress={submit}>Save Contact</ActionButton>
          {contact && onArchive ? <ActionButton tone="red" onPress={() => onArchive(contact)}>Archive Contact</ActionButton> : null}
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBody: { padding: 16, gap: 12 },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  segment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700' },
});
