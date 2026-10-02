import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ApiKeysDialog } from "@/components/apikeys/ApiKeysDialog";
import { Sidebar } from "@/components/layout/Sidebar";
import { BACKEND_URL } from "@/lib/config";
import { useApiKeysDialog } from "@/stores/uiStore";
import { getMockDb, mockApiKey } from "../mocks/fixtures";
import { server } from "../mocks/server";
import { renderApp } from "../utils/render";

const at = (path: string) => `${BACKEND_URL}${path}`;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

// the dialog, open
async function openDialog() {
  useApiKeysDialog.setState({ open: true });
  const view = renderApp(<ApiKeysDialog />);
  const dialog = await screen.findByRole("dialog", { name: /API Keys/ });
  await waitFor(() => expect(within(dialog).queryByLabelText("Loading your API keys")).not.toBeInTheDocument());
  return { ...view, dialog };
}

const counter = (dialog: HTMLElement) => within(dialog).getByLabelText(/active keys$/);
const row = (dialog: HTMLElement, label: string) => within(dialog).getByText(label, { selector: "span" }).closest("li")!;
const createButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: /Create key|Creating…/ });

// what each request carried
function bodies(method: "post" | "patch" | "delete", path: string) {
  const seen: unknown[] = [];
  server.use(
    http[method](at(path), async ({ request }) => {
      seen.push(method === "delete" ? null : await request.clone().json());
      return undefined;
    }),
  );
  return seen;
}

describe("opening", () => {
  it("'API / MCP' in the sidebar opens the dialog; Escape closes it and gives focus back", async () => {
    const { user } = renderApp(
      <>
        <Sidebar />
        <ApiKeysDialog />
      </>,
    );
    const item = screen.getByRole("button", { name: "API / MCP" });
    expect(item).not.toHaveAttribute("aria-disabled");
    await user.click(item);
    const dialog = await screen.findByRole("dialog", { name: /API Keys/ });
    expect(within(dialog).getByText(/Create scoped credentials for the REST API and MCP server/)).toBeInTheDocument();
    // the label field takes focus, as the other dialogs' fields do
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Key label" })).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(item).toHaveFocus();
  });

  it("shows magica's documentation links, which do nothing in this build", async () => {
    const { dialog } = await openDialog();
    for (const name of ["API Reference", "MCP Server"]) {
      const link = within(dialog).getByRole("button", { name });
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).toHaveAttribute("title", "Not available in this build");
    }
  });
});

describe("the list", () => {
  it("shows the counter, each key's masked start, when it was made, and its limits", async () => {
    const { dialog } = await openDialog();
    expect(counter(dialog)).toHaveTextContent("1 / 10");
    const key = row(dialog, "Default");
    expect(within(key).getByText("mgc_Hnz3gjhh••••••••")).toBeInTheDocument();
    expect(within(key).getByTitle("Created")).toHaveTextContent(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    expect(within(key).getByText("60/min")).toBeInTheDocument();
    expect(within(key).getByText("1000/day")).toBeInTheDocument();
    expect(within(key).getByText(/^Last used/)).toBeInTheDocument();
  });

  it("says when a key has expired, and doesn't count it", async () => {
    getMockDb().apiKeys = [
      mockApiKey({ id: "k-new", label: "Staging", prefix: "mgc_Stag1234", expiresAt: hoursFromNow(48), createdAt: hoursFromNow(-1) }),
      mockApiKey({ id: "k-old", label: "Old app", prefix: "mgc_Old12345", expiresAt: hoursFromNow(-2), createdAt: hoursFromNow(-100) }),
    ];
    const { dialog } = await openDialog();
    expect(counter(dialog)).toHaveTextContent("1 / 10");
    // newest first
    expect(within(dialog).getAllByRole("listitem").map((item) => item.querySelector("span")?.textContent)).toEqual(["Staging", "Old app"]);
    expect(within(row(dialog, "Old app")).getByText("Expired")).toBeInTheDocument();
    expect(within(row(dialog, "Staging")).queryByText("Expired")).not.toBeInTheDocument();
    expect(within(row(dialog, "Staging")).getByText(/^Expires /)).toBeInTheDocument();
  });

  it("has an empty state", async () => {
    getMockDb().apiKeys = [];
    const { dialog } = await openDialog();
    expect(counter(dialog)).toHaveTextContent("0 / 10");
    expect(within(dialog).getByText("No API keys yet")).toBeInTheDocument();
  });

  it("says when the keys can't be loaded, and tries again", async () => {
    let down = true;
    server.use(http.get(at("/api/api-keys"), () => (down ? HttpResponse.json({ error: "down", code: "INTERNAL_ERROR" }, { status: 500 }) : undefined)));
    const { user, dialog } = await openDialog();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't load your API keys.");
    expect(createButton(dialog)).toBeDisabled();
    down = false;
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await within(dialog).findByText("mgc_Hnz3gjhh••••••••")).toBeInTheDocument();
  });
});

