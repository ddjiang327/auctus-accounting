import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../components/ui';
import { devAutoSignIn, signIn, signUp } from '../api/cloudApi';
import { hasDevCredentials } from '../api/cloudConfig';

interface LoginScreenProps {
  onLoggedIn: () => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') await signIn(trimmedEmail, password);
      else await signUp(trimmedEmail, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin() {
    setLoading(true);
    setError('');
    try {
      const ok = await devAutoSignIn();
      if (!ok) {
        setError('Dev credentials are not configured.');
        return;
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.panel}>
        <Text style={styles.mark}>A</Text>
        <Text style={styles.title}>{mode === 'login' ? 'Sign in to Auctus' : 'Create Auctus account'}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />
        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>}
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={() => {
            setError('');
            setMode(mode === 'login' ? 'signup' : 'login');
          }}
          disabled={loading}
        >
          <Text style={styles.linkText}>{mode === 'login' ? 'No account? Sign up' : 'Already have an account? Sign in'}</Text>
        </Pressable>
        {hasDevCredentials() ? (
          <Pressable style={styles.devButton} onPress={handleDevLogin} disabled={loading}>
            <Text style={styles.devButtonText}>Dev Auto-Login</Text>
          </Pressable>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', gap: 12 },
  mark: { width: 58, height: 58, borderRadius: 16, backgroundColor: '#1A1916', color: '#F0EDE8', textAlign: 'center', lineHeight: 58, fontSize: 28, fontWeight: '900', overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 4 },
  error: { color: colors.red, fontSize: 13, textAlign: 'center', width: '100%' },
  input: { width: '100%', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 15, color: colors.text },
  button: { width: '100%', backgroundColor: '#1A1916', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  linkButton: { paddingVertical: 4 },
  linkText: { color: colors.blue, fontWeight: '800', fontSize: 13 },
  devButton: { width: '100%', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, alignItems: 'center' },
  devButtonText: { color: colors.text, fontWeight: '800', fontSize: 14 },
});
