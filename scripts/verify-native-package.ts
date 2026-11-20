import { platform } from "node:process";

if (platform === "darwin") {
  await import("./package-native-desktop");
} else {
  await import("./package-native-portable");
}
