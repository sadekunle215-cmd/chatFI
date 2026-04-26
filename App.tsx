import "react-native-gesture-handler";
import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, StatusBar, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";

import { WalletProvider } from "./src/context/WalletContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { Colors } from "./src/constants/theme";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          "SpaceMono":         require("./assets/fonts/SpaceMono-Regular.ttf"),
          "SpaceMono-Bold":    require("./assets/fonts/SpaceMono-Bold.ttf"),
          "SpaceMono-Italic":  require("./assets/fonts/SpaceMono-Italic.ttf"),
          "OpenSans-Regular":  require("./assets/fonts/OpenSans-Regular.ttf"),
          "OpenSans-Medium":   require("./assets/fonts/OpenSans-Medium.ttf"),
          "OpenSans-SemiBold": require("./assets/fonts/OpenSans-SemiBold.ttf"),
          "OpenSans-Bold":     require("./assets/fonts/OpenSans-Bold.ttf"),
        });
      } catch (e) {
        console.warn("Font load failed:", e);
      } finally {
        setReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor={Colors.bg}
          translucent={Platform.OS === "android"}
        />
        <WalletProvider>
          <View style={styles.root}>
            <AppNavigator />
          </View>
        </WalletProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
