import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../lib/AuthContext';
import { ApiError } from '../lib/api';
import { colors } from '../lib/theme';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>L</Text>
          </View>
          <Text style={styles.title}>LumosX</Text>
          <Text style={styles.subtitle}>No risk & best for beginners</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <TouchableOpacity style={[styles.tab, mode === 'login' && styles.tabActive]} onPress={() => setMode('login')}>
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, mode === 'register' && styles.tabActive]} onPress={() => setMode('register')}>
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Sign up</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.submit, busy && styles.disabled]} onPress={onSubmit} disabled={busy}>
            <Text style={styles.submitText}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</Text>
          </TouchableOpacity>
        </View>

        {mode === 'register' && (
          <Text style={styles.note}>New accounts start with a simulated paper trading balance.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: { fontSize: 24, fontWeight: '900', color: '#000' },
  title: { fontSize: 28, fontWeight: '700', color: colors.white, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.muted },
  tabTextActive: { color: '#000' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.white,
    marginBottom: 12,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  submit: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  submitText: { color: '#000', fontSize: 15, fontWeight: '600' },
  note: { textAlign: 'center', fontSize: 12, color: colors.muted, marginTop: 16 },
});