describe("creating a key", () => {
  it("sends magica's default label and the contract's default limits", async () => {
    const sent = bodies("post", "/api/api-keys");
    const { user, dialog } = await openDialog();
    expect(within(dialog).getByRole("textbox", { name: "Key label" })).toHaveValue("Default");
    await user.click(createButton(dialog));
    await waitFor(() => expect(sent).toEqual([{ label: "Default", perMinute: 60, perDay: 1000 }]));
    await waitFor(() => expect(counter(dialog)).toHaveTextContent("2 / 10"));
  });

  it("sends the advanced options: limits within range and an expiry at the end of the chosen day", async () => {
    const sent = bodies("post", "/api/api-keys");
    const { user, dialog } = await openDialog();
    const label = within(dialog).getByRole("textbox", { name: "Key label" });
    await user.clear(label);
    await user.type(label, "  Production app  ");
    await user.click(within(dialog).getByRole("button", { name: "Advanced options" }));
    expect(within(dialog).getByText("Set request limits and an optional expiration date.")).toBeInTheDocument();
    const perMinute = within(dialog).getByRole("spinbutton", { name: "Per min" });
    const perDay = within(dialog).getByRole("spinbutton", { name: "Per day" });
    expect(perMinute).toHaveValue(60);
    expect(perDay).toHaveValue(1000);
    expect(perMinute).toHaveAttribute("max", "10000");
    expect(perDay).toHaveAttribute("max", "100000");
    await user.clear(perMinute);
    await user.type(perMinute, "120");
    await user.clear(perDay);
    await user.type(perDay, "5000");
    fireEvent.change(within(dialog).getByLabelText("Expires"), { target: { value: "2099-01-31" } });
    await user.click(createButton(dialog));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ label: "Production app", perMinute: 120, perDay: 5000, expiresAt: new Date(2099, 0, 31, 23, 59, 59, 999).toISOString() });
    expect(await within(dialog).findByText("Production app", { selector: "span" })).toBeInTheDocument();
  });

  it.each([
    ["Per min", "0", "Requests per minute must be a whole number from 1 to 10,000."],
    ["Per min", "10001", "Requests per minute must be a whole number from 1 to 10,000."],
    ["Per min", "1.5", "Requests per minute must be a whole number from 1 to 10,000."],
    ["Per day", "100001", "Requests per day must be a whole number from 1 to 100,000."],
  ])("checks %s = %s the way the contract does, and sends nothing", async (name, value, message) => {
    const sent = bodies("post", "/api/api-keys");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Advanced options" }));
    const input = within(dialog).getByRole("spinbutton", { name });
    await user.clear(input);
    await user.type(input, value);
    await user.click(createButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(sent).toEqual([]);
  });

  it("needs a name", async () => {
    const sent = bodies("post", "/api/api-keys");
    const { user, dialog } = await openDialog();
    await user.clear(within(dialog).getByRole("textbox", { name: "Key label" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Key label" }), "   {Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Give the key a name.");
    expect(sent).toEqual([]);
  });

  it("shows the new key once, with copy, and never again once the dialog closes", async () => {
    const { user, dialog, client } = await openDialog();
    await user.click(createButton(dialog));
    const shown = await within(dialog).findByRole("region", { name: "New API key" });
    const secret = within(shown).getByText(/^mgc_[A-Za-z0-9_-]{43}$/).textContent!;
    expect(within(shown).getByText(/You won't be able to see this key again/)).toBeInTheDocument();
    // the list shows only its start
    expect(within(dialog).getByText(`${secret.slice(0, 12)}••••••••`)).toBeInTheDocument();

    await user.click(within(shown).getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe(secret);
    expect(within(shown).getByRole("button", { name: "Copied" })).toBeInTheDocument();
    // kept nowhere but on screen
    expect(JSON.stringify(client.getQueryData(["api-keys"]))).not.toContain(secret);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    useApiKeysDialog.setState({ open: true });
    const again = await screen.findByRole("dialog", { name: /API Keys/ });
    await within(again).findByText(`${secret.slice(0, 12)}••••••••`);
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(within(again).queryByRole("region", { name: "New API key" })).not.toBeInTheDocument();
  });

  it("Done puts the new key away", async () => {
    const { user, dialog } = await openDialog();
    await user.click(createButton(dialog));
    const shown = await within(dialog).findByRole("region", { name: "New API key" });
    await user.click(within(shown).getByRole("button", { name: "Done" }));
    expect(within(dialog).queryByRole("region", { name: "New API key" })).not.toBeInTheDocument();
  });

  it("shows the server's 400 message", async () => {
    server.use(http.post(at("/api/api-keys"), () => HttpResponse.json({ error: "expiresAt: Choose a time in the future.", code: "VALIDATION_FAILED" }, { status: 400 })));
    const { user, dialog } = await openDialog();
    await user.click(createButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/^Choose a time in the future\.$/);
  });

  it("shows the 409 message when the limit was reached elsewhere, and catches up with the list", async () => {
    const { user, dialog } = await openDialog();
    // meanwhile, nine more were made in another tab
    for (let i = 0; i < 9; i++) getMockDb().apiKeys.push(mockApiKey({ id: `k-${i}`, label: `App ${i}`, prefix: `mgc_App${i}xxxx`, createdAt: hoursFromNow(-2) }));
    await user.click(createButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You can have at most 10 active API keys. Revoke one to create another.");
    await waitFor(() => expect(counter(dialog)).toHaveTextContent("10 / 10"));
    expect(createButton(dialog)).toBeDisabled();
  });

  it("is disabled at 10 active keys, and says why", async () => {
    getMockDb().apiKeys = Array.from({ length: 10 }, (_, i) => mockApiKey({ id: `k-${i}`, label: `App ${i}`, prefix: `mgc_App${i}xxxx` }));
    const sent = bodies("post", "/api/api-keys");
    const { user, dialog } = await openDialog();
    expect(counter(dialog)).toHaveTextContent("10 / 10");
    expect(createButton(dialog)).toBeDisabled();
    expect(within(dialog).getByText("You can have at most 10 active API keys. Revoke one to create another.")).toBeInTheDocument();
    await user.type(within(dialog).getByRole("textbox", { name: "Key label" }), "{Enter}");
    expect(sent).toEqual([]);
  });
});

describe("renaming", () => {
  it("is inline, as on magica: Enter saves the new name", async () => {
    const sent = bodies("patch", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    const input = within(dialog).getByRole("textbox", { name: "Rename key" });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Default");
    await user.clear(input);
    await user.type(input, "Production{Enter}");
    await waitFor(() => expect(sent).toEqual([{ label: "Production" }]));
    expect(await within(dialog).findByText("Production", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox", { name: "Rename key" })).not.toBeInTheDocument();
  });

  it("Escape and Cancel put the name back without sending anything, and the dialog stays open", async () => {
    const sent = bodies("patch", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Rename key" }), " two");
    await user.keyboard("{Escape}");
    expect(within(dialog).queryByRole("textbox", { name: "Rename key" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    // the same name saved is no change at all
    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(sent).toEqual([]);
  });

  it("needs a name", async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    await user.clear(within(dialog).getByRole("textbox", { name: "Rename key" }));
    await user.keyboard("{Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Give the key a name.");
  });
});

describe("editing limits", () => {
  it("sends what changed and shows the row as the server returns it", async () => {
    const sent = bodies("patch", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Edit request limits for Default" }));
    const key = row(dialog, "Default");
    expect(within(key).getByText("Changes apply to this key only.")).toBeInTheDocument();
    const perMinute = within(key).getByRole("spinbutton", { name: "Per min" });
    const perDay = within(key).getByRole("spinbutton", { name: "Per day" });
    await user.clear(perMinute);
    await user.type(perMinute, "120");
    await user.clear(perDay);
    await user.type(perDay, "5000");
    await user.click(within(key).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual([{ perMinute: 120, perDay: 5000 }]));
    expect(await within(key).findByText("120/min")).toBeInTheDocument();
    expect(within(key).getByText("5000/day")).toBeInTheDocument();
  });

  it("sends only the limit that changed", async () => {
    const sent = bodies("patch", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Edit request limits for Default" }));
    const perDay = within(dialog).getByRole("spinbutton", { name: "Per day" });
    await user.clear(perDay);
    await user.type(perDay, "2000{Enter}");
    await waitFor(() => expect(sent).toEqual([{ perDay: 2000 }]));
  });

  it("refuses limits out of range", async () => {
    const sent = bodies("patch", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Edit request limits for Default" }));
    const perMinute = within(dialog).getByRole("spinbutton", { name: "Per min" });
    await user.clear(perMinute);
    await user.type(perMinute, "20000{Enter}");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Requests per minute must be a whole number from 1 to 10,000.");
    expect(sent).toEqual([]);
  });
});

describe("revoking", () => {
  it("asks first; then the row goes and the counter drops", async () => {
    const sent = bodies("delete", "/api/api-keys/:apiKeyId");
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Revoke Default" }));
    const confirm = within(dialog).getByRole("group", { name: "Revoke Default?" });
    expect(within(confirm).getByText(/This can't be undone/)).toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(within(dialog).queryByRole("group", { name: "Revoke Default?" })).not.toBeInTheDocument();
    expect(sent).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Revoke Default" }));
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));
    await waitFor(() => expect(within(dialog).queryByText("Default", { selector: "span" })).not.toBeInTheDocument());
    expect(sent).toHaveLength(1);
    expect(counter(dialog)).toHaveTextContent("0 / 10");
    expect(within(dialog).getByText("No API keys yet")).toBeInTheDocument();
    expect(getMockDb().apiKeys[0].revokedAt).not.toBeNull();
  });
});

describe("a key that is gone", () => {
  it("a 404 on rename takes the row away and says so", async () => {
    const { user, dialog } = await openDialog();
    getMockDb().apiKeys[0].revokedAt = new Date().toISOString(); // revoked in another tab
    await user.click(within(dialog).getByRole("button", { name: "Rename Default" }));
    await user.type(within(dialog).getByRole("textbox", { name: "Rename key" }), " 2{Enter}");
    await waitFor(() => expect(within(dialog).queryByText("mgc_Hnz3gjhh••••••••")).not.toBeInTheDocument());
    expect(await screen.findByText("That key isn't there any more")).toBeInTheDocument();
    expect(counter(dialog)).toHaveTextContent("0 / 10");
  });

  it("a 404 on revoke takes the row away and says so", async () => {
    const { user, dialog } = await openDialog();
    getMockDb().apiKeys = []; // not this user's any more
    await user.click(within(dialog).getByRole("button", { name: "Revoke Default" }));
    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));
    await waitFor(() => expect(within(dialog).queryByText("mgc_Hnz3gjhh••••••••")).not.toBeInTheDocument());
    expect(await screen.findByText("That key isn't there any more")).toBeInTheDocument();
  });
});
