import { Notion } from "./notion";
import { prefs, resolveNotionToken } from "./prefs";

export class MissingToken extends Error {}

let client: Promise<Notion> | undefined;

/** One Notion client per command run, built from the token preference or the env file. */
export function notionClient(): Promise<Notion> {
  client ??= resolveNotionToken(prefs()).then((token) => {
    if (!token) {
      client = undefined;
      throw new MissingToken(
        "No Notion token. Set one in the extension preferences, or point the env file preference at a file with NOTION_API_KEY.",
      );
    }
    return new Notion(token);
  });
  return client;
}
