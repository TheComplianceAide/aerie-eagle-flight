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
