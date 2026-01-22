import type { View } from "../components/types";

export function applyTabTitle(tabKey?: string) {
  const baseTitle = "G.R.E.T.E.L";
  document.title = tabKey ? `${baseTitle} • ${tabKey}` : baseTitle;
}

export function getTabKeyFromTopLevelView(view: View | "test") {
  switch (view) {
    case "login":
      return "login";
    case "createAccount":
      return "create account";
    case "forgotPassword":
      return "forgot password";
    case "setupWizard":
      return "setup";
    case "dashboard":
      return "dashboard";
    case "privacyPolicy":
      return "privacy policy";
    case "termsOfService":
      return "terms of service";
    case "resetPassword":
      return "reset password";
    case "twoFactor":
      return "two-factor";
    case "test":
      return "test";
    default:
      return "app";
  }
}

