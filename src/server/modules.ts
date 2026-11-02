import { cache } from "react";
import { db } from "./db";
import { getSetting } from "./services/settings";
import { normaliseModules, type ModuleKey } from "@/lib/modules";

/** Enabled sections for this request (cached per request). */
export const enabledModules = cache(async (): Promise<ModuleKey[]> => normaliseModules(await getSetting(db, "modules.enabled")));
export const moduleOn = async (k: ModuleKey) => (await enabledModules()).includes(k);
