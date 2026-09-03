import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fetchPasskeys, type PasskeyDebugRow } from "@/lib/api";
import { collectPasskeyGates, type Gate } from "@/lib/passkey-diagnostics";

export default function DebugScreen() {
  const [passkeys, setPasskeys] = useState<PasskeyDebugRow[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(null);
    setRefreshing(true);
    try {
      setGates(await collectPasskeyGates());
      setPasskeys(await fetchPasskeys());
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

        <Section title={`Passkey preconditions (${gates.filter((g) => g.ok).length}/${gates.length})`}>
          {gates.length === 0 ? (
            <Text style={styles.empty}>Pull to refresh.</Text>
          ) : (
            gates.map((g) => (
              <View key={g.label} style={styles.row}>
                <View style={styles.sessionTop}>
                  <Text style={styles.rowTitle}>{g.label}</Text>
                  <Text style={[styles.badgeText, { color: g.ok ? "#16a34a" : "#dc2626" }]}>
                    {g.ok ? "ok" : "blocked"}
                  </Text>
                </View>
                <Text style={styles.rowMono}>{g.value}</Text>
                {g.hint ? <Text style={styles.empty}>{g.hint}</Text> : null}
              </View>
            ))
          )}
        </Section>

        <Section title={`Passkeys (${passkeys.length})`}>
          {passkeys.length === 0 ? (
            <Text style={styles.empty}>None — register one on the Passkey tab first.</Text>
          ) : (
            passkeys.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={styles.rowTitle}>{p.platform}</Text>
                <Text style={styles.rowMono}>id: {p.id.slice(0, 14)}…</Text>
                <Text style={styles.rowMono}>user: {p.userId.slice(0, 12)}…</Text>
                <Text style={styles.rowMono}>
                  aaguid: {p.aaguid ?? "—"} · counter: {p.counter}
                </Text>
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
