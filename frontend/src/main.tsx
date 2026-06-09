import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";

import { App } from "./App";
import { isBareModeNow } from "./lib/bare-mode";
import "./styles/index.css";

/* Feature-local CSS.
 * Order preserves the original app.css feature-section sequence so in-layer
 * ties resolve identically to pre-split behavior. Each file wraps its
 * contents in @layer features { … }. */
import "./components/detail/index.css";
import "./features/overview/styles/overview.css";
import "./features/marketplace/styles/cards.css";
import "./features/settings/styles/settings.css";
import "./features/slash-commands/styles/slash-commands.css";
import "./features/skills/styles/detail.css";
import "./features/skills/styles/board.css";
import "./features/skills/styles/scan.css";
import "./components/matrix/matrix.css";
import "./features/marketplace/styles/panes.css";
import "./features/marketplace/styles/mcp-detail.css";
import "./features/mcp/styles/pages.css";
import "./features/mcp/styles/detail-sheet.css";
import "./features/mcp/styles/edit-dialogs.css";

/**
 * When the page is embedded as a module slot inside the host (1agents main
 * app), the host owns the URL and pushes NAVIGATE messages via
 * postMessage. We switch to HashRouter in bare mode so the iframe's
 * internal routes (e.g. /skills/review) live in the URL hash, not the
 * pathname — this avoids the basename mismatch that would otherwise break
 * route matching when 1skills is served at /1skills/ and the host sends a
 * bare path like /skills/review.
 */
const Router = isBareModeNow() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
