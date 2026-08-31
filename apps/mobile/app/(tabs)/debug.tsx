import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  fetchLivenessSessions,
  fetchPasskeys,
  type LivenessSessionDebugRow,
  type PasskeyDebugRow,
} from "@/lib/api";

export default function DebugScreen() {
  const [passkeys, setPasskeys] = useState<PasskeyDebugRow[]>([]);
  const [sessions, setSessions] = useState<LivenessSessionDebugRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(null);
    setRefreshing(true);
    try {
      const [p, s] = await Promise.all([fetchPasskeys(), fetchLivenessSessions()]);
      setPasskeys(p);
      setSessions(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>Server-side rows</Text>
          <Pressable onPress={load} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Section title={`Passkeys (${passkeys.length})`}>
          {passkeys.length === 0 ? (
            <Text style={styles.empty}>None — register one on the Passkey tab first.</Text>
          ) : (
            passkeys.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={styles.rowTitle}>{p.platform}</Text>
                <Text style={styles.rowMono}>id: {p.id.slice(0, 14)}…</Text>
                <Text style={styles.rowMono}>user: {p.userId.slice(0, 12)}…</Text>
                {p.metadata?.liveness ? (
                  <View style={styles.metaBlock}>
                    <Text style={styles.metaLabel}>liveness audit slice</Text>
                    <Text style={styles.rowMono}>
                      {p.metadata.liveness.provider} · score {p.metadata.liveness.score} ·{" "}
                      {p.metadata.liveness.padLevel} · modality{" "}
                      {p.metadata.liveness.registeredModality ?? "—"}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.empty}>no liveness slice yet</Text>
                )}
              </View>
            ))
          )}
        </Section>

        <Section title={`Liveness sessions (${sessions.length})`}>
          {sessions.length === 0 ? (
            <Text style={styles.empty}>No sessions yet.</Text>
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={styles.row}>
                <View style={styles.sessionTop}>
                  <Text style={styles.rowTitle}>{s.provider}</Text>
                  <StateBadge state={s.state} />
                </View>
                <Text style={styles.rowMono}>chl: {s.challenge}</Text>
                <Text style={styles.rowMono}>score: {s.score ?? "—"}</Text>
                <Text style={styles.rowMono}>created: {new Date(s.createdAt).toLocaleTimeString()}</Text>
              </View>
            ))
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StateBadge({ state }: { state: LivenessSessionDebugRow["state"] }) {
  const color =
    state === "verified" ? "#16a34a" : state === "failed" ? "#dc2626" : state === "expired" ? "#a16207" : "#475569";
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a`, borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  refreshBtn: { padding: 8, paddingHorizontal: 12, backgroundColor: "#e2e8f0", borderRadius: 6 },
  refreshText: { color: "#0f172a", fontWeight: "600", fontSize: 13 },
  error: { color: "#dc2626", marginBottom: 12, fontSize: 14 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#475569", textTransform: "uppercase", marginBottom: 10, letterSpacing: 0.5 },
  row: { backgroundColor: "#fff", padding: 14, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#0f172a", marginBottom: 4 },
  rowMono: { fontSize: 12, color: "#475569", fontFamily: "Menlo" },
  metaBlock: { marginTop: 8, padding: 8, backgroundColor: "#f1f5f9", borderRadius: 6 },
  metaLabel: { fontSize: 11, color: "#64748b", textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  empty: { color: "#94a3b8", fontSize: 13, fontStyle: "italic" },
  sessionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: "600" },
});
