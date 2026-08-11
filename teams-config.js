// ──────────────────────────────────────────────────────────────
// Microsoft Teams (Microsoft Graph) configuration
// ──────────────────────────────────────────────────────────────
// Lets the planner pull your Teams for Education class assignments
// into the backlog. To enable:
//   1. Azure Portal → Microsoft Entra ID → App registrations → New.
//      Register a *Single-page application (SPA)*.
//   2. Add a SPA redirect URI matching where you serve the app,
//      e.g. http://localhost:8080/  (must match origin + path exactly).
//   3. API permissions → Microsoft Graph → Delegated → add:
//        EduAssignments.ReadBasic, EduRoster.ReadBasic, User.Read
//      then "Grant admin consent" (school tenants usually require it).
//   4. Copy the Application (client) ID below. Set tenantId to your
//      tenant GUID, or leave "organizations" for any work/school account.
//
// Until clientId is filled in, Teams import shows setup instructions
// instead of connecting — the rest of the app is unaffected.
// ──────────────────────────────────────────────────────────────

window.STUDY_TEAMS_CONFIG = {
  clientId: "REPLACE_ME",
  tenantId: "organizations",
  scopes: ["EduAssignments.ReadBasic", "EduRoster.ReadBasic", "User.Read"],
};

// True only when the client ID has been filled in AND the MSAL SDK loaded.
window.STUDY_TEAMS_ENABLED =
  !!(window.STUDY_TEAMS_CONFIG &&
     window.STUDY_TEAMS_CONFIG.clientId &&
     window.STUDY_TEAMS_CONFIG.clientId !== "REPLACE_ME");
