export interface KeyStrategy {
  /** Given an entity being saved, determine its partition key segment. */
  getPartitionKey(entityName: string, entity: Record<string, unknown>): string;

  /** Given filter criteria, return partition keys that could match. Empty array means all. */
  getRelevantKeys(entityName: string, filter?: Record<string, unknown>): string[];
}
