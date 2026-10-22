import type {
  Firestore,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

/**
 * Load only documents matching the given statuses (single-field indexes).
 * Avoids scanning retired / unrelated inventory.
 */
export async function getDocsByStatuses(
  db: Firestore,
  collectionName: string,
  statuses: string[],
  limitPerStatus = 400
): Promise<QueryDocumentSnapshot[]> {
  if (!statuses.length) return [];
  const snaps = await Promise.all(
    statuses.map((status) =>
      db
        .collection(collectionName)
        .where("status", "==", status)
        .limit(limitPerStatus)
        .get()
    )
  );
  return snaps.flatMap((snap) => snap.docs);
}

/** Aggregation count — ~1 read per 1,000 matching index entries. */
export async function countByStatuses(
  db: Firestore,
  collectionName: string,
  statuses: string[]
): Promise<number> {
  if (!statuses.length) return 0;
  const snaps = await Promise.all(
    statuses.map((status) =>
      db.collection(collectionName).where("status", "==", status).count().get()
    )
  );
  return snaps.reduce((sum, snap) => sum + snap.data().count, 0);
}
