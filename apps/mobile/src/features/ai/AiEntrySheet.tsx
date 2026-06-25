import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LedgerData, Transaction } from '../../domain/models';
import { parseTransactionText, type ParseDraft } from './aiApi';
import { buildSuggestions } from './aiSuggestions';

let ExpoSpeechRec: typeof import('expo-speech-recognition') | null = null;
try {
  ExpoSpeechRec = require('expo-speech-recognition');
} catch {
  // Running in Expo Go — voice unavailable
}

// Inline event type so we don't need a top-level import from the optional module
type SpeechResultEvent = { isFinal: boolean; results: Array<{ transcript: string }> };

// Separate component so useSpeechRecognitionEvent is always called at top level
function SpeechListeners({
  onResult,
  onError,
  onEnd,
}: {
  onResult: (e: SpeechResultEvent) => void;
  onError: () => void;
  onEnd: () => void;
}) {
  const { useSpeechRecognitionEvent } = ExpoSpeechRec!;
  useSpeechRecognitionEvent('result', onResult as Parameters<typeof useSpeechRecognitionEvent<'result'>>[1]);
  useSpeechRecognitionEvent('error', onError);
  useSpeechRecognitionEvent('end', onEnd);
  return null;
}

interface AiEntrySheetProps {
  data: LedgerData;
  mode: 'local' | 'cloud';
  getToken: () => Promise<string | null>;
  onParsed: (draft: Partial<Transaction>) => void;
  onClose: () => void;
}

type VoiceState = 'idle' | 'listening' | 'done';

const colors = {
  bg: '#EDEBE6',
  card: '#F8F6F2',
  surface: '#FFFFFF',
  text: '#1A1916',
  muted: '#9A9590',
  line: 'rgba(0,0,0,0.07)',
  blue: '#4A5568',
  green: '#3D7856',
  red: '#8A4A3A',
  orange: '#C07830',
  overlay: 'rgba(0,0,0,0.45)',
};

const HINTS = [
  'Bought office supplies for $85',
  'Sent ABC Company a $2,000 invoice',
  'Paid electricity bill $220',
  'Transferred $500 to petty cash',
];

