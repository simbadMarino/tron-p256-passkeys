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

  const activePasskeys = passkeys.filter((p) => p.status !== "revoked");
  // Active first, newest first within each group, so a credential that can
  // still sign is never listed below dead ones. createdAt is an ISO-8601
  // string, so it sorts correctly lexicographically.
  const orderedPasskeys = [...passkeys].sort((a, b) => {
    const aActive = a.status !== "revoked";
    const bActive = b.status !== "revoked";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

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

        <Section title={`Passkeys (${activePasskeys.length} active of ${passkeys.length})`}>
          {passkeys.length === 0 ? (
            <Text style={styles.empty}>None — register one on the Passkey tab first.</Text>
          ) : (
            orderedPasskeys.map((p) => {
              const active = p.status !== "revoked";
              return (
                <View key={p.id} style={[styles.row, !active && styles.rowRevoked]}>
                  <View style={styles.sessionTop}>
                    <Text style={styles.rowTitle}>{p.platform}</Text>
                    <View
                      style={[
                        styles.badge,
                        active ? styles.badgeActive : styles.badgeRevoked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          active ? styles.badgeTextActive : styles.badgeTextRevoked,
                        ]}
                      >
                        {active ? "ACTIVE" : "REVOKED"}
                      </Text>
                    </View>
                  </View>
                  {/* The identifier every other surface speaks in: the
                      Wallet tab's assertion, the /api/p256/keys lookup, and
                      the server's revoke log all key off credentialId, so it
                      has to be here and in full to be matchable. The row id
                      below is database bookkeeping and is deliberately
                      labelled as such — calling it "id" made the two easy to
                      confuse. */}
                  <Text style={styles.rowMono} selectable>
                    credentialId: {p.credentialId}
                  </Text>
                  <Text style={styles.rowMono}>row id: {p.id.slice(0, 14)}…</Text>
                  <Text style={styles.rowMono}>user: {p.userId.slice(0, 12)}…</Text>
                  <Text style={styles.rowMono}>
                    aaguid: {p.aaguid ?? "—"} · counter: {p.counter}
                  </Text>
                  {!active ? (
                    <Text style={styles.revokedNote}>
                      Overwritten in the authenticator by a later registration
                      for the same account — it can no longer sign.
                    </Text>
                  ) : null}
                </View>
              );
            })
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
  // Amber, not red: a revoked credential is a dead end, not an error.
  badgeActive: { backgroundColor: "#dcfce7", borderColor: "#16a34a" },
  badgeRevoked: { backgroundColor: "#fef3c7", borderColor: "#d97706" },
  badgeTextActive: { color: "#15803d" },
  badgeTextRevoked: { color: "#b45309" },
  rowRevoked: { opacity: 0.6, backgroundColor: "#fafafa" },
  revokedNote: { marginTop: 8, fontSize: 11, lineHeight: 16, color: "#78716c" },
});
