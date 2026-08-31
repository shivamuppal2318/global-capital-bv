import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ChannelPartnerPortalApp } from "./components/channelPartnerPortal/ChannelPartnerPortalApp";
import "./styles.css";

// No router in this app — the Channel Partner Portal is a second, separate
// SPA shell reached at /partner (see the login link emitted after signing
// the agreement, routes/channelPartnerAgreement.js), so a plain path check
// here is enough rather than pulling in a routing library for one split.
const RootComponent = window.location.pathname.startsWith("/partner") ? ChannelPartnerPortalApp : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
