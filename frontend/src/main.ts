import { startApp } from "./app";
import { routeStudy } from "./studyRouting";

const route = routeStudy(new URL(window.location.href));
if (route.kind === "audio") {
  const target = new URL(route.path, window.location.href);
  const query = new URL(window.location.href).searchParams;
  const language = query.get("lang") ?? query.get("language");
  if (language) target.searchParams.set("lang", language);
  // Route to the frozen static page; the package does not need old identity
  // parameters, and the legacy branch above remains untouched.
  window.location.replace(target.href);
} else {
  void startApp();
}
