import { useSyncExternalStore } from "react";
import { appStore, type ScreenId } from "@/lib/app-state";

export function useAppState() {
  const s = useSyncExternalStore(appStore.subscribe, appStore.get, appStore.get);
  return {
    ...s,
    setScreen: (screen: ScreenId) => appStore.set({ screen }),
    toggleDrawer: (v?: boolean) => appStore.set({ drawerOpen: v ?? !appStore.get().drawerOpen }),
    toggleSettings: (v?: boolean) => appStore.set({ settingsOpen: v ?? !appStore.get().settingsOpen }),
    setConversationId: (conversationId: string | null) => appStore.set({ conversationId }),
  };
}