export function AiEntrySheet({ data, mode, getToken, onParsed, onClose }: AiEntrySheetProps) {
  const [text, setText] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ParseDraft | null>(null);
  const [hint] = useState(() => HINTS[Math.floor(Math.random() * HINTS.length)]);
  const slideAnim = useRef(new Animated.Value(400)).current;
  const inputRef = useRef<TextInput>(null);

  const speechAvailable = ExpoSpeechRec !== null && Platform.OS !== 'web';
  const suggestions = useMemo(() => buildSuggestions(data, text), [data, text]);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    setTimeout(() => inputRef.current?.focus(), 400);
  }, [slideAnim]);

  const handleSpeechResult = useCallback((e: SpeechResultEvent) => {
    const transcript = e.results[0]?.transcript;
    if (transcript) setText(transcript);
    if (e.isFinal) setVoiceState('done');
  }, []);

  const handleSpeechError = useCallback(() => setVoiceState('idle'), []);
  const handleSpeechEnd = useCallback(
    () => setVoiceState((s) => s === 'listening' ? 'done' : s),
    [],
  );

  async function toggleVoice() {
    if (!ExpoSpeechRec) return;
    const { ExpoSpeechRecognitionModule } = ExpoSpeechRec;

    if (voiceState === 'listening') {
      ExpoSpeechRecognitionModule.stop();
      setVoiceState('done');
      return;
    }

    const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (status !== 'granted') {
      setError('Microphone permission denied.');
      return;
    }

    setText('');
    setDraft(null);
    setError('');
    setVoiceState('listening');
    Keyboard.dismiss();
    ExpoSpeechRecognitionModule.start({ lang: 'en-AU', interimResults: true, continuous: false });
  }

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      const result = await parseTransactionText(trimmed, data, mode, getToken);
      setDraft(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI parse failed');
    } finally {
      setLoading(false);
    }
  }

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 500, duration: 220, useNativeDriver: true }).start(onClose);
  }, [slideAnim, onClose]);

  function handleConfirm() {
    if (!draft) return;
    const { missingFields: _mf, clarification: _cl, ...tx } = draft;
    onParsed(tx as Partial<Transaction>);
  }

  function applySuggestion(fillText: string) {
    setText(fillText);
    setDraft(null);
    setError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const typeLabel = draft?.type === 'income' ? 'Income' : draft?.type === 'transfer' ? 'Transfer' : 'Expense';
  const typeColor = draft?.type === 'income' ? colors.green : draft?.type === 'transfer' ? colors.blue : colors.orange;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      {speechAvailable && (
        <SpeechListeners
          onResult={handleSpeechResult}
          onError={handleSpeechError}
          onEnd={handleSpeechEnd}
        />
      )}
      <Pressable style={styles.overlay} onPress={handleClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>✨  AI Entry</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={text}
            onChangeText={(t) => { setText(t); setDraft(null); }}
            placeholder={hint}
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            returnKeyType="done"
            editable={!loading && voiceState !== 'listening'}
          />
          {speechAvailable && (
            <Pressable
              style={[styles.micBtn, voiceState === 'listening' && styles.micBtnActive]}
              onPress={toggleVoice}
              disabled={loading}
            >
              <Text style={styles.micIcon}>{voiceState === 'listening' ? '⏹' : '🎙'}</Text>
            </Pressable>
          )}
        </View>

        {voiceState === 'listening' && (
          <View style={styles.listeningRow}>
            <ActivityIndicator size="small" color={colors.red} />
            <Text style={styles.listeningText}>Listening… tap ⏹ to stop</Text>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {suggestions.length > 0 && !draft && (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionLabel}>{text.trim() ? 'Matches' : 'Recent'}</Text>
            <View style={styles.suggestionList}>
              {suggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.key}
                  style={styles.suggestionChip}
                  onPress={() => applySuggestion(suggestion.fillText)}
                  disabled={loading || voiceState === 'listening'}
                >
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {suggestion.label}
                    {suggestion.count > 1 ? ` x${suggestion.count}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {draft && (
          <View style={styles.draftCard}>
            <View style={styles.draftHeader}>
              <View style={[styles.typePill, { backgroundColor: typeColor }]}>
                <Text style={styles.typePillText}>{typeLabel}</Text>
              </View>
              {draft.missingFields.length > 0 && (
                <Text style={styles.warningText}>⚠ Fill in: {draft.missingFields.join(', ')}</Text>
              )}
            </View>
            {draft.clarification ? <Text style={styles.clarificationText}>{draft.clarification}</Text> : null}
            <View style={styles.draftFields}>
              {draft.amount != null && <DraftRow label="Amount" value={`$${draft.amount.toFixed(2)}`} />}
              {draft.date ? <DraftRow label="Date" value={draft.date} /> : null}
              {draft.dueDate ? <DraftRow label="Due" value={draft.dueDate} /> : null}
              {draft.invoiceNo ? <DraftRow label="Invoice No." value={draft.invoiceNo} /> : null}
              {draft.creditNoteNo ? <DraftRow label="Credit No." value={draft.creditNoteNo} /> : null}
              {draft.accountId ? <DraftRow label={draft.type === 'transfer' ? 'From' : 'Account'} value={accountLabel(data, draft.accountId)} /> : null}
              {draft.accountToId ? <DraftRow label="To" value={accountLabel(data, draft.accountToId)} /> : null}
              {draft.categoryId ? <DraftRow label="Category" value={categoryLabel(data, draft.categoryId)} /> : null}
              {draft.chartAccountId ? <DraftRow label="Ledger" value={chartAccountLabel(data, draft.chartAccountId)} /> : null}
              {draft.contactId ? <DraftRow label="Contact" value={contactLabel(data, draft.contactId)} /> : null}
              {draft.party ? <DraftRow label="Party" value={draft.party} /> : null}
              {draft.note ? <DraftRow label="Note" value={draft.note} /> : null}
              {draft.entryMode ? <DraftRow label="Mode" value={draft.entryMode} /> : null}
              {draft.gstMode ? <DraftRow label="GST" value={String(draft.gstMode)} /> : null}
            </View>
            <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>Open in form →</Text>
            </Pressable>
          </View>
        )}

        <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
          <View style={styles.actions}>
            <Pressable
              style={[styles.parseBtn, (loading || !text.trim()) && styles.parseBtnDisabled]}
              onPress={handleParse}
              disabled={loading || !text.trim()}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.parseBtnText}>Parse  ⌘↵</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function accountLabel(data: LedgerData, id: string) {
  return data.accounts.find((account) => account.id === id)?.name || id;
}

function categoryLabel(data: LedgerData, id: string) {
  return [...data.categories.expense, ...data.categories.income].find((category) => category.id === id)?.name || id;
}

function chartAccountLabel(data: LedgerData, id: string) {
  const account = data.chartOfAccounts.find((item) => item.id === id);
  return account ? `${account.code} ${account.name}` : id;
}

function contactLabel(data: LedgerData, id: string) {
  return data.contacts.find((contact) => contact.id === id)?.name || id;
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.draftRow}>
      <Text style={styles.draftLabel}>{label}</Text>
      <Text style={styles.draftValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '85%', shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  closeBtn: { fontSize: 16, color: colors.muted, padding: 4 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 8 },
  textInput: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 12,
    fontSize: 15, color: colors.text, minHeight: 80, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.line,
  },
  micBtn: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  micBtnActive: { backgroundColor: '#FEE2E2', borderColor: colors.red },
  micIcon: { fontSize: 22 },
  listeningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  listeningText: { fontSize: 13, color: colors.red },
  errorText: { fontSize: 13, color: colors.red, marginBottom: 8 },
  suggestions: { marginBottom: 10, gap: 7 },
  suggestionLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  suggestionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    maxWidth: '100%', backgroundColor: colors.surface, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.line,
  },
  suggestionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  draftCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  draftHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  typePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  typePillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  warningText: { fontSize: 12, color: colors.orange, flex: 1 },
  clarificationText: { fontSize: 13, color: colors.muted, marginBottom: 8, fontStyle: 'italic' },
  draftFields: { gap: 6 },
  draftRow: { flexDirection: 'row', justifyContent: 'space-between' },
  draftLabel: { fontSize: 13, color: colors.muted },
  draftValue: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  confirmBtn: {
    marginTop: 12, backgroundColor: colors.text, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actions: { marginTop: 4 },
  parseBtn: {
    backgroundColor: colors.blue, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center',
  },
  parseBtnDisabled: { opacity: 0.45 },
  parseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
