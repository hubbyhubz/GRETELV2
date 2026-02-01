import type { View, DashboardView } from "../components/types";

export function applyTabTitle(tabKey?: string) {
  const baseTitle = "G.R.E.T.E.L";
  document.title = tabKey ? `${baseTitle} • ${tabKey}` : baseTitle;
}

export function getTabKeyFromTopLevelView(view: View | "test", dashboardView?: DashboardView) {
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
      if (dashboardView === 'events') return "calendar";
      if (dashboardView === 'analytics') return "analytics";
      if (dashboardView === 'okr') return "okrs";
      return "dashboard";
    case "privacyPolicy":
      return "privacy policy";
    case "termsOfService":
      return "terms of service";
    case "resetPassword":
      return "reset password";
    case "twoFactor":
      return "two-factor";
    case "superLogin":
      return "super user login";
    case "superConsole":
      return "super user";
    case "test":
      return "test";
    default:
      return "app";
  }
}
