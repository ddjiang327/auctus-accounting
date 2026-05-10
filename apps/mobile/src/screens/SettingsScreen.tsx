import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ContactModal } from '../components/ContactModal';
import { ActionButton, Header, ListRow, Screen, SectionTitle, colors } from '../components/ui';
import { auditEntry, latestLockedThrough, todayStr, uid } from '../domain/accounting';
import type { BasBasis, BusinessProfile, Contact, LedgerData } from '../domain/models';

export function SettingsScreen({
  data,
  onDataChange,
  lockEnabled,
  onToggleGst,
  onToggleLock,
  onLockNow,
  onBackup,
  onRestore,
  onReset,
  onSignOut,
  onSwitchWorkspace,
  cloudWorkspace,
  syncState,
  syncError,
}: {
  data: LedgerData;
  onDataChange: (data: LedgerData) => void;
  lockEnabled: boolean;
  onToggleGst: () => void;
  onToggleLock: () => void;
  onLockNow: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onReset: () => void;
  onSignOut?: () => void;
  onSwitchWorkspace?: () => void;
  cloudWorkspace?: string;
  syncState?: 'idle' | 'syncing' | 'error';
  syncError?: string;
}) {
  const [lockOpen, setLockOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [numberingOpen, setNumberingOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const lockedThrough = latestLockedThrough(data);
  const basBasis = data.settings.basBasis || 'cash';

  function setBasBasis(nextBasis: BasBasis) {
    if (nextBasis === basBasis) return;
    onDataChange({
      ...data,
      settings: { ...data.settings, basBasis: nextBasis },
      auditLog: [...(data.auditLog || []), auditEntry('update', 'settings', 'bas_basis', `BAS basis changed to ${nextBasis}`)],
    });
  }

  return (
    <Screen>
      <Header title="Settings" subtitle={cloudWorkspace ? `Cloud workspace: ${cloudWorkspace}` : 'Security and data'} />
      {syncState ? (
        <ListRow
          title={syncState === 'error' ? 'Cloud Sync Error' : syncState === 'syncing' ? 'Cloud Syncing' : 'Cloud Sync Ready'}
          subtitle={syncState === 'error' ? syncError : 'Login, workspace, and ledger sync are enabled'}
          icon={syncState === 'error' ? '!' : '↕'}
          color={syncState === 'error' ? colors.red : colors.blue}
        />
      ) : null}
      <ListRow title="Track GST" subtitle={data.settings.gstEnabled ? 'On' : 'Off'} icon="%" color={colors.blue} right={<ActionButton onPress={onToggleGst} tone="gray">{data.settings.gstEnabled ? 'On' : 'Off'}</ActionButton>} />
      <ListRow title="GST Rate" subtitle="Fixed for Australia" icon="GST" color={colors.orange} right={<Text style={styles.amount}>10%</Text>} />
      <ListRow
        title="BAS Basis"
        subtitle={basBasis === 'cash' ? 'GST reports on payment date' : 'GST reports on document date'}
        icon="BAS"
        color={colors.green}
        right={<BasBasisSwitch value={basBasis} onChange={setBasBasis} />}
      />
      <SectionTitle>Accounting Controls</SectionTitle>
      <ListRow title="Business Profile" subtitle={data.settings.businessProfile.name || 'Set business details'} icon="A" color={colors.blue} onPress={() => setBusinessOpen(true)} />
      <ListRow title="Period Lock" subtitle={lockedThrough ? `Locked through ${lockedThrough}` : 'No locked accounting period'} icon="✓" color={colors.green} onPress={() => setLockOpen(true)} />
      <ListRow title="Document Numbering" subtitle={`${data.settings.invoicePrefix}${data.settings.nextInvoiceNumber} · ${data.settings.billPrefix}${data.settings.nextBillNumber}`} icon="#" color={colors.orange} onPress={() => setNumberingOpen(true)} />
      <SectionTitle>Contacts</SectionTitle>
      <ListRow title="Add Contact" subtitle="Customer or supplier master record" icon="+" color={colors.green} onPress={() => { setEditingContact(null); setContactOpen(true); }} />
      {(data.contacts || []).filter((contact) => !contact.archivedAt).slice(0, 8).map((contact) => (
        <ListRow
          key={contact.id}
          title={contact.name}
          subtitle={`${contact.type} · ${contact.paymentTerms}${contact.abn ? ` · ABN ${contact.abn}` : ''}`}
          icon={contact.type === 'supplier' ? 'S' : contact.type === 'customer' ? 'C' : 'B'}
          color={contact.type === 'supplier' ? colors.orange : colors.blue}
          onPress={() => { setEditingContact(contact); setContactOpen(true); }}
        />
      ))}
      <SectionTitle>Security</SectionTitle>
      <ListRow title="App Lock" subtitle={lockEnabled ? 'PIN and Face ID supported' : 'Off'} icon="🔒" color={colors.blue} right={<ActionButton onPress={onToggleLock} tone="gray">{lockEnabled ? 'On' : 'Off'}</ActionButton>} />
      {lockEnabled ? <ListRow title="Lock Now" icon="↩" color={colors.orange} onPress={onLockNow} /> : null}
      {onSwitchWorkspace ? <ListRow title="Switch Workspace" subtitle="Choose another cloud business" icon="⇄" color={colors.blue} onPress={onSwitchWorkspace} /> : null}
      {onSignOut ? <ListRow title="Sign Out" subtitle="Return to login screen" icon="→" color={colors.red} onPress={onSignOut} /> : null}
      <SectionTitle>Data</SectionTitle>
      <ListRow title="Back Up to File" subtitle="Share a JSON backup" icon="↓" color={colors.blue} onPress={onBackup} />
      <ListRow title="Restore from File" subtitle="Import a JSON backup" icon="↑" color={colors.orange} onPress={onRestore} />
      <ListRow title="Reset Local Data" icon="!" color={colors.red} onPress={onReset} />
      <SectionTitle>Audit Log</SectionTitle>
      {(data.auditLog || []).slice(-8).reverse().map((entry) => (
        <View key={entry.id} style={styles.auditRow}>
          <Text style={styles.auditTitle}>{entry.action} · {entry.entityType}</Text>
          <Text style={styles.auditDetail}>{entry.detail}</Text>
          <Text style={styles.auditDate}>{entry.date.slice(0, 19).replace('T', ' ')}</Text>
        </View>
      ))}
      <PeriodLockModal
        open={lockOpen}
        data={data}
        onClose={() => setLockOpen(false)}
        onSave={(lockedThrough, note) => {
          const lock = { id: uid('lock_'), lockedThrough, note, createdAt: new Date().toISOString() };
          onDataChange({
            ...data,
            periodLocks: [...(data.periodLocks || []), lock],
            auditLog: [...(data.auditLog || []), auditEntry('lock', 'period', lock.id, `Locked through ${lockedThrough}${note ? ` · ${note}` : ''}`)],
          });
          setLockOpen(false);
        }}
        onClear={() => {
          Alert.alert('Clear period locks?', 'This will allow editing entries in previously locked periods.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => {
              onDataChange({
                ...data,
                periodLocks: [],
                auditLog: [...(data.auditLog || []), auditEntry('unlock', 'period', 'all', `Cleared locks through ${latestLockedThrough(data) || 'none'}`)],
              });
              setLockOpen(false);
            } },
          ]);
        }}
      />
      <ContactModal
        open={contactOpen}
        contact={editingContact}
        onClose={() => setContactOpen(false)}
        onSave={(contact) => {
          const exists = data.contacts.some((item) => item.id === contact.id);
          onDataChange({
            ...data,
            contacts: exists ? data.contacts.map((item) => item.id === contact.id ? contact : item) : [...(data.contacts || []), contact],
            auditLog: [...(data.auditLog || []), auditEntry(exists ? 'update' : 'create', 'contact', contact.id, contact.name)],
          });
          setContactOpen(false);
        }}
        onArchive={(contact) => {
          onDataChange({
            ...data,
            contacts: data.contacts.map((item) => item.id === contact.id ? { ...item, archivedAt: new Date().toISOString() } : item),
            auditLog: [...(data.auditLog || []), auditEntry('archive', 'contact', contact.id, contact.name)],
          });
          setContactOpen(false);
        }}
      />
      <NumberingModal
        open={numberingOpen}
        data={data}
        onClose={() => setNumberingOpen(false)}
        onSave={(settings) => {
          onDataChange({
            ...data,
            settings: { ...data.settings, ...settings },
            auditLog: [...(data.auditLog || []), auditEntry('update', 'settings', 'numbering', 'Updated document numbering')],
          });
          setNumberingOpen(false);
        }}
      />
      <BusinessProfileModal
        open={businessOpen}
        profile={data.settings.businessProfile}
        onClose={() => setBusinessOpen(false)}
        onSave={(profile) => {
          onDataChange({
            ...data,
            settings: { ...data.settings, businessProfile: profile },
            auditLog: [...(data.auditLog || []), auditEntry('update', 'settings', 'Updated business profile', profile.name)],
          });
          setBusinessOpen(false);
        }}
      />
    </Screen>
  );
}

