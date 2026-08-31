import { Redirect } from "expo-router";

import { useSession } from "@/lib/auth-client";

export default function Index() {
  const session = useSession();
  if (session.data?.user) {
    return <Redirect href="/(tabs)/passkey" />;
  }
  return <Redirect href="/(auth)/sign-in" />;
}
