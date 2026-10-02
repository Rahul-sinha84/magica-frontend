"use client";

import { UserButton } from "@clerk/nextjs";

// Clerk's own account menu (Manage account, Sign out), laid out like magica's: full width, avatar
// on the left and the name on the right on one line. Uses Clerk's supported `elements` option;
// the trailing ! makes Tailwind's classes win over Clerk's own styles.
export function UserBadge() {
  return (
    <UserButton
      showName
      appearance={{
        elements: {
          rootBox: "w-full!",
          userButtonTrigger: "w-full! rounded-[10px]! focus-visible:ring-2! focus-visible:ring-ring!",
          // a white card with a hairline border and a 28px avatar, as on magica
          userButtonBox:
            "h-[34px]! w-full! flex-row-reverse! justify-between! rounded-[10px]! border! border-line-tertiary! bg-surface-main! px-2! text-text-primary!",
          avatarBox: "size-7!",
          userButtonOuterIdentifier:
            "min-w-0! flex-1! truncate! pl-2! pr-0! text-right! text-[13px]! font-medium! text-text-primary!",
        },
      }}
    />
  );
}
