import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  authClient,
  authenticateWithPasskey,
  refreshSession,
  registerPasskey,
  signOut,
  useSession,
} from "@/lib/auth-client";
import { env } from "@/lib/env";

type LogLevel = "info" | "ok" | "err";
type Log = { ts: string; text: string; level: LogLevel };

export default function PasskeyScreen() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const [logs, setLogs] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);

  function log(text: string, level: LogLevel = "info") {
    setLogs((prev) =>
      [{ ts: new Date().toLocaleTimeString(), text, level }, ...prev].slice(0, 50)
    );
  }

  async function handleRegister() {
    if (!user) return;
    setBusy(true);
    try {
      log("starting registerPasskey…");
      const r = await registerPasskey({
        userId: user.id,
        userName: user.email,
        displayName: user.name ?? user.email,
        rpId: env.rpId,
        rpName: env.rpName,
      });
      if (r.error) {
        log(`register failed: ${r.error.message}`, "err");
      } else {
        log("passkey registered ✓", "ok");
      }
    } catch (e) {
      log(`thrown: ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthenticate() {
    setBusy(true);
    try {
      log("starting authenticateWithPasskey…");
      const r = await authenticateWithPasskey({ rpId: env.rpId });
      if (r.error) {
        log(`authenticate failed: ${r.error.message}`, "err");
      } else {
        // Better Auth does not revalidate the session store for
        // /expo-passkey/authenticate, so without this the screen reports
        // success while useSession() still holds the previous session.
        log(
          (await refreshSession())
            ? "authenticated with passkey ✓"
            : "authenticated, but no session was stored",
          "ok",
        );
      }
    } catch (e) {
      log(`thrown: ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      setBusy(false);
    }
  }


  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.heading}>Passkey</Text>
        <Text style={styles.subheading}>Signed in as {user?.email}</Text>
      </View>

      <View style={styles.actions}>
        <Action label="Register passkey" onPress={handleRegister} busy={busy} primary />
        <Action label="Sign in with passkey" onPress={handleAuthenticate} busy={busy} />
        <Action label="Sign out" onPress={handleSignOut} busy={busy} subtle />
      </View>

      <ScrollView style={styles.logs} contentContainerStyle={styles.logsContent}>
        {logs.length === 0 ? (
          <Text style={styles.logEmpty}>No activity yet. Tap a button above.</Text>
        ) : (
          logs.map((l, i) => (
            <View key={i} style={styles.logRow}>
              <Text style={styles.logTs}>{l.ts}</Text>
              <Text style={[styles.logText, l.level === "ok" && styles.logOk, l.level === "err" && styles.logErr]}>
                {l.text}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Action({
  label,
  onPress,
  busy,
  primary,
  subtle,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  primary?: boolean;
  subtle?: boolean;
}) {
  return (
    <Pressable
      style={[styles.btn, primary && styles.btnPrimary, subtle && styles.btnSubtle, busy && styles.btnBusy]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator color={primary ? "#fff" : "#0f172a"} />
      ) : (
        <Text style={[styles.btnText, primary && styles.btnTextPrimary, subtle && styles.btnTextSubtle]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  header: { padding: 20, paddingBottom: 12 },
  heading: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  subheading: { marginTop: 4, fontSize: 13, color: "#64748b" },
  actions: { paddingHorizontal: 20, gap: 10 },
  btn: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderColor: "#cbd5e1",
    borderWidth: 1,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  btnSubtle: { backgroundColor: "transparent", borderColor: "transparent" },
  btnBusy: { opacity: 0.6 },
  btnText: { color: "#0f172a", fontWeight: "600", fontSize: 15 },
  btnTextPrimary: { color: "#fff" },
  btnTextSubtle: { color: "#64748b", fontWeight: "500" },
  logs: { flex: 1, marginTop: 16 },
  logsContent: { padding: 20 },
  logEmpty: { color: "#94a3b8", fontStyle: "italic", textAlign: "center", marginTop: 24 },
  logRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  logTs: { color: "#94a3b8", fontSize: 12, fontFamily: "Menlo", width: 72 },
  logText: { color: "#0f172a", fontSize: 13, flex: 1, fontFamily: "Menlo" },
  logOk: { color: "#16a34a" },
  logErr: { color: "#dc2626" },
});
