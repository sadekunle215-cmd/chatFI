import React from "react";
import ReactDOM from "react-dom/client";
import AppProviders from "./providers/AppProviders";
import ChatFi from "./chatFi";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProviders>
      <ChatFi />
    </AppProviders>
  </React.StrictMode>
);
