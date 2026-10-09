const RESERVED_RE = /^((get|join|the|team|official)?reax(app|hq|team|official|support|admin|staff|mod|com)?|admin|administrator|support|official|moderator|mod|staff|system|root|security|help|helpdesk|watch1do1)$/;

export function isReservedUsername(name: string): boolean {
  const n = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return RESERVED_RE.test(n);
}

export const RESERVED_USERNAME_MESSAGE = "This username is reserved.";
export const OFFICIAL_RENAME_MESSAGE = "Official account usernames can only be changed by the Reax team.";
