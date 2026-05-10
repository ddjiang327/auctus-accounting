import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../components/ui';
import { createBusiness, type BusinessSummary } from '../api/cloudApi';

interface WorkspaceSelectorScreenProps {
  businesses: BusinessSummary[];
  onSelect: (business: BusinessSummary) => Promise<void>;
  onSignOut: () => void;
}

export function WorkspaceSelectorScreen({ businesses, onSelect, onSignOut }: WorkspaceSelectorScreenProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function handleSelect(business: BusinessSummary) {
    setLoadingId(business.id);
    setError('');
    try {
      await onSelect(business);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace load failed');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLoadingId('new');
    setError('');
    try {
      const business = await createBusiness(trimmed);
      setNewName('');
      setCreating(false);
      await onSelect(business);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace create failed');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.mark}>A</Text>
        <Text style={styles.title}>Choose Workspace</Text>
        <Text style={styles.subtitle}>Select the business to open</Text>
      </View>
      <View style={styles.list}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {businesses.map((business) => (
          <Pressable
            key={business.id}
            style={styles.item}
            onPress={() => handleSelect(business)}
            disabled={loadingId !== null}
          >
            <View style={styles.itemContent}>
              <Text style={styles.itemName}>{business.name}</Text>
              <Text style={styles.itemMeta}>{business.currency} · {business.role}</Text>
            </View>
            {loadingId === business.id
              ? <ActivityIndicator color={colors.blue} />
              : <Text style={styles.arrow}>›</Text>}
          </Pressable>
        ))}
        {!businesses.length ? <Text style={styles.empty}>No workspaces yet. Create one to start a cloud ledger.</Text> : null}
      </View>
      {creating ? (
        <View style={styles.createPanel}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="New workspace name"
            placeholderTextColor={colors.muted}
            editable={loadingId === null}
          />
          <View style={styles.createActions}>
            <Pressable style={styles.secondaryButton} onPress={() => setCreating(false)} disabled={loadingId !== null}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleCreate} disabled={loadingId !== null}>
              {loadingId === 'new' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.createButton} onPress={() => setCreating(true)} disabled={loadingId !== null}>
          <Text style={styles.createText}>+ Create new workspace</Text>
        </Pressable>
      )}
      <Pressable style={styles.signOut} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111827', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32, marginTop: 40 },
  mark: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#1A1916', color: '#F0EDE8', textAlign: 'center', lineHeight: 58, fontSize: 28, fontWeight: '900', overflow: 'hidden', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)' },
  list: { gap: 10 },
  error: { color: '#FCA5A5', fontSize: 13, textAlign: 'center', marginBottom: 6 },
  empty: { color: 'rgba(255,255,255,0.55)', textAlign: 'center', fontSize: 14, paddingVertical: 18 },
  item: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  itemContent: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '800', color: colors.text },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  arrow: { fontSize: 22, color: colors.muted, fontWeight: '300' },
  createButton: { marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 15, alignItems: 'center' },
  createText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  createPanel: { marginTop: 16, backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 12 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, color: colors.text, fontSize: 15 },
  createActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '800' },
  primaryButton: { flex: 1, backgroundColor: '#1A1916', borderRadius: 12, padding: 13, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  signOut: { marginTop: 'auto', paddingTop: 24, alignItems: 'center' },
  signOutText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});
