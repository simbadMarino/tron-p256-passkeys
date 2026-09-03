import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/lib/auth-client";

export default function TabsLayout() {
  const session = useSession();

  // `data` is null while the store is refetching, not only when signed out.
  // @better-auth/expo notifies `$sessionSignal` on any response carrying a
  // session cookie — the passkey register response does — so redirecting on
  // a bare null unmounts whichever screen triggered it, mid-await. That
  // stranded the register handler: the ceremony and the server call both
  // succeeded, but the success log and setBusy(false) wrote into a dead
  // tree, leaving the UI stuck on "starting registerPasskey…".
  //
  // Wait for the fetch to settle before treating null as signed out.
  if (session.isPending) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session.data?.user) {
    return <Redirect href="/(auth)/sign-in" />;
  }
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="passkey" options={{ title: "Passkey" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
      <Tabs.Screen name="debug" options={{ title: "Debug" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0c" },
});
