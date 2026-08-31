import {
  authenticateWithPasskeyAndLiveness,
} from "expo-passkey-liveness/native";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  authClient,
  authenticateWithPasskey,
  emailOtp,
  signIn,
} from "@/lib/auth-client";
import { makeLivenessFetcher } from "@/lib/api";

type Mode = "passkey" | "otp";
type OtpStep = "email" | "code";

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>("passkey");

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <Text style={styles.heading}>EPK Example</Text>
        <Text style={styles.subheading}>
          Passwordless. Passkey first, email code as fallback.
        </Text>

        <View style={styles.tabs}>
          <Tab label="Passkey" active={mode === "passkey"} onPress={() => setMode("passkey")} />
          <Tab label="Email code" active={mode === "otp"} onPress={() => setMode("otp")} />
        </View>

        {mode === "passkey" ? <PasskeyTab /> : <OtpTab />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PasskeyTab() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetcher = makeLivenessFetcher(
    authClient as unknown as Parameters<typeof makeLivenessFetcher>[0]
  );

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      const r = await authenticateWithPasskeyAndLiveness(
        { challenge: "authentication" },
        { fetcher, authenticateWithPasskey }
      );
      if (r.error) {
        setError(r.error.message);
        return;
      }
      router.replace("/(tabs)/passkey");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text style={styles.bodyText}>
        Use Face ID or fingerprint to sign in. Liveness is verified as part of
        the ceremony.
      </Text>
      <Pressable
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={handleSignIn}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with passkey</Text>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        New here? Use the email-code tab first — you can register a passkey
        from the dashboard.
      </Text>
    </View>
  );
}

function OtpTab() {
  const [step, setStep] = useState<OtpStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      const r = await emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (r.error) {
        setError(r.error.message ?? r.error.code ?? "Couldn't send code");
        return;
      }
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    setError(null);
    try {
      const r = await signIn.emailOtp({ email, otp });
      if (r.error) {
        setError(r.error.message ?? r.error.code ?? "Invalid code");
        return;
      }
      router.replace("/(tabs)/passkey");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <View>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Pressable
          style={[styles.button, busy && styles.buttonBusy, !email && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={busy || !email}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={otp}
        onChangeText={(v) => setOtp(v.replace(/\D/g, ""))}
        autoFocus
      />
      <Text style={styles.hint}>
        Sent to <Text style={styles.hintStrong}>{email}</Text>. Check spam.
      </Text>
      <Pressable
        style={[styles.button, busy && styles.buttonBusy, otp.length !== 6 && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={busy || otp.length !== 6}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify and sign in</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.linkButton}
        onPress={() => {
          setStep("email");
          setOtp("");
          setError(null);
        }}
      >
        <Text style={styles.linkText}>Use a different email</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, padding: 24, justifyContent: "center" },
  heading: { fontSize: 28, fontWeight: "700", color: "#0f172a" },
  subheading: { marginTop: 4, marginBottom: 32, fontSize: 14, color: "#64748b" },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 20 },
  tab: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#e2e8f0", alignItems: "center" },
  tabActive: { backgroundColor: "#0f172a" },
  tabText: { color: "#475569", fontWeight: "600" },
  tabTextActive: { color: "#fff" },
  bodyText: { color: "#475569", fontSize: 14, lineHeight: 20, marginBottom: 20 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    marginTop: 4,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#0f172a",
    alignItems: "center",
  },
  buttonBusy: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkButton: { marginTop: 8, padding: 12, alignItems: "center" },
  linkText: { color: "#475569", fontSize: 13, fontWeight: "500" },
  error: { color: "#dc2626", marginTop: 10, fontSize: 14 },
  hint: { color: "#64748b", fontSize: 12, marginTop: 8, marginBottom: 8, lineHeight: 16 },
  hintStrong: { fontWeight: "600", color: "#0f172a" },
});
