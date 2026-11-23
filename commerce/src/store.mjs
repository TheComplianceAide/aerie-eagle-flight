import { TableClient } from '@azure/data-tables';

export function tableStore(endpoint, tableName, credential, partitionKey) {
  const table = new TableClient(endpoint, tableName, credential);
  return {
    async get(rowKey) {
      try {
        return await table.getEntity(partitionKey, rowKey);
      } catch (error) {
        if (error.statusCode === 404 && error.code !== 'TableNotFound') return null;
        throw error;
      }
    },
    async transaction(actions) {
      await table.submitTransaction(actions.map(([action, row]) => {
        const { etag, timestamp, ...data } = row;
        const entity = { ...data, partitionKey };
        if (action === 'replace') return ['update', entity, 'Replace', { etag }];
        return ['create', entity];
      }));
    },
    async *claims() {
      const filter = `PartitionKey eq '${partitionKey}' and RowKey ge 'claim:' and RowKey lt 'claim;'`;
      yield* table.listEntities({ queryOptions: { filter } });
    },
    async *pendingPurchaseMail(now) {
      const filter = `PartitionKey eq '${partitionKey}' and RowKey ge 'purchase-mail:' and RowKey lt 'purchase-mail;' and nextAt le ${now}.0`;
      yield* table.listEntities({ queryOptions: { filter } });
    }
  };
}

export function trafficTableStore(endpoint, credential) {
  const table = new TableClient(endpoint, 'AerieTraffic', credential, { retryOptions: { maxRetries: 1 } });
  return {
    async merge(row) {
      await table.upsertEntity(row, 'Merge', { abortSignal: AbortSignal.timeout(4000) });
    },
    async prune(cutoff) {
      const filter = `PartitionKey lt '${cutoff}'`;
      const abortSignal = AbortSignal.timeout(45_000);
      const pages = table.listEntities({ queryOptions: { filter, select: ['PartitionKey', 'RowKey'] }, abortSignal });
      let batches = 0;
      for await (const page of pages.byPage({ maxPageSize: 100 })) {
        const partitions = new Map();
        for (const row of page) {
          if (!partitions.has(row.partitionKey)) partitions.set(row.partitionKey, []);
          partitions.get(row.partitionKey).push(['delete', { partitionKey: row.partitionKey, rowKey: row.rowKey }]);
        }
        for (const actions of partitions.values()) await table.submitTransaction(actions, { abortSignal });
        if (++batches >= 100) break;
      }
    }
  };
}
