// ── Polyfills — must be first ─────────────────────────────────────────────────
import "react-native-get-random-values";
import { Buffer } from "buffer";
global.Buffer = Buffer;

import "text-encoding";

// ── App entry ─────────────────────────────────────────────────────────────────
import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
