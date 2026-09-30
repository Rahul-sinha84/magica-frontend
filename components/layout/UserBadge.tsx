"use client";

import { UserButton } from "@clerk/nextjs";

// Clerk's own account menu (Manage account, Sign out). Its styles are restyled in globals.css
// (.account-button) to match magica: full width, avatar on the left and the name on the right.
export function UserBadge() {
  return (
    <div className="account-button flex">
      <UserButton showName />
    </div>
  );
}
