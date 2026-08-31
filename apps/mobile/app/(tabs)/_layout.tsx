import { Redirect, Tabs } from "expo-router";

import { useSession } from "@/lib/auth-client";

export default function TabsLayout() {
  const session = useSession();
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