function BasBasisSwitch({ value, onChange }: { value: BasBasis; onChange: (value: BasBasis) => void }) {
  return (
    <View style={styles.basisSwitch}>
      {(['cash', 'accrual'] as BasBasis[]).map((option) => (
        <Pressable
          key={option}
          style={[styles.basisButton, value === option && styles.basisActive]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.basisText, value === option && styles.basisActiveText]}>{option === 'cash' ? 'Cash' : 'Accrual'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function BusinessProfileModal({ open, profile, onClose, onSave }: {
  open: boolean;
  profile: BusinessProfile;
  onClose: () => void;
  onSave: (profile: BusinessProfile) => void;
}) {
  const [name, setName] = useState(profile.name || '');
  const [logoUri, setLogoUri] = useState(profile.logoUri || '');
  const [logoText, setLogoText] = useState(profile.logoText || '');
  const [abn, setAbn] = useState(profile.abn || '');
  const [email, setEmail] = useState(profile.email || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [address, setAddress] = useState(profile.address || '');
  const [paymentInstructions, setPaymentInstructions] = useState(profile.paymentInstructions || '');
  const [invoiceFooter, setInvoiceFooter] = useState(profile.invoiceFooter || '');

  useEffect(() => {
    if (!open) return;
    setName(profile.name || '');
    setLogoUri(profile.logoUri || '');
    setLogoText(profile.logoText || '');
    setAbn(profile.abn || '');
    setEmail(profile.email || '');
    setPhone(profile.phone || '');
    setAddress(profile.address || '');
    setPaymentInstructions(profile.paymentInstructions || '');
    setInvoiceFooter(profile.invoiceFooter || '');
  }, [open, profile]);

  function submit() {
    if (!name.trim()) { Alert.alert('Business name required', 'Enter your business name.'); return; }
    onSave({
      name: name.trim(),
      logoUri: logoUri || undefined,
      logoText: logoText.trim() || name.trim().slice(0, 1).toUpperCase(),
      abn: abn.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      paymentInstructions: paymentInstructions.trim() || undefined,
      invoiceFooter: invoiceFooter.trim() || undefined,
    });
  }

  async function pickLogo() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/webp'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType || (asset.name?.toLowerCase().endsWith('.jpg') || asset.name?.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setLogoUri(`data:${mimeType};base64,${base64}`);
    } catch (error) {
      Alert.alert('Logo import failed', error instanceof Error ? error.message : 'Unable to import logo image.');
    }
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Business Profile" subtitle="Used on invoices, receipts, and statements" />
          <View style={styles.logoPanel}>
            <View style={styles.logoPreview}>
              {logoUri ? <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" /> : <Text style={styles.logoPreviewText}>{logoText || name.slice(0, 1) || 'A'}</Text>}
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <ActionButton tone="gray" onPress={pickLogo}>Choose Logo</ActionButton>
              {logoUri ? <ActionButton tone="gray" onPress={() => setLogoUri('')}>Remove Logo</ActionButton> : null}
            </View>
          </View>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Business name" />
          <TextInput style={styles.input} value={logoText} onChangeText={setLogoText} placeholder="Logo text / initials" />
          <TextInput style={styles.input} value={abn} onChangeText={setAbn} placeholder="ABN" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone" />
          <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} placeholder="Business address" multiline />
          <TextInput style={[styles.input, styles.multiline]} value={paymentInstructions} onChangeText={setPaymentInstructions} placeholder="Payment instructions" multiline />
          <TextInput style={[styles.input, styles.multiline]} value={invoiceFooter} onChangeText={setInvoiceFooter} placeholder="Invoice footer" multiline />
          <ActionButton onPress={submit}>Save Business Profile</ActionButton>
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function NumberingModal({ open, data, onClose, onSave }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (settings: Pick<LedgerData['settings'], 'invoicePrefix' | 'billPrefix' | 'nextInvoiceNumber' | 'nextBillNumber'>) => void;
}) {
  const [invoicePrefix, setInvoicePrefix] = useState(data.settings.invoicePrefix);
  const [billPrefix, setBillPrefix] = useState(data.settings.billPrefix);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(String(data.settings.nextInvoiceNumber));
  const [nextBillNumber, setNextBillNumber] = useState(String(data.settings.nextBillNumber));

  function submit() {
    const inv = Number(nextInvoiceNumber);
    const bill = Number(nextBillNumber);
    if (!Number.isInteger(inv) || inv < 1 || !Number.isInteger(bill) || bill < 1) {
      Alert.alert('Invalid numbering', 'Next numbers must be whole numbers above zero.');
      return;
    }
    onSave({ invoicePrefix, billPrefix, nextInvoiceNumber: inv, nextBillNumber: bill });
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Document Numbering" subtitle="Automatic invoice and bill numbering" />
          <TextInput style={styles.input} value={invoicePrefix} onChangeText={setInvoicePrefix} placeholder="Invoice prefix" />
          <TextInput style={styles.input} value={nextInvoiceNumber} onChangeText={setNextInvoiceNumber} placeholder="Next invoice number" keyboardType="number-pad" />
          <TextInput style={styles.input} value={billPrefix} onChangeText={setBillPrefix} placeholder="Bill prefix" />
          <TextInput style={styles.input} value={nextBillNumber} onChangeText={setNextBillNumber} placeholder="Next bill number" keyboardType="number-pad" />
          <ActionButton onPress={submit}>Save Numbering</ActionButton>
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PeriodLockModal({ open, data, onClose, onSave, onClear }: {
  open: boolean;
  data: LedgerData;
  onClose: () => void;
  onSave: (lockedThrough: string, note: string) => void;
  onClear: () => void;
}) {
  const [lockedThrough, setLockedThrough] = useState(latestLockedThrough(data) || todayStr());
  const [note, setNote] = useState('');

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lockedThrough)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');
      return;
    }
    onSave(lockedThrough, note.trim());
  }

  return (
    <Modal visible={open} animationType="slide">
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Header title="Period Lock" subtitle="Prevent edits in closed accounting periods" />
          <TextInput style={styles.input} value={lockedThrough} onChangeText={setLockedThrough} placeholder="Locked through YYYY-MM-DD" />
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>Current lock: {latestLockedThrough(data) || 'None'}</Text>
            <Text style={styles.infoText}>Transactions, payments, and manual journals dated on or before the locked date will be blocked.</Text>
          </View>
          <ActionButton onPress={submit}>Save Lock</ActionButton>
          {(data.periodLocks || []).length ? <ActionButton tone="red" onPress={onClear}>Clear Locks</ActionButton> : null}
          <ActionButton tone="gray" onPress={onClose}>Cancel</ActionButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  basisSwitch: { width: 142, height: 36, flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 10, padding: 2 },
  basisButton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  basisActive: { backgroundColor: '#F8F6F2' },
  basisText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  basisActiveText: { color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: '#E0DDD8', borderRadius: 12, padding: 2 },
  segBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 10 },
  segActive: { backgroundColor: '#F8F6F2' },
  fieldLabel: { marginTop: 4, color: colors.muted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F8F6F2', borderWidth: 1, borderColor: colors.line },
  chipSelected: { borderColor: colors.blue, backgroundColor: '#E8EBF0' },
  chipText: { color: colors.text, fontWeight: '700' },
  logoPanel: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8F6F2', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  logoPreview: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  logoPreviewText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBody: { padding: 16, gap: 12 },
  input: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  multiline: { minHeight: 86, textAlignVertical: 'top' },
  infoBox: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  infoText: { color: colors.muted, fontWeight: '600', marginBottom: 4 },
  auditRow: { backgroundColor: '#F8F6F2', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginBottom: 8 },
  auditTitle: { color: colors.text, fontWeight: '900', textTransform: 'uppercase', fontSize: 12 },
  auditDetail: { color: colors.text, marginTop: 4, fontWeight: '600' },
  auditDate: { color: colors.muted, marginTop: 3, fontSize: 11, fontWeight: '600' },
});
