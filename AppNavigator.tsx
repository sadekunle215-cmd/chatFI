import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatScreen     from "../screens/ChatScreen";
import SwapScreen     from "../screens/SwapScreen";
import MarketsScreen  from "../screens/MarketsScreen";
import PortfolioScreen from "../screens/PortfolioScreen";
import EarnScreen     from "../screens/EarnScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { Colors, Radius } from "../constants/theme";

const Tab = createBottomTabNavigator();

const TABS = [
  { name: "Chat",      label: "Chat",      icon: "💬", activeIcon: "💬" },
  { name: "Swap",      label: "Swap",      icon: "⇄",  activeIcon: "⇄"  },
  { name: "Markets",   label: "Markets",   icon: "📊", activeIcon: "📊" },
  { name: "Portfolio", label: "Wallet",    icon: "👛", activeIcon: "👛" },
  { name: "Earn",      label: "Earn",      icon: "💰", activeIcon: "💰" },
  { name: "Settings",  label: "More",      icon: "☰",  activeIcon: "☰"  },
];

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom || 8 }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const tab = TABS.find(t => t.name === route.name) || TABS[0];
        const isFocused = state.index === index;
        const isSwap = route.name === "Swap";

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (isSwap) {
          // Centre swap pill button
          return (
            <TouchableOpacity key={route.key} style={styles.swapTabWrap} onPress={onPress} activeOpacity={0.85}>
              <View style={styles.swapTabBtn}>
                <Text style={styles.swapTabIcon}>{tab.icon}</Text>
              </View>
              <Text style={styles.swapTabLabel}>Swap</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tabItem}
            onPress={onPress}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabIcon, isFocused && styles.tabIconActive]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{tab.label}</Text>
            {isFocused && <View style={styles.tabDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        tabBar={props => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Chat"      component={ChatScreen} />
        <Tab.Screen name="Swap"      component={SwapScreen} />
        <Tab.Screen name="Markets"   component={MarketsScreen} />
        <Tab.Screen name="Portfolio" component={PortfolioScreen} />
        <Tab.Screen name="Earn"      component={EarnScreen} />
        <Tab.Screen name="Settings"  component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    alignItems: "flex-start",
  },
  tabItem: {
    flex: 1, alignItems: "center",
    paddingVertical: 4,
    position: "relative",
  },
  tabIcon: { fontSize: 20, color: Colors.text3 },
  tabIconActive: { },
  tabLabel: { fontSize: 10, color: Colors.text3, marginTop: 2, fontWeight: "500" },
  tabLabelActive: { color: Colors.accent },
  tabDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.accent,
    marginTop: 2,
  },

  // Swap pill — raised centre button
  swapTabWrap: { flex: 1, alignItems: "center", paddingBottom: 4 },
  swapTabBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accent,
    justifyContent: "center", alignItems: "center",
    marginTop: -16,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  swapTabIcon:  { fontSize: 22, color: Colors.bg, fontWeight: "700" },
  swapTabLabel: { fontSize: 10, color: Colors.text3, marginTop: 2, fontWeight: "500" },
});
