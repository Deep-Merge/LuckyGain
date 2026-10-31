import { applySyncedGoods } from "@/lib/db/client";
import { readSyncCatalog, readSyncRecords } from "./localGoods";
import { runGoodsSync, type SyncMessage, type SyncProgress } from "./protocol";

type SyncLink = {
  send: (message: SyncMessage) => Promise<void>;
  receive: () => Promise<SyncMessage>;
};

export async function syncConnectedPhone(
  link: SyncLink,
  onProgress?: (progress: SyncProgress) => void,
  lead = true,
) {
  return runGoodsSync({
    send: (message) => link.send(message),
    receive: () => link.receive(),
    lead,
    hello: { name: "computer", mtu: 23 },
    catalog: readSyncCatalog,
    records: readSyncRecords,
    apply: async (records) =>
      applySyncedGoods(
        records.map((record) => record.good),
        records.flatMap((record) => record.purse),
      ),
    onProgress,
  });
}
