import "@fontsource-variable/inter-tight";
import "@fontsource/jetbrains-mono";
import "./styles/index.css";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element was not found.");
}
ReactDOM.createRoot(rootElement).render(
  <HashRouter>
    {" "}
    <App />{" "}
  </HashRouter>,
);
