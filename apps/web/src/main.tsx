import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// NOTE: StrictMode intentionally disabled. Pixi's async Application.init()
// races with StrictMode's mount→cleanup→mount cycle and ends up running
// two WebGL contexts on the same canvas, which manifests as
// "uniformMatrix3fv: location is not from the associated program" + frozen
// rendering. App.tsx still has its own cancellation guard for safety.
createRoot(root).render(<App />);
